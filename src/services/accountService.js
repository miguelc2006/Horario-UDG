// src/services/accountService.js
// Sincronización idempotente del perfil interno y eliminación auditable de cuenta.

import { auth } from '../firebase/config';

async function authenticatedRequest(path, options = {}) {
    const user = auth.currentUser;
    if (!user) {
        const error = new Error('Debes iniciar sesión para realizar esta acción.');
        error.code = 'app/authentication-required';
        throw error;
    }

    const idToken = await user.getIdToken();
    const response = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
            ...options.headers,
        },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.error || 'No se pudo completar la operación de cuenta.');
        error.code = payload.code || `http/${response.status}`;
        throw error;
    }

    return payload;
}

/**
 * Crea o actualiza el perfil interno asociado a la sesión. El servidor genera
 * un único evento `account_registered` cuando detecta el primer inicio de sesión.
 *
 * @returns {Promise<{profileType:string, created:boolean}>} Perfil sincronizado.
 */
export async function syncAccountProfile() {
    return authenticatedRequest('/api/account-profile', { method: 'POST' });
}

/**
 * Solicita al servidor registrar la auditoría pseudonimizada y eliminar la
 * identidad de Firebase Auth. Debe llamarse después de una reautenticación
 * reciente para reducir el riesgo de eliminar una cuenta con sesión antigua.
 *
 * @returns {Promise<{success:boolean}>} Resultado confirmado por el servidor.
 */
export async function deleteAccountOnServer() {
    return authenticatedRequest('/api/delete-account', { method: 'DELETE' });
}
