// api/_helpers/authorization.js
// Clasificación y capacidades para endpoints Firebase Admin.

export const PROFILE_TYPES = Object.freeze({
    STUDENT: 'student',
    ACADEMIC: 'academic',
    EXTERNAL: 'external',
});

const PROFILE_BY_DOMAIN = Object.freeze({
    'alumnos.udg.mx': PROFILE_TYPES.STUDENT,
    'academicos.udg.mx': PROFILE_TYPES.ACADEMIC,
});

/**
 * Extrae el dominio normalizado del token verificado.
 *
 * @param {{email?: string}} decodedToken Token de Firebase Auth.
 * @returns {string | null} Dominio o `null`.
 */
export function getTokenEmailDomain(decodedToken) {
    const email = decodedToken?.email;
    if (typeof email !== 'string') return null;
    const normalized = email.trim().toLowerCase();
    const separatorIndex = normalized.lastIndexOf('@');
    if (separatorIndex <= 0 || separatorIndex === normalized.length - 1) return null;
    return normalized.slice(separatorIndex + 1);
}

/**
 * Clasifica una identidad autenticada sin confiar en datos enviados por cliente.
 *
 * @param {{email?: string}} decodedToken Token de Firebase Auth.
 * @returns {'student'|'academic'|'external'} Tipo interno.
 */
export function getTokenProfileType(decodedToken) {
    return PROFILE_BY_DOMAIN[getTokenEmailDomain(decodedToken)] || PROFILE_TYPES.EXTERNAL;
}

/**
 * Autoriza capacidades de notificaciones, ratings y caché compartidas por
 * alumnos y académicos. Se conserva el nombre por compatibilidad con APIs.
 *
 * @param {{email?: string}} decodedToken Token de Firebase Auth.
 * @returns {boolean} `true` para perfiles institucionales habilitados.
 */
export function isAuthorizedToken(decodedToken) {
    const profileType = getTokenProfileType(decodedToken);
    return profileType === PROFILE_TYPES.STUDENT || profileType === PROFILE_TYPES.ACADEMIC;
}

/** Autoriza almacenamiento de horarios, exclusivo de alumnos. */
export function canTokenUseCloudSchedules(decodedToken) {
    return getTokenProfileType(decodedToken) === PROFILE_TYPES.STUDENT;
}

/** Envía HTTP 403 para una cuenta sin la capacidad requerida. */
export function sendRestrictedAccountResponse(res, headers = {}) {
    res.writeHead(403, { ...headers, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
        error: 'Esta función requiere un correo @alumnos.udg.mx o @academicos.udg.mx.',
        code: 'profile-capability-required',
    }));
}
