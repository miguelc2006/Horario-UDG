// api/_helpers/accountAudit.js
// Primitivas server-side para perfiles internos y auditoría pseudonimizada.

import crypto from 'node:crypto';
import { getAdmin } from './admin.js';
import { getTokenEmailDomain, getTokenProfileType } from './authorization.js';

const PROFILE_COLLECTION = 'internal-account-profiles';
const AUDIT_COLLECTION = 'account-audit-events';

/**
 * Produce un identificador pseudónimo estable sin conservar el UID original.
 * En producción `AUDIT_HASH_SECRET` debe ser un secreto largo e independiente.
 *
 * @param {string} uid UID de Firebase Auth.
 * @returns {string} HMAC-SHA256 hexadecimal.
 */
export function hashAuditActor(uid) {
    const secret = process.env.AUDIT_HASH_SECRET;
    if (!secret) throw new Error('AUDIT_HASH_SECRET no configurada');
    return crypto.createHmac('sha256', secret).update(uid).digest('hex');
}

/**
 * Sincroniza un perfil interno y registra `account_registered` exactamente una
 * vez mediante una transacción. El perfil conserva el UID solo mientras existe
 * la cuenta y queda aislado de los clientes mediante Firestore Rules.
 *
 * @param {{uid:string,email?:string}} decodedToken Token verificado.
 * @returns {Promise<{profileType:string,created:boolean}>} Resultado de sincronización.
 */
export async function syncInternalAccountProfile(decodedToken) {
    const admin = getAdmin();
    const db = admin.firestore();
    const { uid } = decodedToken;
    const profileType = getTokenProfileType(decodedToken);
    const emailDomain = getTokenEmailDomain(decodedToken) || 'unknown';
    const actorHash = hashAuditActor(uid);
    const profileRef = db.collection(PROFILE_COLLECTION).doc(uid);
    const registrationEventRef = db.collection(AUDIT_COLLECTION).doc(`registered_${actorHash}`);

    let created = false;
    await db.runTransaction(async (transaction) => {
        const profileSnapshot = await transaction.get(profileRef);
        created = !profileSnapshot.exists;
        const now = admin.firestore.FieldValue.serverTimestamp();

        if (created) {
            transaction.create(profileRef, {
                profileType,
                emailDomain,
                status: 'active',
                createdAt: now,
                updatedAt: now,
                schemaVersion: 1,
            });
            transaction.create(registrationEventRef, {
                eventType: 'account_registered',
                actorHash,
                profileType,
                emailDomain,
                occurredAt: now,
                schemaVersion: 1,
            });
        } else {
            transaction.set(profileRef, {
                profileType,
                emailDomain,
                status: 'active',
                updatedAt: now,
            }, { merge: true });
        }
    });

    return { profileType, created };
}

/**
 * Elimina una identidad y deja un evento pseudonimizado idempotente. La
 * operación registra primero una intención pendiente, elimina Auth y después
 * confirma el evento; así ningún evento se presenta como completado antes de
 * que Firebase confirme la eliminación.
 *
 * @param {{uid:string,email?:string}} decodedToken Token verificado.
 * @returns {Promise<void>}
 */
export async function deleteAccountWithAudit(decodedToken) {
    const admin = getAdmin();
    const db = admin.firestore();
    const { uid } = decodedToken;
    const profileType = getTokenProfileType(decodedToken);
    const emailDomain = getTokenEmailDomain(decodedToken) || 'unknown';
    const actorHash = hashAuditActor(uid);
    const eventRef = db.collection(AUDIT_COLLECTION).doc(`deleted_${actorHash}`);
    const profileRef = db.collection(PROFILE_COLLECTION).doc(uid);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await eventRef.set({
        eventType: 'account_deleted',
        actorHash,
        profileType,
        emailDomain,
        status: 'pending',
        requestedAt: now,
        schemaVersion: 1,
    }, { merge: true });

    await admin.auth().deleteUser(uid);

    const batch = db.batch();
    batch.set(eventRef, {
        status: 'completed',
        occurredAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.delete(profileRef);
    await batch.commit();
}
