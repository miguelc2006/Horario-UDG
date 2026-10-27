// src/hooks/useNotifications.js
// Fachada estable para consumir el estado compartido de NotificationsProvider.
import { useContext } from 'react';
import { NotificationsContext } from '../context/notificationsContextValue';

/**
 * Devuelve el estado y las operaciones centralizadas de notificaciones.
 * No crea polling, listeners ni copias de estado por componente.
 *
 * @returns {object} Contexto compartido.
 * @throws {Error} Si se usa fuera de `NotificationsProvider`.
 */
export function useNotifications() {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error('useNotifications debe usarse dentro de NotificationsProvider');
    }
    return context;
}

export default useNotifications;
