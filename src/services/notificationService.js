// src/services/notificationService.js
// Servicio principal para Firebase Cloud Messaging (FCM)
// Gestiona permisos, tokens, registro backend y escucha de mensajes

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { getApp } from "firebase/app";
import { auth, getDb } from "../firebase/config";
import {
    canUseNotifications,
    requireNotificationsAccess,
} from "../utils/authGuard";

let _messaging = null;
let _serviceWorkerRegistration = null;
let _fcmInitPromise = null;

/**
 * Comprueba si el navegador dispone de las API necesarias para FCM web.
 * @returns {boolean} `true` cuando Notification y Service Worker están disponibles.
 */
export function isNotificationSupported() {
    return typeof window !== 'undefined'
        && 'Notification' in window
        && 'serviceWorker' in navigator;
}

/**
 * Devuelve el permiso real del navegador para el origen actual.
 * `null` significa que el navegador no soporta notificaciones web.
 *
 * @returns {NotificationPermission|null}
 */
export function getBrowserNotificationPermission() {
    return isNotificationSupported() ? Notification.permission : null;
}

/**
 * Inicializa Firebase Messaging y registra el Service Worker compartido.
 * La promesa se reutiliza para evitar registros duplicados en React StrictMode.
 *
 * @returns {Promise<boolean>} Si FCM quedó disponible para obtener tokens.
 */
export async function initFCM() {
    if (_messaging && _serviceWorkerRegistration) return true;
    if (_fcmInitPromise) return _fcmInitPromise;

    if (!isNotificationSupported()) return false;

    _fcmInitPromise = (async () => {
        try {
            const app = getApp();
            _messaging = getMessaging(app);
            _serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
            await navigator.serviceWorker.ready;
            return true;
        } catch (error) {
            _messaging = null;
            _serviceWorkerRegistration = null;
            console.warn('[FCM] No se pudo inicializar:', error.message);
            return false;
        } finally {
            _fcmInitPromise = null;
        }
    })();

    return _fcmInitPromise;
}

/**
 * Solicita al usuario permiso de notificaciones. Debe invocarse desde un gesto
 * explícito (por ejemplo, el clic en "Activar").
 *
 * @returns {Promise<NotificationPermission|null>} Permiso real tras responder.
 */
export async function requestNotificationPermission() {
    if (!isNotificationSupported()) return null;
    if (Notification.permission !== 'default') return Notification.permission;
    return Notification.requestPermission();
}

/**
 * Recupera el token FCM vigente sin solicitar permisos. Permite rehidratar el
 * dispositivo en cada carga cuando el navegador ya conserva `granted`.
 *
 * @returns {Promise<string|null>} Token del dispositivo o `null` sin permiso.
 * @throws {Error} Si FCM no puede inicializarse u obtener el token.
 */
export async function getCurrentFCMToken() {
    if (getBrowserNotificationPermission() !== 'granted') return null;

    const initialized = await initFCM();
    if (!initialized || !_messaging || !_serviceWorkerRegistration) {
        throw new Error('Firebase Messaging no está disponible en este navegador.');
    }

    const currentToken = await getToken(_messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: _serviceWorkerRegistration,
    });

    if (!currentToken) {
        throw new Error('Firebase no devolvió un token para este dispositivo.');
    }

    return currentToken;
}

/**
 * Solicita permiso explícitamente y obtiene el token FCM cuando fue concedido.
 * Se conserva como fachada compatible para consumidores externos.
 *
 * @returns {Promise<string|null>}
 */
export async function requestFCMPermission() {
    const permission = await requestNotificationPermission();
    return permission === 'granted' ? getCurrentFCMToken() : null;
}

/**
 * Registra o renueva un token FCM en el backend del usuario autenticado.
 *
 * @param {string} token Token FCM no vacío del dispositivo actual.
 * @returns {Promise<object>} Respuesta confirmada por el endpoint.
 * @throws {Error} Si el backend rechaza o no puede registrar el token.
 */
export async function registerFCMToken(token) {
    if (!token) throw new Error('Token FCM requerido para registrar el dispositivo.');

    const user = auth.currentUser;
    requireNotificationsAccess(user);

    const idToken = await user.getIdToken();
    const res = await fetch('/api/fcm-register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
            token,
            userAgent: navigator.userAgent,
        }),
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok || payload.registered !== true) {
        throw new Error(payload.error || 'El backend no confirmó el registro del dispositivo.');
    }

    return payload;
}

/**
 * Escucha mensajes recibidos mientras la aplicación está visible.
 * Cada consumidor obtiene una suscripción independiente; su limpieza no afecta
 * otras instancias.
 *
 * @param {(msg: {title:string,body:string,data:object}) => void} callback
 * @returns {() => void} Función de cancelación de la suscripción.
 */
export function onForegroundMessage(callback) {
    if (!_messaging) return () => {};

    return onMessage(_messaging, (payload) => {
        callback?.({
            title: payload.notification?.title || '',
            body: payload.notification?.body || '',
            data: payload.data || {},
        });
    });
}

/**
 * Activa monitoreo de un NRC.
 */
export async function startMonitoring(nrcData) {
    const user = auth.currentUser;
    requireNotificationsAccess(user);

    if (!nrcData?.nrc || !nrcData?.ciclo) {
        throw new Error('El NRC y el ciclo son obligatorios para activar el monitoreo');
    }

    const idToken = await user.getIdToken();
    const res = await fetch('/api/toggle-monitor', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(nrcData),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al activar monitoreo');
    }
    return true;
}

/**
 * Desactiva monitoreo de un NRC.
 */
export async function stopMonitoring(nrc, ciclo) {
    const user = auth.currentUser;
    requireNotificationsAccess(user);

    if (!nrc) {
        throw new Error('El NRC es obligatorio para desactivar el monitoreo.');
    }

    const idToken = await user.getIdToken();
    const queryParams = new URLSearchParams({ nrc: String(nrc).trim() });
    if (ciclo) {
        queryParams.set('ciclo', String(ciclo).trim());
    }

    const res = await fetch(`/api/toggle-monitor?${queryParams.toString()}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
            nrc: String(nrc).trim(),
            ciclo: ciclo ? String(ciclo).trim() : '',
        }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Error ${res.status}: no se pudo desactivar el monitoreo`);
    }
    return true;
}

/**
 * Obtiene materias monitoreadas del usuario.
 */
export async function getMonitoredCourses(userId) {
    if (!auth.currentUser || !canUseNotifications(auth.currentUser.email)) return [];

    const db = await getDb();
    const { collection, getDocs } = await import("firebase/firestore");
    const snapshot = await getDocs(collection(db, "users", userId, "monitored-courses"));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Obtiene notificaciones del usuario.
 */
export async function getUserNotifications(userId, max = 20) {
    if (!auth.currentUser || !canUseNotifications(auth.currentUser.email)) return [];

    const db = await getDb();
    const { collection, query, orderBy, limit, getDocs } = await import("firebase/firestore");
    const q = query(
        collection(db, "users", userId, "notifications"),
        orderBy("createdAt", "desc"),
        limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Marca notificación como leída.
 */
export async function markNotificationRead(userId, notifId) {
    try {
        requireNotificationsAccess(auth.currentUser);
        const db = await getDb();
        const { doc, updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "users", userId, "notifications", notifId), { read: true });
    } catch {
        // Ignorar error al marcar como leída
    }
}

/**
 * Guarda una preferencia de notificaciones (incluyendo queryConsent).
 * @param {string} userId - UID del usuario
 * @param {object} prefs - Preferencias parciales a guardar (ej. { queryConsent: true })
 */
export async function saveNotificationPref(userId, prefs) {
    try {
        requireNotificationsAccess(auth.currentUser);
        const db = await getDb();
        const { doc, setDoc } = await import("firebase/firestore");
        const ref = doc(db, "users", userId, "notificationPrefs", "preferences");
        await setDoc(ref, prefs, { merge: true });
        return true;
    } catch (err) {
        console.error("[notificationService] Error guardando preferencia:", err);
        return false;
    }
}

/**
 * Obtiene las preferencias de notificaciones del usuario.
 * @param {string} userId
 * @returns {Promise<object>}
 */
export async function getNotificationPrefs(userId) {
    if (!auth.currentUser || !canUseNotifications(auth.currentUser.email)) return {};

    try {
        const db = await getDb();
        const { doc, getDoc } = await import("firebase/firestore");
        const ref = doc(db, "users", userId, "notificationPrefs", "preferences");
        const snap = await getDoc(ref);
        return snap.exists() ? snap.data() : {};
    } catch {
        return {};
    }
}

/**
 * Elimina una notificación específica.
 * @param {string} userId
 * @param {string} notifId
 */
export async function deleteNotification(userId, notifId) {
    try {
        requireNotificationsAccess(auth.currentUser);
        const db = await getDb();
        const { doc, deleteDoc } = await import("firebase/firestore");
        await deleteDoc(doc(db, "users", userId, "notifications", notifId));
    } catch (err) {
        console.error("[notificationService] Error eliminando notificación:", err);
    }
}

/**
 * Elimina TODAS las notificaciones del usuario.
 * @param {string} userId
 */
export async function deleteAllNotifications(userId) {
    try {
        requireNotificationsAccess(auth.currentUser);
        const db = await getDb();
        const { collection, getDocs, writeBatch } = await import("firebase/firestore");
        const snapshot = await getDocs(collection(db, "users", userId, "notifications"));
        if (snapshot.empty) return;
        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => batch.delete(docSnap.ref));
        await batch.commit();
    } catch (err) {
        console.error("[notificationService] Error eliminando todas las notificaciones:", err);
    }
}

export default {
    isNotificationSupported,
    getBrowserNotificationPermission,
    initFCM,
    requestNotificationPermission,
    getCurrentFCMToken,
    requestFCMPermission,
    registerFCMToken,
    onForegroundMessage,
    startMonitoring,
    stopMonitoring,
    getMonitoredCourses,
    getUserNotifications,
    markNotificationRead,
};
