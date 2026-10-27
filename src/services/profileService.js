// src/services/profileService.js
// Servicio para operaciones de perfil de usuario:
// actualizar nombre, exportar datos, eliminar cuenta y todos sus datos en Firestore.

import { reauthenticateWithPopup } from 'firebase/auth';
import { auth, getDb, googleProvider } from '../firebase/config';
import { deleteAccountOnServer } from './accountService.js';

// ------------------------------------------------------------------
// Lazy Firestore modules (carga bajo demanda, igual que otros servicios)
// ------------------------------------------------------------------
let _firestore = null;
async function getFS() {
    if (!_firestore) {
        const db = await getDb();
        const mod = await import('firebase/firestore');
        _firestore = { db, ...mod };
    }
    return _firestore;
}

// ------------------------------------------------------------------
// Actualizar nombre de visualización del usuario
// ------------------------------------------------------------------
/**
 * Actualiza el displayName en Firebase Auth.
 * @param {object} user — Objeto de usuario de Firebase Auth
 * @param {string} newName — Nuevo nombre a establecer
 * @returns {Promise<boolean>}
 */
export async function updateDisplayName(user, newName) {
    if (!user) throw new Error('Usuario no autenticado');
    if (!newName || !newName.trim()) throw new Error('El nombre no puede estar vacío');
    const trimmed = newName.trim();
    if (trimmed.length > 100) throw new Error('El nombre es demasiado largo (máx. 100 caracteres)');

    const { updateProfile } = await import('firebase/auth');
    await updateProfile(user, { displayName: trimmed });
    return true;
}

// ------------------------------------------------------------------
// Obtener resumen de datos del usuario (para mostrar en la página)
// ------------------------------------------------------------------
/**
 * Cuenta cuántos documentos tiene el usuario en cada colección.
 * @param {string} userId
 * @param {{cloudSchedules?:boolean, ratings?:boolean, notifications?:boolean}} capabilities
 * @returns {Promise<{schedules:number, monitored:number, notifications:number, ratings:number}>}
 */
export async function getUserDataSummary(userId, capabilities = {}) {
    const { db, collection, query, where, getDocs } = await getFS();

    const countCollection = async (ref) => {
        try {
            const snap = await getDocs(ref);
            return snap.size;
        } catch {
            return 0;
        }
    };

    // Consultar exclusivamente las colecciones respaldadas por el perfil.
    const [schedules, monitored, notifications] = await Promise.all([
        capabilities.cloudSchedules
            ? countCollection(collection(db, 'users', userId, 'schedules'))
            : Promise.resolve(0),
        capabilities.notifications
            ? countCollection(collection(db, 'users', userId, 'monitored-courses'))
            : Promise.resolve(0),
        capabilities.notifications
            ? countCollection(collection(db, 'users', userId, 'notifications'))
            : Promise.resolve(0),
    ]);

    // ratings es colección top-level con campo userId
    let ratings = 0;
    if (capabilities.ratings) {
        try {
            const q = query(collection(db, 'ratings'), where('userId', '==', userId));
            ratings = await countCollection(q);
        } catch {
            // Si la regla no permite esta consulta, devolvemos 0
        }
    }

    return { schedules, monitored, notifications, ratings };
}

// ------------------------------------------------------------------
// Exportar todos los datos del usuario como JSON descargable
// ------------------------------------------------------------------
/**
 * Reúne todos los datos de Firestore del usuario y dispara descarga JSON.
 * @param {string} userId
 * @param {{cloudSchedules?:boolean, ratings?:boolean, notifications?:boolean}} capabilities
 * @returns {Promise<object>} — Los datos exportados (también descarga un archivo)
 */
export async function exportUserData(userId, capabilities = {}) {
    const { db, collection, query, where, getDocs, doc, getDoc } = await getFS();

    const getAllDocs = async (colRef) => {
        const snap = await getDocs(colRef);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    };

    // Recopilar datos
    const [schedules, monitored, notifications] = await Promise.all([
        capabilities.cloudSchedules
            ? getAllDocs(collection(db, 'users', userId, 'schedules')).catch(() => [])
            : Promise.resolve([]),
        capabilities.notifications
            ? getAllDocs(collection(db, 'users', userId, 'monitored-courses')).catch(() => [])
            : Promise.resolve([]),
        capabilities.notifications
            ? getAllDocs(collection(db, 'users', userId, 'notifications')).catch(() => [])
            : Promise.resolve([]),
    ]);

    // Ratings (top-level, filtrado por userId)
    let ratings = [];
    if (capabilities.ratings) {
        try {
            const q = query(collection(db, 'ratings'), where('userId', '==', userId));
            const snap = await getDocs(q);
            ratings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
            // Ignorar si la regla lo impide
        }
    }

    // Preferencias de notificación
    let notifPrefs = null;
    if (capabilities.notifications) {
        try {
            const prefsSnap = await getDoc(doc(db, 'users', userId, 'notificationPrefs', 'preferences'));
            if (prefsSnap.exists()) notifPrefs = prefsSnap.data();
        } catch {
            // Ignorar
        }
    }

    // Usuario info (sin sensibles)
    const user = auth.currentUser;
    const exportPayload = {
        exportDate: new Date().toISOString(),
        userId,
        user: {
            email: user?.email,
            displayName: user?.displayName,
        },
        notifPrefs,
        schedules,
        monitoredCourses: monitored,
        notifications,
        ratings,
    };

    // Descargar archivo JSON
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `horario-udg-datos-${userId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return exportPayload;
}

// ------------------------------------------------------------------
// Eliminar TODOS los datos del usuario en Firestore
// ------------------------------------------------------------------

/**
 * Elimina todos los documentos de una subcolección.
 */
async function deleteSubcollection(db, userId, collectionName) {
    const { collection, getDocs, writeBatch } = await getFS();
    const snap = await getDocs(collection(db, 'users', userId, collectionName));
    if (snap.empty) return 0;

    // Firestore batch limit es 500; para la mayoría de usuarios es suficiente
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}

/**
 * Elimina todos los ratings (colección top-level) del usuario.
 */
async function deleteUserRatings(db, userId) {
    const { collection, query, where, getDocs, writeBatch } = await getFS();
    const q = query(collection(db, 'ratings'), where('userId', '==', userId));
    const snap = await getDocs(q);
    if (snap.empty) return 0;

    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}

/**
 * Elimina todos los datos de Firestore del usuario.
 * Llamar ANTES de eliminar la cuenta de Auth.
 * @param {string} userId
 * @param {{cloudSchedules?:boolean, ratings?:boolean, notifications?:boolean}} capabilities
 * @returns {Promise<{schedules:number, monitored:number, notifications:number, ratings:number}>}
 */
export async function deleteAllUserData(userId, capabilities = {}) {
    const { db } = await getFS();

    const [schedules, monitored, notifications, ratings] = await Promise.all([
        capabilities.cloudSchedules
            ? deleteSubcollection(db, userId, 'schedules')
            : Promise.resolve(0),
        capabilities.notifications
            ? deleteSubcollection(db, userId, 'monitored-courses')
            : Promise.resolve(0),
        capabilities.notifications
            ? deleteSubcollection(db, userId, 'notifications')
            : Promise.resolve(0),
        capabilities.ratings
            ? deleteUserRatings(db, userId)
            : Promise.resolve(0),
    ]);

    if (capabilities.notifications) {
        // Limpiar tokens FCM si existen
        try {
            await deleteSubcollection(db, userId, 'fcmTokens');
        } catch {
            // Ignorar
        }

        // Limpiar preferencias de notificación
        try {
            const { doc, deleteDoc } = await getFS();
            await deleteDoc(doc(db, 'users', userId, 'notificationPrefs', 'preferences'));
        } catch {
            // Ignorar
        }
    }

    return { schedules, monitored, notifications, ratings };
}

// ------------------------------------------------------------------
// Re-autenticar usuario (requerido para operaciones sensibles)
// ------------------------------------------------------------------
/**
 * Re-autentica al usuario con Google. Se usa cuando Firebase requiere
 * una autenticación reciente para eliminar la cuenta.
 * @param {object} user — Objeto de usuario de Firebase Auth
 * @returns {Promise<boolean>}
 */
export async function reauthenticateUser(user) {
    if (!user) throw new Error('Usuario no autenticado');
    try {
        await reauthenticateWithPopup(user, googleProvider);
        return true;
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user') {
            throw new Error('Se cerró la ventana de autenticación. Intenta de nuevo.');
        }
        throw error;
    }
}

// ------------------------------------------------------------------
// Eliminar la cuenta completa del usuario
// ------------------------------------------------------------------
/**
 * Elimina la identidad mediante el endpoint confiable que registra auditoría.
 * Si la sesión no es reciente, reautentica con Google, fuerza un token nuevo y
 * reintenta una sola vez.
 *
 * @param {object} user Objeto de usuario de Firebase Auth.
 * @returns {Promise<boolean>} `true` cuando el servidor confirma la eliminación.
 */
export async function deleteAuthAccount(user) {
    if (!user) throw new Error('Usuario no autenticado');

    try {
        await deleteAccountOnServer();
        return true;
    } catch (error) {
        if (error.code === 'auth/requires-recent-login') {
            await reauthenticateUser(user);
            await user.getIdToken(true);
            await deleteAccountOnServer();
            return true;
        }
        throw error;
    }
}
