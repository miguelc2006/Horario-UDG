// api/fcm-register.js
// Registra/actualiza token FCM de un usuario autenticado
import admin from 'firebase-admin';
import { isAuthorizedToken, sendRestrictedAccountResponse } from './_helpers/authorization.js';

// Inicializar Firebase Admin si no está listo
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
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };
}

export default async function handler(req, res) {
    // CORS
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        return res.end();
    }
    if (req.method !== 'POST') {
        res.writeHead(405, { ...corsHeaders(), 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Método no permitido' }));
    }

    try {
        // Verificar auth token
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.writeHead(401, { ...corsHeaders(), 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Token de autenticación requerido' }));
        }

        const idToken = authHeader.split('Bearer ')[1];
        const admin = getAdmin();
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (!isAuthorizedToken(decodedToken)) {
            return sendRestrictedAccountResponse(res, corsHeaders());
        }
        const uid = decodedToken.uid;

        const { token, userAgent } = req.body || {};
        if (!token) {
            res.writeHead(400, { ...corsHeaders(), 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Token FCM requerido' }));
        }

        // Hash del token como ID del documento
        const crypto = await import('crypto');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const db = admin.firestore();
        const tokenRef = db.doc(`users/${uid}/fcmTokens/${tokenHash}`);
        const tokenDoc = await tokenRef.get();

        if (tokenDoc.exists) {
            // Actualizar lastUsed
            await tokenRef.update({
                lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            // Crear nuevo token (máx 7 por usuario)
            const tokensSnapshot = await db.collection(`users/${uid}/fcmTokens`).get();
            if (tokensSnapshot.size >= 7) {
                // Eliminar el más antiguo
                let oldest = null;
                tokensSnapshot.forEach(d => {
                    if (!oldest || (d.data().lastUsed?.toDate() || 0) < (oldest.data().lastUsed?.toDate() || 0)) {
                        oldest = d;
                    }
                });
                if (oldest) await oldest.ref.delete();
            }

            await tokenRef.set({
                token,
                userAgent: userAgent || '',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Asegurar que notificationPrefs exista
        const prefsRef = db.doc(`users/${uid}/notificationPrefs/preferences`);
        const prefsDoc = await prefsRef.get();
        if (!prefsDoc.exists) {
            await prefsRef.set({
                pushEnabled: true,
                seatAlerts: true,
                scheduleChanges: true,
            });
        }

        res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, registered: true }));
    } catch (error) {
        console.error('[fcm-register] Error:', error.message);
        res.writeHead(500, { ...corsHeaders(), 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Error al registrar token FCM' }));
    }
}
