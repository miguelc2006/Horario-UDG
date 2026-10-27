// api/account-profile.js
// Sincroniza el perfil interno y crea el evento idempotente de registro.

import { verifyRequestToken } from './_helpers/admin.js';
import { syncInternalAccountProfile } from './_helpers/accountAudit.js';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json',
};

export default async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        return res.end();
    }
    if (req.method !== 'POST') {
        res.writeHead(405, headers);
        return res.end(JSON.stringify({ error: 'Método no permitido' }));
    }

    try {
        const decodedToken = await verifyRequestToken(req);
        const result = await syncInternalAccountProfile(decodedToken);
        res.writeHead(result.created ? 201 : 200, headers);
        return res.end(JSON.stringify(result));
    } catch (error) {
        console.error('[account-profile] Error detallado:', error.message || error);
        const statusCode = error.statusCode || (error.code?.startsWith('auth/') ? 401 : 500);
        res.writeHead(statusCode, headers);
        return res.end(JSON.stringify({
            error: process.env.NODE_ENV !== 'production' && statusCode === 500
                ? (error.message || 'No se pudo sincronizar el perfil interno.')
                : (statusCode === 500 ? 'No se pudo sincronizar el perfil interno.' : error.message),
        }));
    }
}
