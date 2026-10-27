// src/utils/authGuard.js
// Guardias de acceso construidas sobre la matriz de capacidades de perfil.

import {
    emailHasCapability,
    getProfileType,
    PROFILE_CAPABILITIES,
    PROFILE_TYPES,
} from './profileAccess.js';

/**
 * Alias compatible para operaciones de persistencia exclusivamente estudiantiles.
 * Los nuevos flujos deben preferir `emailHasCapability` para expresar la capacidad.
 *
 * @param {string | null | undefined} email Correo que se desea validar.
 * @returns {boolean} `true` para una cuenta de alumno.
 */
export function isEmailAuthorized(email) {
    return getProfileType(email) === PROFILE_TYPES.STUDENT;
}

/**
 * Indica si una cuenta puede guardar horarios personales en la nube.
 *
 * @param {string | null | undefined} email Correo que se desea validar.
 * @returns {boolean} Resultado de autorización.
 */
export function canUseCloudSchedules(email) {
    return emailHasCapability(email, PROFILE_CAPABILITIES.CLOUD_SCHEDULES);
}

/**
 * Indica si una cuenta puede crear, consultar y modificar sus evaluaciones.
 *
 * @param {string | null | undefined} email Correo que se desea validar.
 * @returns {boolean} Resultado de autorización.
 */
export function canManageRatings(email) {
    return emailHasCapability(email, PROFILE_CAPABILITIES.RATINGS);
}

/**
 * Indica si una cuenta puede usar monitoreo, FCM y preferencias asociadas.
 *
 * @param {string | null | undefined} email Correo que se desea validar.
 * @returns {boolean} Resultado de autorización.
 */
export function canUseNotifications(email) {
    return emailHasCapability(email, PROFILE_CAPABILITIES.NOTIFICATIONS);
}

/**
 * Indica si una cuenta puede actualizar la caché pública de profesores.
 *
 * @param {string | null | undefined} email Correo que se desea validar.
 * @returns {boolean} Resultado de autorización.
 */
export function canUpdateProfessorCache(email) {
    return emailHasCapability(email, PROFILE_CAPABILITIES.PROFESSOR_CACHE);
}

/**
 * Valida una capacidad concreta para el usuario autenticado.
 *
 * @param {{email?: string} | null | undefined} user Usuario de Firebase Auth.
 * @param {string} capability Capacidad requerida.
 * @throws {Error} Cuando falta autenticación o autorización.
 * @returns {true}
 */
export function requireCapability(user, capability) {
    if (!user) {
        const error = new Error('Debes iniciar sesión para realizar esta acción.');
        error.code = 'app/authentication-required';
        throw error;
    }

    if (!emailHasCapability(user.email, capability)) {
        const error = new Error('Tu tipo de perfil no tiene permiso para realizar esta acción.');
        error.code = 'app/profile-capability-required';
        throw error;
    }

    return true;
}

/**
 * Valida que el usuario sea alumno y pueda guardar horarios personales.
 * Se conserva por compatibilidad con los servicios de horarios existentes.
 *
 * @param {{email?: string} | null | undefined} user Usuario de Firebase Auth.
 * @returns {true}
 */
export function requireAuthorizedUser(user) {
    return requireCapability(user, PROFILE_CAPABILITIES.CLOUD_SCHEDULES);
}

/** Valida acceso a evaluaciones. */
export function requireRatingsAccess(user) {
    return requireCapability(user, PROFILE_CAPABILITIES.RATINGS);
}

/** Valida acceso a monitoreo y notificaciones. */
export function requireNotificationsAccess(user) {
    return requireCapability(user, PROFILE_CAPABILITIES.NOTIFICATIONS);
}

/**
 * Mensaje común presentado a las cuentas externas con acceso limitado.
 */
export const RESTRICTED_ACCOUNT_MESSAGE =
    'Tu sesión está activa en modo consulta. Las funciones disponibles dependen del tipo de perfil institucional asociado a tu correo.';
