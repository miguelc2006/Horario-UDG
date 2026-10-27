// api/_helpers/monitoreo.js
// Helper compartido para verificar cambios en NRCs monitoreados.
// Se usa desde:
//   - consultar-oferta.js  (cuando un usuario consulta la oferta)
//   - monitorear-cupos.js  (ejecución CRON periódica)
//
// Estrategia: recibir resultados ya scrapeados del SIIAU, cotejar contra
// monitoring-queue y disparar notificaciones si hay cambios de cupo.

import { enviarFCM } from './fcm.js';

/**
 * Verifica si los NRCs obtenidos en una consulta están siendo monitoreados
 * y dispara notificaciones si hay cambios (cupo disponible, horario, etc.).
 *
 * @param {Array<object>} resultados - Arreglo de materias desde SIIAU.
 *   Cada objeto debe tener: { nrc, disponibles, materia, clave, seccion, profesor, sesiones }
 * @param {object} params - Parámetros de la consulta: { ciclop, cup, majrp }
 * @param {object} admin - Instancia de Firebase Admin (ya inicializada)
 * @param {object} db - Firestore DB (obtenida de admin.firestore())
 * @returns {Promise<{ checked: number, notifications: number }>}
 */
export async function verificarNrcsMonitoreados(resultados, params, admin, db) {
    if (!resultados || resultados.length === 0) {
        return { checked: 0, notifications: 0 };
    }

    const { ciclop } = params;
    if (!ciclop) return { checked: 0, notifications: 0 };

    // 1. Extraer NRCs únicos de los resultados
    const nrcsUnicos = [...new Set(
        resultados.map(r => String(r.nrc).trim()).filter(Boolean)
    )];
    if (nrcsUnicos.length === 0) return { checked: 0, notifications: 0 };

    // 2. Construir nrcKeys (mismo formato que toggle-monitor.js: `${nrc}_${ciclop}`)
    const nrcKeys = nrcsUnicos.map(nrc => `${nrc}_${ciclop}`);

    let totalChecked = 0;
    let totalNotifications = 0;

    // 3. Consultar monitoring-queue en lotes de 10
    for (let i = 0; i < nrcKeys.length; i += 10) {
        const batchKeys = nrcKeys.slice(i, i + 10);

        const queueDocs = await Promise.all(
            batchKeys.map(key =>
                db.collection('monitoring-queue').doc(key).get().catch(() => null)
            )
        );

        for (let j = 0; j < queueDocs.length; j++) {
            const docSnap = queueDocs[j];
            if (!docSnap?.exists) continue;

            const queueData = docSnap.data();
            if (!queueData.subscribers || queueData.subscribers <= 0) continue;

            const nrc = queueData.nrc;
            if (!nrc) continue;

            totalChecked++;

            // 4. Buscar el resultado correspondiente en los datos scrapeados
            const resultado = resultados.find(r => String(r.nrc).trim() === nrc);
            if (!resultado) continue;

            const currentSeats = parseInt(resultado.disponibles, 10) || 0;
            const lastSeats = parseInt(queueData.lastSeats, 10) ?? -1;
            const sesionesJSON = JSON.stringify(resultado.sesiones || []);
            const lastData = queueData.lastData || '';
            const cambios = [];

            // 5. Comparar cupos
            if (lastSeats === -1) {
                cambios.push('initial');
            } else if (currentSeats > 0 && lastSeats <= 0) {
                cambios.push('seat_available');
            }

            // 6. Cambio de horario/profesor
            if (lastData && lastData !== sesionesJSON && lastData !== '') {
                cambios.push('schedule_change');
            }

            const cambiosRelevantes = cambios.filter(c => c !== 'initial');

            // 7. Notificar a suscriptores si hay cambios
            if (cambiosRelevantes.length > 0) {
                const notifiedUsers = new Set();

                try {
                    const subscribersSnapshot = await db.collectionGroup('monitored-courses')
                        .where('nrc', '==', String(nrc))
                        .get();

                    for (const subDoc of subscribersSnapshot.docs) {
                        const subData = subDoc.data();
                        const subscriberCycle = String(subData.ciclo || subData.ciclop || '').trim();
                        if (subscriberCycle !== String(ciclop).trim()) continue;

                        const userUid = subDoc.ref.path.split('/')[1];
                        if (notifiedUsers.has(userUid)) continue;
                        notifiedUsers.add(userUid);

                        // Preferencias del usuario
                        let prefs = { pushEnabled: true, seatAlerts: true, scheduleChanges: true };
                        try {
                            const prefsDoc = await db.doc(
                                `users/${userUid}/notificationPrefs/preferences`
                            ).get();
                            if (prefsDoc.exists) prefs = { ...prefs, ...prefsDoc.data() };
                        } catch { /* usar defaults */ }

                        if (!prefs.pushEnabled) continue;

                        let shouldNotify = false;
                        let title = '';
                        let body = '';
                        let notifType = '';

                        if (cambiosRelevantes.includes('seat_available') && prefs.seatAlerts !== false) {
                            shouldNotify = true;
                            notifType = 'seat_available';
                            title = '🎓 ¡Cupo disponible!';
                            body = `${resultado.materia} — NRC ${nrc} tiene ${currentSeats} lugar(es) disponible(s).`;
                        } else if (
                            cambiosRelevantes.includes('schedule_change') &&
                            subData.registered &&
                            prefs.scheduleChanges !== false
                        ) {
                            shouldNotify = true;
                            notifType = 'schedule_change';
                            title = '⚠️ Cambio de horario';
                            body = `${resultado.materia} — NRC ${nrc} ha modificado su horario o profesor.`;
                        }

                        if (!shouldNotify) continue;

                        const scheduleIds = subData.scheduleIds ||
                            (subData.scheduleId ? [subData.scheduleId] : []);
                        const scheduleId = scheduleIds.length > 0 ? scheduleIds[0] : null;

                        try {
                            await enviarFCM(userUid, { title, body }, {
                                type: notifType,
                                nrc: String(nrc),
                                materia: resultado.materia || '',
                                newValue: String(currentSeats),
                                scheduleId: scheduleId || '',
                            });

                            await db.collection(`users/${userUid}/notifications`).add({
                                type: notifType,
                                title,
                                body,
                                data: {
                                    nrc: String(nrc),
                                    materia: resultado.materia || '',
                                    newValue: String(currentSeats),
                                    scheduleId: scheduleId || '',
                                },
                                read: false,
                                clicked: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });

                            totalNotifications++;
                        } catch (err) {
                            console.error(
                                `[monitoreo] Error notificando a ${userUid}:`, err.message
                            );
                        }
                    }
                } catch (err) {
                    console.error(
                        `[monitoreo] Error consultando suscriptores NRC ${nrc}:`, err.message
                    );
                }
            }

            // 8. Actualizar cola con estado actual
            try {
                const nextCheckSeconds = Math.floor(
                    (Date.now() + (10 + Math.random() * 10) * 60000) / 1000
                );
                await docSnap.ref.update({
                    lastSeats: currentSeats,
                    lastData: sesionesJSON,
                    lastChecked: admin.firestore.FieldValue.serverTimestamp(),
                    nextCheck: new admin.firestore.Timestamp(nextCheckSeconds, 0),
                });
            } catch (err) {
                console.error(
                    `[monitoreo] Error actualizando queue para NRC ${nrc}:`, err.message
                );
            }
        }
    }

    return { checked: totalChecked, notifications: totalNotifications };
}

