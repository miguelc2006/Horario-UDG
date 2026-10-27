import { createContext } from 'react';

/**
 * Contexto interno compartido por el proveedor y el hook de notificaciones.
 * Se mantiene en un módulo separado para que el componente proveedor sea
 * compatible con React Fast Refresh.
 */
export const NotificationsContext = createContext(null);
