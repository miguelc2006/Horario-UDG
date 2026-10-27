// api/_helpers/fcm.js
// Helper para enviar notificaciones FCM usando Firebase Admin SDK
import admin from 'firebase-admin';

/**
 * Inicializa Firebase Admin si no está iniciado ya.
 * Usa variable de entorno FIREBASE_ADMIN_CREDENTIALS (JSON base64).
 */
function getAdmin() {
    if (admin.apps.length === 0) {
        const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
        if (!raw) {
            throw new Error('FIREBASE_ADMIN_CREDENTIALS no configurada en variables de entorno');
        }
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

/**
 * Envía notificaciones FCM a todos los tokens activos de un usuario.
 * @param {string} uid - UID del usuario en Firebase Auth
 * @param {object} notification - { title, body }
 * @param {object} data - Datos adicionales (nrc, materia, type, etc.)
 * @returns {Promise<{ success: number, failed: number }>}
 */
export async function enviarFCM(uid, notification, data) {
    const admin = getAdmin();
    const { db, collection, getDocs, doc, deleteDoc } = await getFirestoreModules();
    
    const tokensRef = collection(db, 'users', uid, 'fcmTokens');
    const snapshot = await getDocs(tokensRef);
    
    if (snapshot.empty) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;
    const messaging = admin.messaging();

    for (const tokenDoc of snapshot.docs) {
        const { token } = tokenDoc.data();
        try {
            await messaging.send({
                token,
                notification,
                data: data || {},
                webpush: {
                    headers: { Urgency: 'high' },
                    notification: {
                        icon: '/icon-192.png',
                        badge: '/badge-96.png',
                        requireInteraction: true,
                        tag: data?.nrc || 'general',
                    },
                    fcmOptions: {
                        link: data?.scheduleId 
                            ? `/mis-horarios?edit=${data.scheduleId}${data.nrc ? `&nrc=${data.nrc}` : ''}`
                            : data?.nrc 
                                ? `/mis-horarios?nrc=${data.nrc}` 
                                : '/',
                    },
                },
            });
            success++;
        } catch (error) {
            // Si el token es inválido, lo eliminamos
            if (error.code === 'messaging/invalid-registration-token' ||
                error.code === 'messaging/registration-token-not-registered') {
                await deleteDoc(doc(db, 'users', uid, 'fcmTokens', tokenDoc.id));
            }
            failed++;
        }
    }

    return { success, failed };
}

/**
 * Obtiene todos los tokens FCM activos de un usuario.
 * @param {string} uid
 * @returns {Promise<string[]>}
 */
export async function getTokensDeUsuario(uid) {
    const { db, collection, getDocs } = await getFirestoreModules();
    const tokensRef = collection(db, 'users', uid, 'fcmTokens');
    const snapshot = await getDocs(tokensRef);
    return snapshot.docs.map(d => d.data().token).filter(Boolean);
}

// Firestore lazy loader (misma estrategia que el frontend)
let _firestore = null;
async function getFirestoreModules() {
    if (!_firestore) {
        const admin = getAdmin();
        _firestore = {
            db: admin.firestore(),
            collection: (db, ...args) => db.collection(args.join('/')),
            getDocs: async (ref) => {
                const snap = await ref.get();
                return {
                    empty: snap.empty,
                    docs: snap.docs.map(d => ({
                        id: d.id,
                        data: () => d.data(),
                    })),
                };
            },
            doc: (db, ...args) => db.doc(args.join('/')),
            deleteDoc: async (ref) => { await ref.delete(); },
            setDoc: async (ref, data) => { await ref.set(data, { merge: true }); },
            runTransaction: async (fn) => {
                return admin.firestore().runTransaction(fn);
            },
            increment: (n) => admin.firestore.FieldValue.increment(n || 1),
            serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
        };
    }
    return _firestore;
}
