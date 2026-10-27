// api/toggle-monitor.js
// Activa/desactiva de forma atómica el monitoreo de un NRC y ciclo.
import admin from 'firebase-admin';
import { isAuthorizedToken, sendRestrictedAccountResponse } from './_helpers/authorization.js';

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

function corsHeaders() {
    return {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };
}

function sendJson(res, status, body) {
    res.writeHead(status, { ...corsHeaders(), 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(body));
}

/** Normaliza y valida identificadores usados como segmentos de documentos. */
function normalizeIdentifier(value, label) {
    const normalized = String(value || '').trim();
    if (!/^[A-Za-z0-9-]{1,40}$/.test(normalized)) {
        throw new TypeError(`${label} inválido`);
    }
    return normalized;
}

function queueKey(nrc, ciclo) {
    return `${nrc}_${ciclo}`;
}

function normalizedScheduleIds(body) {
    const candidates = Array.isArray(body.scheduleIds)
        ? body.scheduleIds
        : (body.scheduleId ? [body.scheduleId] : []);
    return [...new Set(candidates.map(value => String(value || '').trim()).filter(Boolean))].slice(0, 50);
}

/**
 * Aplica un incremento o decremento sobre una cola previamente leída.
 * Al llegar a cero elimina la entrada para evitar trabajos huérfanos.
 */
function applyQueueDelta(tx, ref, snapshot, delta, data, now) {
    const current = snapshot.exists ? Number(snapshot.data().subscribers || 0) : 0;
    const subscribers = Math.max(0, current + delta);

    if (subscribers === 0) {
        if (snapshot.exists) tx.delete(ref);
        return;
    }

    if (snapshot.exists) {
        tx.update(ref, {
            subscribers,
            cup: data.cup || snapshot.data().cup || '',
            majrp: data.majrp || snapshot.data().majrp || '',
            nextCheck: now,
        });
        return;
    }

    tx.set(ref, {
        nrc: data.nrc,
        ciclo: data.ciclo,
        ciclop: data.ciclo,
        cup: data.cup || '',
        majrp: data.majrp || '',
        subscribers,
        lastSeats: -1,
        lastData: '',
        lastChecked: null,
        nextCheck: now,
    });
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        return res.end();
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return sendJson(res, 401, { error: 'Token de autenticación requerido' });
        }

        const idToken = authHeader.slice('Bearer '.length);
        const firebaseAdmin = getAdmin();
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        if (!isAuthorizedToken(decodedToken)) {
            return sendRestrictedAccountResponse(res, corsHeaders());
        }

        if (req.method !== 'POST' && req.method !== 'DELETE') {
            return sendJson(res, 405, { error: 'Método no permitido' });
        }

        let nrc;
        let ciclo;
        try {
            nrc = normalizeIdentifier(req.body?.nrc, 'NRC');
            ciclo = normalizeIdentifier(req.body?.ciclo, 'Ciclo');
        } catch (error) {
            return sendJson(res, 400, { error: error.message });
        }

        const uid = decodedToken.uid;
        const db = firebaseAdmin.firestore();
        const courseRef = db.doc(`users/${uid}/monitored-courses/${queueKey(nrc, ciclo)}`);
        const legacyCourseRef = db.doc(`users/${uid}/monitored-courses/${nrc}`);
        const newQueueRef = db.doc(`monitoring-queue/${queueKey(nrc, ciclo)}`);
        const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

        if (req.method === 'POST') {
            const body = req.body || {};
            const scheduleIds = normalizedScheduleIds(body);

            await db.runTransaction(async tx => {
                // Firestore exige completar todas las lecturas antes de escribir.
                const [courseSnapshot, legacySnapshot, newQueueSnapshot] = await Promise.all([
                    tx.get(courseRef),
                    tx.get(legacyCourseRef),
                    tx.get(newQueueRef),
                ]);

                const legacyData = legacySnapshot.exists ? legacySnapshot.data() : null;
                const legacyCycle = String(legacyData?.ciclo || legacyData?.ciclop || legacyData?.horarioLabel || '').trim();
                const legacyQueueRef = legacyCycle
                    ? db.doc(`monitoring-queue/${queueKey(nrc, legacyCycle)}`)
                    : null;
                const legacyQueueSnapshot = legacyQueueRef && legacyQueueRef.path !== newQueueRef.path
                    ? await tx.get(legacyQueueRef)
                    : null;

                const existingData = courseSnapshot.exists ? courseSnapshot.data() : legacyData;
                tx.set(courseRef, {
                    nrc,
                    ciclo,
                    materia: body.materia || '',
                    clave: body.clave || '',
                    profesor: body.profesor || '',
                    horarioLabel: body.horarioLabel || '',
                    cup: body.cup || '',
                    majrp: body.majrp || '',
                    registered: !!body.registered,
                    lastSeats: existingData?.lastSeats ?? -1,
                    lastSessions: existingData?.lastSessions || '',
                    scheduleIds,
                    scheduleId: scheduleIds[0] || null,
                    createdAt: existingData?.createdAt || now,
                    updatedAt: now,
                });

                if (legacySnapshot.exists) tx.delete(legacyCourseRef);

                if (!courseSnapshot.exists) {
                    if (legacyQueueSnapshot) {
                        applyQueueDelta(tx, legacyQueueRef, legacyQueueSnapshot, -1, { nrc, ciclo }, now);
                        applyQueueDelta(tx, newQueueRef, newQueueSnapshot, 1, { nrc, ciclo, cup: body.cup, majrp: body.majrp }, now);
                    } else if (legacyQueueRef?.path === newQueueRef.path && legacySnapshot.exists) {
                        // La suscripción antigua ya estaba contabilizada en la cola correcta.
                        applyQueueDelta(tx, newQueueRef, newQueueSnapshot, newQueueSnapshot.exists ? 0 : 1, { nrc, ciclo, cup: body.cup, majrp: body.majrp }, now);
                    } else {
                        applyQueueDelta(tx, newQueueRef, newQueueSnapshot, 1, { nrc, ciclo, cup: body.cup, majrp: body.majrp }, now);
                    }
                } else if (!newQueueSnapshot.exists) {
                    // Repara una cola faltante sin duplicar suscriptores existentes.
                    applyQueueDelta(tx, newQueueRef, newQueueSnapshot, 1, { nrc, ciclo, cup: body.cup, majrp: body.majrp }, now);
                }
            });

            return sendJson(res, 200, { success: true, monitoring: true, nrc, ciclo });
        }

        let removed = false;
        await db.runTransaction(async tx => {
            const [courseSnapshot, legacySnapshot] = await Promise.all([
                tx.get(courseRef),
                tx.get(legacyCourseRef),
            ]);
            const storedSnapshot = courseSnapshot.exists ? courseSnapshot : legacySnapshot;
            if (!storedSnapshot.exists) return;

            const storedData = storedSnapshot.data();
            const storedCycle = String(storedData.ciclo || storedData.ciclop || storedData.horarioLabel || ciclo).trim();
            const storedQueueRef = db.doc(`monitoring-queue/${queueKey(nrc, storedCycle)}`);
            const storedQueueSnapshot = await tx.get(storedQueueRef);

            tx.delete(storedSnapshot.ref);
            applyQueueDelta(
                tx,
                storedQueueRef,
                storedQueueSnapshot,
                -1,
                { nrc, ciclo: storedCycle },
                now
            );
            removed = true;
        });

        return sendJson(res, 200, { success: true, monitoring: false, removed, nrc, ciclo });
    } catch (error) {
        console.error('[toggle-monitor] Error:', error.message);
        return sendJson(res, 500, { error: 'Error al cambiar monitoreo' });
    }
}
