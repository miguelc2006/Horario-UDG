// api/_helpers/admin.js
// Inicialización compartida y perezosa de Firebase Admin.

import admin from 'firebase-admin';

/**
 * Obtiene la instancia única de Firebase Admin para una función serverless.
 * Acepta credenciales JSON o codificadas en base64.
 *
 * @returns {import('firebase-admin')} SDK inicializado.
 */
export function getAdmin() {
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

/**
 * Verifica y devuelve el token Bearer de una solicitud.
 *
 * @param {import('http').IncomingMessage} req Solicitud HTTP.
 * @returns {Promise<object>} Token decodificado.
 */
export async function verifyRequestToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        const error = new Error('Token de autenticación requerido');
        error.statusCode = 401;
        throw error;
    }

    return getAdmin().auth().verifyIdToken(authHeader.slice(7));
}
