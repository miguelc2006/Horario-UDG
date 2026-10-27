// api/toggle-monitor.js
// Activa/desactiva de forma atómica el monitoreo de un NRC y ciclo.
import { getAdmin } from './_helpers/admin.js';
import { isAuthorizedToken, sendRestrictedAccountResponse } from './_helpers/authorization.js';

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

/** Lee de forma segura el body o los query params del request */
async function parseRequestBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string' && req.body.trim()) {
        try { return JSON.parse(req.body); } catch { /* ignore */ }
    }
    // Para DELETE o POST donde el body no fue pre-parseado
    if (req.method === 'DELETE' || req.method === 'POST') {
        try {
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            if (chunks.length > 0) {
                const raw = Buffer.concat(chunks).toString('utf-8');
                return JSON.parse(raw);
            }
        } catch {
            /* ignore stream read error */
        }
    }
    return req.query || {};
}

/** Normaliza y valida identificadores usados como segmentos de documentos. */
function normalizeIdentifier(value, label, required = true) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        if (!required) return '';
        throw new TypeError(`${label} requerido`);
    }
    if (!/^[A-Za-z0-9-_]{1,50}$/.test(normalized)) {
        throw new TypeError(`${label} inválido`);
    }
    return normalized;
}

function queueKey(nrc, ciclo) {
    return ciclo ? `${nrc}_${ciclo}` : String(nrc);
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

        const parsedBody = await parseRequestBody(req);
        const queryParams = req.query || {};

        const nrcRaw = parsedBody.nrc || queryParams.nrc;
        const cicloRaw = parsedBody.ciclo || parsedBody.ciclop || parsedBody.horarioLabel || queryParams.ciclo || queryParams.ciclop;

        let nrc;
        let ciclo;
        try {
            nrc = normalizeIdentifier(nrcRaw, 'NRC', true);
            ciclo = normalizeIdentifier(cicloRaw, 'Ciclo', req.method === 'POST');
        } catch (error) {
            return sendJson(res, 400, { error: error.message });
        }

        const uid = decodedToken.uid;
        const db = firebaseAdmin.firestore();
        const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

        // -------------------------------------------------------------
        // POST: Activar monitoreo
        // -------------------------------------------------------------
        if (req.method === 'POST') {
            const courseRef = db.doc(`users/${uid}/monitored-courses/${queueKey(nrc, ciclo)}`);
            const legacyCourseRef = db.doc(`users/${uid}/monitored-courses/${nrc}`);
            const newQueueRef = db.doc(`monitoring-queue/${queueKey(nrc, ciclo)}`);
            const scheduleIds = normalizedScheduleIds(parsedBody);

            await db.runTransaction(async tx => {
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
                    materia: parsedBody.materia || '',
                    clave: parsedBody.clave || '',
                    profesor: parsedBody.profesor || '',
                    horarioLabel: parsedBody.horarioLabel || '',
                    cup: parsedBody.cup || '',
                    majrp: parsedBody.majrp || '',
                    registered: !!parsedBody.registered,
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
                        applyQueueDelta(tx, newQueueRef, newQueueSnapshot, 1, { nrc, ciclo, cup: parsedBody.cup, majrp: parsedBody.majrp }, now);
                    } else if (legacyQueueRef?.path === newQueueRef.path && legacySnapshot.exists) {
                        applyQueueDelta(tx, newQueueRef, newQueueSnapshot, newQueueSnapshot.exists ? 0 : 1, { nrc, ciclo, cup: parsedBody.cup, majrp: parsedBody.majrp }, now);
                    } else {
                        applyQueueDelta(tx, newQueueRef, newQueueSnapshot, 1, { nrc, ciclo, cup: parsedBody.cup, majrp: parsedBody.majrp }, now);
                    }
                } else if (!newQueueSnapshot.exists) {
                    applyQueueDelta(tx, newQueueRef, newQueueSnapshot, 1, { nrc, ciclo, cup: parsedBody.cup, majrp: parsedBody.majrp }, now);
                }
            });

            return sendJson(res, 200, { success: true, monitoring: true, nrc, ciclo });
        }

        // -------------------------------------------------------------
        // DELETE: Detener monitoreo
        // -------------------------------------------------------------
        let removed = false;
        await db.runTransaction(async tx => {
            const courseKey = ciclo ? queueKey(nrc, ciclo) : nrc;
            const courseRef = db.doc(`users/${uid}/monitored-courses/${courseKey}`);
            const legacyCourseRef = db.doc(`users/${uid}/monitored-courses/${nrc}`);

            // Obtener lecturas sin duplicar la misma referencia si coinciden
            const refsToRead = [courseRef];
            if (legacyCourseRef.path !== courseRef.path) {
                refsToRead.push(legacyCourseRef);
            }

            const snapshots = await Promise.all(refsToRead.map(ref => tx.get(ref)));
            const courseSnapshot = snapshots[0];
            const legacySnapshot = snapshots[1] || { exists: false };

            const targetSnapshot = courseSnapshot.exists ? courseSnapshot : (legacySnapshot.exists ? legacySnapshot : null);

            if (!targetSnapshot) {
                // El documento ya no existe, pero confirmamos el estado desactivado
                return;
            }

            const storedData = targetSnapshot.data() || {};
            const storedCycle = String(storedData.ciclo || storedData.ciclop || storedData.horarioLabel || ciclo || '').trim();
            const queueDocKey = queueKey(nrc, storedCycle);
            const storedQueueRef = queueDocKey ? db.doc(`monitoring-queue/${queueDocKey}`) : null;
            const storedQueueSnapshot = storedQueueRef ? await tx.get(storedQueueRef) : null;

            // Eliminar documento(s) del usuario
            if (courseSnapshot.exists) tx.delete(courseRef);
            if (legacySnapshot.exists && legacyCourseRef.path !== courseRef.path) tx.delete(legacyCourseRef);

            // Decrementar cola global si corresponde
            if (storedQueueRef && storedQueueSnapshot) {
                applyQueueDelta(
                    tx,
                    storedQueueRef,
                    storedQueueSnapshot,
                    -1,
                    { nrc, ciclo: storedCycle },
                    now
                );
            }
            removed = true;
        });

        return sendJson(res, 200, { success: true, monitoring: false, removed, nrc, ciclo });
    } catch (error) {
        console.error('[toggle-monitor] Error:', error.message || error);
        return sendJson(res, 500, { error: error.message || 'Error al cambiar monitoreo' });
    }
}
