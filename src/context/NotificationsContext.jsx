import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { NotificationsContext } from './notificationsContextValue';
import {
    deleteAllNotifications,
    deleteNotification,
    getBrowserNotificationPermission,
    getCurrentFCMToken,
    getMonitoredCourses,
    getUserNotifications,
    initFCM,
    isNotificationSupported,
    markNotificationRead,
    onForegroundMessage,
    registerFCMToken,
    requestNotificationPermission,
    startMonitoring,
    stopMonitoring,
} from '../services/notificationService';

const DEVICE_REGISTRATION_TTL_MS = 5 * 60 * 1000;

/**
 * Provee una única fuente de verdad para permiso web, token FCM, registro del
 * dispositivo, monitoreos e historial de notificaciones.
 *
 * El permiso nunca se infiere desde almacenamiento local: se rehidrata desde
 * `Notification.permission`, que es la autoridad del navegador para el origen.
 * Cuando ya existe permiso, el token se recupera y registra automáticamente al
 * iniciar sesión, recargar, volver a la pestaña o enfocar la ventana.
 *
 * @param {{children: React.ReactNode}} props Contenido protegido por el contexto.
 * @returns {React.JSX.Element} Proveedor compartido de notificaciones.
 */
export function NotificationsProvider({ children }) {
    const { user, canUseNotifications } = useAuth();
    const supported = isNotificationSupported();
    const [fcmInitialized, setFcmInitialized] = useState(false);
    const [permission, setPermission] = useState(() => getBrowserNotificationPermission());
    const [token, setToken] = useState(null);
    const [deviceRegistrationStatus, setDeviceRegistrationStatus] = useState('idle');
    const [deviceError, setDeviceError] = useState(null);
    const [isRequestingPermission, setIsRequestingPermission] = useState(false);
    const [monitoredCourses, setMonitoredCourses] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [dataError, setDataError] = useState(null);

    const activeUserRef = useRef(user?.uid || null);
    const registrationAttemptRef = useRef(null);
    const lastRegistrationRef = useRef({ token: null, at: 0 });

    activeUserRef.current = user?.uid || null;

    const unreadCount = useMemo(
        () => notifications.filter(notification => !notification.read).length,
        [notifications]
    );

    /** Recarga monitoreos e historial persistidos del usuario activo. */
    const refreshData = useCallback(async () => {
        if (!user || !canUseNotifications) {
            setMonitoredCourses([]);
            setNotifications([]);
            setDataError(null);
            return;
        }

        const uid = user.uid;
        try {
            const [courses, notificationList] = await Promise.all([
                getMonitoredCourses(uid),
                getUserNotifications(uid),
            ]);
            if (activeUserRef.current !== uid) return;
            setMonitoredCourses(courses);
            setNotifications(notificationList);
            setDataError(null);
        } catch (error) {
            if (activeUserRef.current === uid) setDataError(error.message);
        }
    }, [user, canUseNotifications]);

    /**
     * Rehidrata el permiso real y, si está concedido, renueva el registro FCM.
     * Las llamadas concurrentes del mismo usuario comparten una sola promesa.
     *
     * @returns {Promise<boolean>} Si el dispositivo quedó registrado en backend.
     */
    const refreshDeviceRegistration = useCallback(async () => {
        const browserPermission = getBrowserNotificationPermission();
        setPermission(browserPermission);

        if (!user || !canUseNotifications) {
            setToken(null);
            setFcmInitialized(false);
            setDeviceRegistrationStatus('idle');
            setDeviceError(null);
            return false;
        }

        if (!supported) {
            setToken(null);
            setFcmInitialized(false);
            setDeviceRegistrationStatus('unsupported');
            setDeviceError('Este navegador no soporta notificaciones push web.');
            return false;
        }

        if (browserPermission !== 'granted') {
            setToken(null);
            setDeviceRegistrationStatus(browserPermission === 'denied' ? 'blocked' : 'permission-required');
            setDeviceError(null);
            return false;
        }

        const uid = user.uid;
        if (registrationAttemptRef.current?.uid === uid) {
            return registrationAttemptRef.current.promise;
        }

        const attempt = (async () => {
            setDeviceRegistrationStatus('registering');
            setDeviceError(null);

            try {
                const initialized = await initFCM();
                if (activeUserRef.current !== uid) return false;
                setFcmInitialized(initialized);
                if (!initialized) throw new Error('No se pudo inicializar Firebase Messaging.');

                const currentToken = await getCurrentFCMToken();
                if (activeUserRef.current !== uid) return false;
                setToken(currentToken);

                const lastRegistration = lastRegistrationRef.current;
                const recentlyRegistered = lastRegistration.token === currentToken
                    && Date.now() - lastRegistration.at < DEVICE_REGISTRATION_TTL_MS;

                if (!recentlyRegistered) {
                    await registerFCMToken(currentToken);
                    lastRegistrationRef.current = { token: currentToken, at: Date.now() };
                }

                if (activeUserRef.current !== uid) return false;
                setDeviceRegistrationStatus('registered');
                return true;
            } catch (error) {
                if (activeUserRef.current === uid) {
                    setDeviceRegistrationStatus('error');
                    setDeviceError(error.message || 'No se pudo registrar este dispositivo.');
                }
                return false;
            }
        })();

        registrationAttemptRef.current = { uid, promise: attempt };
        try {
            return await attempt;
        } finally {
            if (registrationAttemptRef.current?.promise === attempt) {
                registrationAttemptRef.current = null;
            }
        }
    }, [user, canUseNotifications, supported]);

    /**
     * Solicita permiso desde una acción explícita y registra el dispositivo.
     *
     * @returns {Promise<boolean>} `true` solo con permiso y backend confirmados.
     */
    const requestPermission = useCallback(async () => {
        if (!user || !canUseNotifications || !supported) return false;

        setIsRequestingPermission(true);
        setDeviceError(null);
        try {
            const browserPermission = await requestNotificationPermission();
            setPermission(browserPermission);
            if (browserPermission !== 'granted') {
                setDeviceRegistrationStatus(browserPermission === 'denied' ? 'blocked' : 'permission-required');
                return false;
            }
            return await refreshDeviceRegistration();
        } catch (error) {
            setDeviceRegistrationStatus('error');
            setDeviceError(error.message || 'No se pudo activar el dispositivo.');
            return false;
        } finally {
            setIsRequestingPermission(false);
        }
    }, [user, canUseNotifications, supported, refreshDeviceRegistration]);

    useEffect(() => {
        setPermission(getBrowserNotificationPermission());
        registrationAttemptRef.current = null;
        lastRegistrationRef.current = { token: null, at: 0 };

        if (!user || !canUseNotifications) {
            setFcmInitialized(false);
            setToken(null);
            setDeviceRegistrationStatus('idle');
            setDeviceError(null);
            return undefined;
        }

        refreshDeviceRegistration();

        const syncDevice = () => refreshDeviceRegistration();
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') syncDevice();
        };

        window.addEventListener('focus', syncDevice);
        window.addEventListener('pageshow', syncDevice);
        document.addEventListener('visibilitychange', handleVisibility);

        let permissionStatus = null;
        let disposed = false;
        if (navigator.permissions?.query) {
            navigator.permissions.query({ name: 'notifications' }).then(status => {
                if (disposed) return;
                permissionStatus = status;
                status.addEventListener?.('change', syncDevice);
            }).catch(() => {
                // Notification.permission seguirá sincronizándose mediante foco/visibilidad.
            });
        }

        return () => {
            disposed = true;
            window.removeEventListener('focus', syncDevice);
            window.removeEventListener('pageshow', syncDevice);
            document.removeEventListener('visibilitychange', handleVisibility);
            permissionStatus?.removeEventListener?.('change', syncDevice);
        };
    }, [user, canUseNotifications, refreshDeviceRegistration]);

    useEffect(() => {
        refreshData();
        if (!user || !canUseNotifications) return undefined;

        const intervalId = window.setInterval(refreshData, 30000);
        return () => window.clearInterval(intervalId);
    }, [user, canUseNotifications, refreshData]);

    useEffect(() => {
        if (!user || !canUseNotifications || !fcmInitialized) return undefined;

        return onForegroundMessage(() => {
            refreshData();
        });
    }, [user, canUseNotifications, fcmInitialized, refreshData]);

    const startMonitor = useCallback(async (nrcData) => {
        if (!user || !canUseNotifications) return false;
        try {
            await startMonitoring(nrcData);
            await refreshData();
            setDataError(null);
            return true;
        } catch (error) {
            setDataError(error.message || 'No se pudo activar el monitoreo.');
            return false;
        }
    }, [user, canUseNotifications, refreshData]);

    const stopMonitor = useCallback(async (nrc, ciclo) => {
        if (!user || !canUseNotifications) return false;
        try {
            await stopMonitoring(nrc, ciclo);
            await refreshData();
            setDataError(null);
            return true;
        } catch (error) {
            console.error('[NotificationsContext] Error deteniendo monitoreo:', error);
            setDataError(error.message || 'No se pudo detener el monitoreo.');
            throw error;
        }
    }, [user, canUseNotifications, refreshData]);

    const isMonitoring = useCallback((nrc, ciclo) => monitoredCourses.some(course => (
        course.nrc === String(nrc) && (!ciclo || course.ciclo === String(ciclo))
    )), [monitoredCourses]);

    const getMonitorData = useCallback((nrc, ciclo) => monitoredCourses.find(course => (
        course.nrc === String(nrc) && (!ciclo || course.ciclo === String(ciclo))
    )) || null, [monitoredCourses]);

    const markAsRead = useCallback(async (notificationId) => {
        if (!user || !canUseNotifications) return;
        await markNotificationRead(user.uid, notificationId);
        setNotifications(current => current.map(notification => (
            notification.id === notificationId ? { ...notification, read: true } : notification
        )));
    }, [user, canUseNotifications]);

    const removeNotification = useCallback(async (notificationId) => {
        if (!user || !canUseNotifications) return;
        await deleteNotification(user.uid, notificationId);
        setNotifications(current => current.filter(notification => notification.id !== notificationId));
    }, [user, canUseNotifications]);

    const clearAllNotifications = useCallback(async () => {
        if (!user || !canUseNotifications) return;
        await deleteAllNotifications(user.uid);
        setNotifications([]);
    }, [user, canUseNotifications]);

    const value = useMemo(() => ({
        supported,
        fcmInitialized,
        permission,
        token,
        deviceRegistrationStatus,
        deviceRegistered: deviceRegistrationStatus === 'registered',
        deviceError,
        isRequestingPermission,
        monitoredCourses,
        notifications,
        unreadCount,
        dataError,
        requestPermission,
        refreshDeviceRegistration,
        startMonitor,
        stopMonitor,
        isMonitoring,
        getMonitorData,
        fetchNotifications: refreshData,
        refreshData,
        markAsRead,
        removeNotification,
        clearAllNotifications,
    }), [
        supported,
        fcmInitialized,
        permission,
        token,
        deviceRegistrationStatus,
        deviceError,
        isRequestingPermission,
        monitoredCourses,
        notifications,
        unreadCount,
        dataError,
        requestPermission,
        refreshDeviceRegistration,
        startMonitor,
        stopMonitor,
        isMonitoring,
        getMonitorData,
        refreshData,
        markAsRead,
        removeNotification,
        clearAllNotifications,
    ]);

    return (
        <NotificationsContext.Provider value={value}>
            {children}
        </NotificationsContext.Provider>
    );
}
