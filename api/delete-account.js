// api/delete-account.js
// Eliminación de Firebase Auth con auditoría pseudonimizada server-side.

import { verifyRequestToken } from './_helpers/admin.js';
import { deleteAccountWithAudit } from './_helpers/accountAudit.js';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json',
};

const MAX_AUTH_AGE_SECONDS = 10 * 60;

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        return res.end();
    }
    if (req.method !== 'DELETE') {
        res.writeHead(405, headers);
        return res.end(JSON.stringify({ error: 'Método no permitido' }));
    }

    try {
        const decodedToken = await verifyRequestToken(req);
        const authAgeSeconds = Math.floor(Date.now() / 1000) - (decodedToken.auth_time || 0);
        if (authAgeSeconds > MAX_AUTH_AGE_SECONDS) {
            res.writeHead(401, headers);
            return res.end(JSON.stringify({
                error: 'Vuelve a autenticarte para eliminar la cuenta.',
                code: 'auth/requires-recent-login',
            }));
        }

        await deleteAccountWithAudit(decodedToken);
        res.writeHead(200, headers);
        return res.end(JSON.stringify({ success: true }));
    } catch (error) {
        console.error('[delete-account] Error:', error);
        const statusCode = error.statusCode || (error.code?.startsWith('auth/') ? 401 : 500);
        res.writeHead(statusCode, headers);
        return res.end(JSON.stringify({
            error: statusCode === 500 ? 'No se pudo eliminar la cuenta.' : error.message,
        }));
    }
}
