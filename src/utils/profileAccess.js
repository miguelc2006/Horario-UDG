// src/utils/profileAccess.js
// Clasificación interna de perfiles y matriz explícita de capacidades.

/** @typedef {'student' | 'academic' | 'external'} ProfileType */

export const PROFILE_TYPES = Object.freeze({
    STUDENT: 'student',
    ACADEMIC: 'academic',
    EXTERNAL: 'external',
});

export const PROFILE_CAPABILITIES = Object.freeze({
    CLOUD_SCHEDULES: 'cloudSchedules',
    RATINGS: 'ratings',
    NOTIFICATIONS: 'notifications',
    PROFESSOR_CACHE: 'professorCache',
});

const PROFILE_DOMAINS = Object.freeze({
    'alumnos.udg.mx': PROFILE_TYPES.STUDENT,
    'academicos.udg.mx': PROFILE_TYPES.ACADEMIC,
});

const CAPABILITIES_BY_PROFILE = Object.freeze({
    [PROFILE_TYPES.STUDENT]: Object.freeze([
        PROFILE_CAPABILITIES.CLOUD_SCHEDULES,
        PROFILE_CAPABILITIES.RATINGS,
        PROFILE_CAPABILITIES.NOTIFICATIONS,
        PROFILE_CAPABILITIES.PROFESSOR_CACHE,
    ]),
    [PROFILE_TYPES.ACADEMIC]: Object.freeze([
        PROFILE_CAPABILITIES.RATINGS,
        PROFILE_CAPABILITIES.NOTIFICATIONS,
        PROFILE_CAPABILITIES.PROFESSOR_CACHE,
    ]),
    [PROFILE_TYPES.EXTERNAL]: Object.freeze([]),
});

/**
 * Extrae y normaliza el dominio de un correo.
 *
 * @param {string | null | undefined} email Correo a analizar.
 * @returns {string | null} Dominio normalizado o `null` cuando el correo es inválido.
 */
export function getEmailDomain(email) {
    if (typeof email !== 'string') return null;

    const normalizedEmail = email.trim().toLowerCase();
    const separatorIndex = normalizedEmail.lastIndexOf('@');
    if (separatorIndex <= 0 || separatorIndex === normalizedEmail.length - 1) return null;

    return normalizedEmail.slice(separatorIndex + 1);
}

/**
 * Clasifica internamente una cuenta según su dominio institucional.
 *
 * @param {string | null | undefined} email Correo de Firebase Auth.
 * @returns {ProfileType} Tipo de perfil interno.
 */
export function getProfileType(email) {
    const domain = getEmailDomain(email);
    return PROFILE_DOMAINS[domain] || PROFILE_TYPES.EXTERNAL;
}

/**
 * Comprueba si un tipo de perfil posee una capacidad concreta.
 *
 * @param {ProfileType} profileType Tipo de perfil interno.
 * @param {string} capability Capacidad definida en `PROFILE_CAPABILITIES`.
 * @returns {boolean} `true` cuando la operación está habilitada.
 */
export function profileHasCapability(profileType, capability) {
    return CAPABILITIES_BY_PROFILE[profileType]?.includes(capability) || false;
}

/**
 * Comprueba una capacidad directamente a partir del correo.
 *
 * @param {string | null | undefined} email Correo a evaluar.
 * @param {string} capability Capacidad requerida.
 * @returns {boolean} Resultado de autorización.
 */
export function emailHasCapability(email, capability) {
    return profileHasCapability(getProfileType(email), capability);
}

/**
 * Devuelve la etiqueta de interfaz correspondiente al perfil.
 *
 * @param {ProfileType} profileType Tipo de perfil interno.
 * @returns {string} Etiqueta legible en español.
 */
export function getProfileTypeLabel(profileType) {
    if (profileType === PROFILE_TYPES.STUDENT) return 'Alumno UDG';
    if (profileType === PROFILE_TYPES.ACADEMIC) return 'Académico UDG';
    return 'Cuenta Google · Solo consulta';
}
