// api/test-notify.js
// Endpoint de prueba para enviar notificaciones FCM manualmente
// Solo accesible por el propio usuario autenticado
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
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    };
}

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        return res.end();
    }
    if (req.method !== 'POST') {
        res.writeHead(405, { ...corsHeaders(), 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Método no permitido' }));
    }

    try {
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
        const db = admin.firestore();

        // Parámetros opcionales con defaults para pruebas
        const {
            title = '🎯 Notificación de prueba',
            body = 'Esta es una notificación de prueba del sistema de monitoreo.',
            type = 'test_notification',
            nrc = '00000',
            materia = 'Materia de prueba',
            scheduleId = '',
        } = req.body || {};

        const results = { push: null, history: null };

        // 1. Enviar push FCM (si hay tokens registrados)
        const tokensSnapshot = await db.collection(`users/${uid}/fcmTokens`).get();
        if (!tokensSnapshot.empty) {
            let pushSuccess = 0;
            let pushFailed = 0;
            const messaging = admin.messaging();

            for (const tokenDoc of tokensSnapshot.docs) {
                const { token } = tokenDoc.data();
                try {
                    await messaging.send({
                        token,
                        notification: { title, body },
                        data: { type, nrc, materia, scheduleId },
                        webpush: {
                            headers: { Urgency: 'high' },
                            notification: {
                                icon: '/icon-192.png',
                                badge: '/badge-96.png',
                                requireInteraction: true,
                                tag: `test-${Date.now()}`,
                            },
                            fcmOptions: {
                                link: scheduleId
                                    ? `/mis-horarios?edit=${scheduleId}${nrc ? `&nrc=${nrc}` : ''}`
                                    : nrc ? `/mis-horarios?nrc=${nrc}` : '/',
                            },
                        },
                    });
                    pushSuccess++;
                } catch (error) {
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        await tokenDoc.ref.delete();
                    }
                    pushFailed++;
                }
            }

            results.push = { success: pushSuccess, failed: pushFailed };
        } else {
            results.push = { success: 0, failed: 0, noTokens: true };
        }

        // 2. Guardar en historial de notificaciones del usuario
        const notifRef = await db.collection(`users/${uid}/notifications`).add({
            type,
            title,
            body,
            data: { nrc, materia, scheduleId },
            read: false,
            clicked: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results.history = { id: notifRef.id, saved: true };

        res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            success: true,
            message: `Notificación enviada: "${title}"`,
            results,
        }));
    } catch (error) {
        console.error('[test-notify] Error:', error.message);
        res.writeHead(500, { ...corsHeaders(), 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Error al enviar notificación de prueba', details: error.message }));
    }
}
