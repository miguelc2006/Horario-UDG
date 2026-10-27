// api/monitorear-cupos.js
// CRON job de Vercel — ejecutado cada 15 min para monitorear cupos SIIAU
// Lee monitoring-queue, consulta SIIAU, compara cambios, notifica vía FCM
import admin from 'firebase-admin';
import { consultarNrc } from './_helpers/siiau.js';
import { enviarFCM } from './_helpers/fcm.js';

function getAdmin() {
    if (admin.apps.length === 0) {
        const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
        if (!raw) throw new Error('FIREBASE_ADMIN_CREDENTIALS no configurada');
        let credentials;
        try {
            credentials = JSON.parse(raw);
        } catch {
            credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'));
        }
        admin.initializeApp({
            credential: admin.credential.cert(credentials),
            projectId: process.env.FIREBASE_PROJECT_ID || credentials.project_id,
        });
    }
    return admin;
}

// Límites según plan de implementación
const MAX_CONSULTAS_POR_EJECUCION = process.env.VERCEL_ENV === 'production' ? 5 : 2;
const MIN_INTERVALO_MINUTOS = 10;

export default async function handler(req, res) {
    // Verificar CRON secret (opcional, para seguridad)
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    try {
        const admin = getAdmin();
        const db = admin.firestore();
        const now = admin.firestore.Timestamp.now();

        // Obtener hora en la zona horaria de Guadalajara (America/Mexico_City, UTC-6)
        const formatter = new Intl.DateTimeFormat('es-MX', {
            timeZone: 'America/Mexico_City',
            hour: 'numeric',
            hour12: false,
        });
        const parts = formatter.formatToParts(new Date());
        const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);

        // Solo ejecutar en ventana 7am-11pm (hora local de Guadalajara), incluidos domingos
        if (hour < 7 || hour >= 23) {
            return res.status(200).json({ 
                message: 'Fuera de ventana de monitoreo', 
                skipped: true,
                timezone: 'America/Mexico_City',
                localHour: hour,
            });
        }

        // 1. Leer cola: NRCs con nextCheck <= now
        const queueSnapshot = await db.collection('monitoring-queue')
            .where('nextCheck', '<=', now)
            .where('subscribers', '>', 0)
            .limit(MAX_CONSULTAS_POR_EJECUCION)
            .get();

        if (queueSnapshot.empty) {
            return res.status(200).json({ 
                message: 'No hay NRCs pendientes de revisión',
                checked: 0 
            });
        }

        const results = [];
        for (const queueDoc of queueSnapshot.docs) {
            const queueData = queueDoc.data();
            const { nrc, ciclop, cup, majrp, lastSeats, lastData } = queueData;

            try {
                // 2. Consultar SIIAU
                const data = await consultarNrc(nrc, ciclop, cup, majrp);
                
                if (!data) {
                    // NRC no encontrado en SIIAU — mantener último estado conocido
                    results.push({ nrc, status: 'not_found' });
                    await queueDoc.ref.update({
                        lastChecked: now,
                        nextCheck: new admin.firestore.Timestamp(
                            Math.floor((Date.now() + (MIN_INTERVALO_MINUTOS + Math.random() * 10) * 60000) / 1000),
                            0
                        ),
                    });
                    continue;
                }

                const currentSeats = data.disponibles;
                const currentSessionsJSON = JSON.stringify(data.sesiones);
                const cambios = [];

                // 3. Comparar cupos
                if (lastSeats === -1) {
                    // Primera consulta — solo registrar
                    cambios.push('initial');
                } else if (currentSeats > 0 && lastSeats <= 0) {
                    cambios.push('seat_available');
                }

                // 4. Comparar sesiones/profesor
                if (lastData && lastData !== currentSessionsJSON) {
                    cambios.push('schedule_change');
                }

                // 5. Si hay cambios relevantes, notificar a subscribers
                if (cambios.length > 0 && !(cambios.length === 1 && cambios[0] === 'initial')) {
                    // Firestore filtra por NRC; la verificación explícita de ciclo
                    // evita alertas cruzadas sin exigir un índice compuesto nuevo.
                    const subscribersSnapshot = await db.collectionGroup('monitored-courses')
                        .where('nrc', '==', String(nrc))
                        .get();

                    const notifiedUsers = new Set();
                    for (const subDoc of subscribersSnapshot.docs) {
                        const subData = subDoc.data();
                        const subscriberCycle = String(subData.ciclo || subData.ciclop || '').trim();
                        if (subscriberCycle !== String(ciclop || '').trim()) continue;

                        const userUid = subDoc.ref.path.split('/')[1];
                        if (notifiedUsers.has(userUid)) continue;
                        notifiedUsers.add(userUid);

                        // Verificar preferencias del usuario
                        const prefsDoc = await db.doc(`users/${userUid}/notificationPrefs/preferences`).get();
                        const prefs = prefsDoc.data() || { pushEnabled: true, seatAlerts: true, scheduleChanges: true };
                        
                        if (!prefs.pushEnabled) continue;

                        let shouldNotify = false;
                        let title = '';
                        let body = '';
                        let notifType = '';

                        if (cambios.includes('seat_available') && prefs.seatAlerts !== false) {
                            shouldNotify = true;
                            notifType = 'seat_available';
                            title = '🎓 ¡Cupo disponible!';
                            body = `${data.materia} — NRC ${nrc} tiene ${currentSeats} lugar(es) disponible(s).`;
                        } else if (cambios.includes('schedule_change') && subData.registered && prefs.scheduleChanges !== false) {
                            shouldNotify = true;
                            notifType = 'schedule_change';
                            title = '⚠️ Cambio de horario';
                            body = `${data.materia} — NRC ${nrc} ha modificado su horario o profesor.`;
                        }

                        if (shouldNotify) {
                            // Obtener scheduleId del documento de monitoreo
                            const scheduleIds = subData.scheduleIds || (subData.scheduleId ? [subData.scheduleId] : []);
                            const scheduleId = scheduleIds.length > 0 ? scheduleIds[0] : null;

                            await enviarFCM(userUid, { title, body }, {
                                type: notifType,
                                nrc: String(nrc),
                                materia: data.materia,
                                newValue: String(currentSeats),
                                scheduleId: scheduleId || '',
                            });

                            // Guardar en historial de notificaciones
                            await db.collection(`users/${userUid}/notifications`).add({
                                type: notifType,
                                title,
                                body,
                                data: {
                                    nrc: String(nrc),
                                    materia: data.materia,
                                    newValue: String(currentSeats),
                                    scheduleId: scheduleId || '',
                                },
                                read: false,
                                clicked: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                        }
                    }
                }

                // 6. Actualizar cola
                const nextCheckSeconds = Math.floor(
                    (Date.now() + (MIN_INTERVALO_MINUTOS + Math.random() * 10) * 60000) / 1000
                );
                await queueDoc.ref.update({
                    lastSeats: currentSeats,
                    lastData: currentSessionsJSON,
                    lastChecked: now,
                    nextCheck: new admin.firestore.Timestamp(nextCheckSeconds, 0),
                });

                results.push({ 
                    nrc, 
                    status: 'ok', 
                    cambios: cambios.filter(c => c !== 'initial'),
                    seats: currentSeats 
                });

            } catch (error) {
                console.error(`[monitorear-cupos] Error procesando NRC ${nrc}:`, error.message);
                results.push({ nrc, status: 'error', error: error.message });
                
                // En caso de error, reprogramar con backoff
                const backoffSeconds = Math.floor((Date.now() + 30 * 60000) / 1000);
                await queueDoc.ref.update({
                    lastChecked: now,
                    nextCheck: new admin.firestore.Timestamp(backoffSeconds, 0),
                });
            }
        }

        return res.status(200).json({
            message: `Procesados ${results.length} NRCs`,
            checked: results.length,
            results,
        });

    } catch (error) {
        console.error('[monitorear-cupos] Error general:', error.message);
        return res.status(500).json({ error: 'Error en monitoreo', details: error.message });
    }
}
