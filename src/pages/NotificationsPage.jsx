// src/pages/NotificationsPage.jsx
// Página completa de notificaciones del usuario
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import '../components/MonitorToggle.css';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { getUserSchedules } from '../services/storageService';
import {
    getUserNotifications,
    markNotificationRead,
    deleteNotification,
    deleteAllNotifications,
    saveNotificationPref,
    getNotificationPrefs,
} from '../services/notificationService';
import { showToast } from '../utils/toast';
import './NotificationsPage.css';

const TYPES = [
    { value: 'all', label: 'Todas' },
    { value: 'seat_available', label: '🎓 Cupos' },
    { value: 'schedule_change', label: '⚠️ Horarios' },
    { value: 'professor_change', label: '👨‍🏫 Profesores' },
    { value: 'test_notification', label: '🧪 Pruebas' },
];

function formatDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    if (diff < 60000) return 'Ahora';
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `Hace ${Math.floor(diff / 86400000)} días`;
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTypeIcon(type) {
    switch (type) {
        case 'seat_available': return '🎓';
        case 'schedule_change': return '⚠️';
        case 'professor_change': return '👨‍🏫';
        case 'test_notification': return '🧪';
        case 'reminder': return '🔔';
        default: return '🔔';
    }
}

function getTypeLabel(type) {
    switch (type) {
        case 'seat_available': return 'Cupo disponible';
        case 'schedule_change': return 'Cambio de horario';
        case 'professor_change': return 'Cambio de profesor';
        case 'test_notification': return 'Prueba';
        case 'reminder': return 'Recordatorio';
        default: return 'General';
    }
}

export function NotificationsPage() {
    const { user, canUseNotifications, canUseCloudSchedules } = useAuth();
    const navigate = useNavigate();
    const {
        permission,
        requestPermission,
        markAsRead,
        startMonitor,
        stopMonitor,
        monitoredCourses,
        refreshData,
    } = useNotifications();

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [stoppingNrc, setStoppingNrc] = useState(null);
    const [manageModalCourse, setManageModalCourse] = useState(null);
    const [manageRegistered, setManageRegistered] = useState(false);
    const [manageSelectedScheduleIds, setManageSelectedScheduleIds] = useState([]);
    const [manageLoading, setManageLoading] = useState(false);
    const [availableSchedules, setAvailableSchedules] = useState([]);
    const [queryConsent, setQueryConsent] = useState(null); // null=cargando, true/false

    const loadNotifications = useCallback(async () => {
        if (!user) return;
        if (!canUseNotifications) {
            setNotifications([]);
            setAvailableSchedules([]);
            setQueryConsent(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const [list, schedules, prefs] = await Promise.all([
            getUserNotifications(user.uid, 50),
            canUseCloudSchedules ? getUserSchedules(user.uid).catch(() => []) : Promise.resolve([]),
            getNotificationPrefs(user.uid).catch(() => ({})),
        ]);
        setNotifications(list);
        setAvailableSchedules(schedules);
        setQueryConsent(prefs.queryConsent !== undefined ? prefs.queryConsent : null);
        setLoading(false);
    }, [user, canUseNotifications, canUseCloudSchedules]);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    const filtered = filter === 'all'
        ? notifications
        : notifications.filter(n => n.type === filter);

    const unreadFiltered = filtered.filter(n => !n.read).length;

    const handleClick = async (notif) => {
        if (!notif.read) {
            await markNotificationRead(user.uid, notif.id);
            setNotifications(prev =>
                prev.map(n => n.id === notif.id ? { ...n, read: true } : n)
            );
            if (typeof markAsRead === 'function') markAsRead(notif.id);
        }

        // Deep linking
        const nrc = notif.data?.nrc;
        const profesor = notif.data?.profesor;
        let scheduleId = notif.data?.scheduleId;

        // Si no hay scheduleId pero tenemos nrc, buscar en horarios guardados
        if (!scheduleId && nrc && user && canUseCloudSchedules) {
            try {
                const schedules = await getUserSchedules(user.uid);
                const match = schedules.find(s => s.selectedNRCs?.some(n => String(n) === String(nrc)));
                if (match) {
                    scheduleId = match.id;
                }
            } catch (e) {
                console.warn('[NotificationsPage] Error buscando horario para NRC:', e);
            }
        }

        // Solo alumnos pueden abrir horarios persistidos en la nube.
        if (scheduleId && canUseCloudSchedules) {
            navigate(`/mis-horarios?edit=${scheduleId}${nrc ? `&nrc=${nrc}` : ''}`);
            return;
        }

        // Fallback seguro por tipo cuando no hay un horario accesible.
        switch (notif.type) {
            case 'seat_available':
            case 'schedule_change':
                navigate(canUseCloudSchedules
                    ? (nrc ? `/mis-horarios?nrc=${nrc}` : '/mis-horarios')
                    : '/planificador');
                break;
            case 'professor_change':
                navigate(profesor ? `/profesores?q=${encodeURIComponent(profesor)}` : '/profesores');
                break;
            case 'test_notification':
                navigate('/mis-notificaciones');
                break;
            default:
                navigate(canUseCloudSchedules && nrc ? `/mis-horarios?nrc=${nrc}` : '/dashboard');
        }
    };

    const handleMarkAllRead = async () => {
        if (!user || !canUseNotifications) return;
        const unread = notifications.filter(n => !n.read);
        for (const n of unread) {
            await markNotificationRead(user.uid, n.id);
        }
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        showToast('Todas las notificaciones marcadas como leídas', 'success');
    };

    const handleDeleteNotification = async (e, notif) => {
        e.stopPropagation();
        if (!user || !canUseNotifications) return;
        await deleteNotification(user.uid, notif.id);
        setNotifications(prev => prev.filter(n => n.id !== notif.id));
        showToast('Notificación eliminada', 'info');
    };

    const handleClearAll = async () => {
        if (!user || !canUseNotifications) return;
        await deleteAllNotifications(user.uid);
        setNotifications([]);
        showToast('Todas las notificaciones eliminadas', 'info');
    };

    /* --- Handlers para el modal de gestión de monitoreo --- */
    const handleOpenManageModal = useCallback((course) => {
        if (!canUseNotifications) return;
        setManageRegistered(course.registered || false);
        setManageSelectedScheduleIds(course.scheduleIds || (course.scheduleId ? [course.scheduleId] : []));
        setManageModalCourse(course);
    }, [canUseNotifications]);

    const handleConfirmManage = useCallback(async () => {
        if (!manageModalCourse || !user || !canUseNotifications) return;
        setManageLoading(true);
        const mc = manageModalCourse;
        const ok = await startMonitor({
            nrc: String(mc.nrc),
            materia: mc.materia || '',
            clave: mc.clave || '',
            profesor: mc.profesor || '',
            cup: mc.cup || '',
            majrp: mc.majrp || '',
            ciclo: mc.ciclo || mc.ciclop || '',
            horarioLabel: mc.horarioLabel || '',
            registered: manageRegistered,
            scheduleIds: manageSelectedScheduleIds,
        });
        setManageLoading(false);
        setManageModalCourse(null);
        if (ok) {
            showToast('Configuración de monitoreo actualizada', 'success');
        } else {
            showToast('Error al actualizar configuración', 'error');
        }
    }, [manageModalCourse, manageRegistered, manageSelectedScheduleIds, startMonitor, user, canUseNotifications]);

    const toggleManageSchedule = useCallback((id) => {
        setManageSelectedScheduleIds(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    }, []);

    if (!user) {
        return (
            <div className="notif-page">
                <div className="notif-container">
                    <div className="notif-empty-state">
                        <span className="notif-empty-icon">🔔</span>
                        <h2>Inicia sesión para ver tus notificaciones</h2>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="notif-page">
            <div className="notif-container">
                {/* Header */}
                <div className="notif-header">
                    <div className="notif-header-left">
                        <h1>🔔 Notificaciones</h1>
                        <span className="notif-header-count">
                            {unreadFiltered > 0
                                ? `${unreadFiltered} sin leer de ${filtered.length}`
                                : `${filtered.length} notificaciones`}
                        </span>
                    </div>
                    <div className="notif-header-actions">
                        {unreadFiltered > 0 && (
                            <button className="notif-btn" onClick={handleMarkAllRead} type="button">
                                ✓ Leídas
                            </button>
                        )}
                        {notifications.length > 0 && (
                            <button className="notif-btn notif-btn-danger" onClick={handleClearAll} type="button">
                                🗑 Eliminar todas
                            </button>
                        )}
                        <button className="notif-btn notif-btn-secondary" onClick={loadNotifications} type="button">
                            ↻ Recargar
                        </button>
                    </div>
                </div>

                {/* === GESTIÓN DE NOTIFICACIONES === */}
                <div className="notif-settings-panel">
                    <div className="notif-settings-row">
                        <span className={`notif-permission-dot ${permission || 'default'}`}></span>
                        <div className="notif-settings-info">
                            <strong>Estado del permiso</strong>
                            <span>
                                {permission === 'granted'
                                    ? 'Notificaciones push activadas — recibirás alertas en segundo plano.'
                                    : permission === 'denied'
                                        ? 'Permiso denegado. Debes habilitarlo desde la configuración del navegador.'
                                        : 'Aún no has concedido permiso para notificaciones push.'}
                            </span>
                        </div>
                        {permission !== 'granted' && (
                            <button onClick={requestPermission} className="notif-settings-btn" type="button">
                                🔔 Activar
                            </button>
                        )}
                    </div>

                    <div className="notif-settings-divider">
                        <span>📡 Materias monitoreadas ({monitoredCourses.length})</span>
                    </div>

                    {monitoredCourses.length === 0 ? (
                        <div className="notif-settings-row notif-settings-row-empty">
                            <div className="notif-settings-info">
                                <span>No tienes materias monitoreadas. Monitorea desde el planificador para recibir alertas.</span>
                            </div>
                            <button onClick={() => navigate('/planear')} className="notif-settings-btn secondary" type="button">
                                Ir al planificador
                            </button>
                        </div>
                    ) : (
                        <div className="notif-settings-monitored-list">
                            {monitoredCourses.map((mc) => (
                                <div key={`${mc.nrc}_${mc.ciclo || mc.ciclop || ''}`} className="notif-settings-monitored-item">
                                    <div
                                        className="notif-settings-monitored-info"
                                        onClick={() => handleOpenManageModal(mc)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={e => e.key === 'Enter' && handleOpenManageModal(mc)}
                                        title="Gestionar configuración"
                                    >
                                        <div className="notif-settings-monitored-top">
                                            <span className="notif-settings-monitored-name">{mc.materia || 'Sin nombre'}</span>
                                            <span className="monitor-nrc">NRC {mc.nrc}</span>
                                        </div>
                                        <div className="notif-settings-monitored-meta">
                                            {mc.profesor && <span className="list-item-tag">{mc.profesor}</span>}
                                            {mc.horarioLabel && <span className="list-item-tag">{mc.horarioLabel}</span>}
                                            <span className="monitor-status-dot"></span>
                                            <span className="monitor-status-text">Activo</span>
                                        </div>
                                    </div>
                                    <div className="notif-settings-monitored-actions">
                                        <button
                                            className="notif-settings-monitored-stop"
                                            onClick={async () => {
                                                setStoppingNrc(mc.nrc);
                                                try {
                                                    const stopped = await stopMonitor(mc.nrc, mc.ciclo || mc.ciclop);
                                                    if (!stopped) throw new Error('No se pudo detener el monitoreo');
                                                    await refreshData();
                                                    showToast(`Monitoreo de ${mc.materia || mc.nrc} detenido`, 'info');
                                                } catch {
                                                    showToast('Error al detener monitoreo', 'error');
                                                } finally {
                                                    setStoppingNrc(null);
                                                }
                                            }}
                                            disabled={stoppingNrc === mc.nrc}
                                            type="button"
                                            title="Detener monitoreo"
                                        >
                                            {stoppingNrc === mc.nrc ? '...' : '✕ Detener'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* === MONITOREO COLABORATIVO === */}
                <div className="notif-settings-panel" style={{ marginTop: '0.5rem' }}>
                    <div className="notif-settings-row">
                        <div className="notif-settings-info">
                            <strong>🤝 Ayuda a la comunidad</strong>
                            <span>
                                {queryConsent === false
                                    ? 'Desactivado — tus consultas no verifican materias de otros usuarios.'
                                    : queryConsent === true
                                        ? 'Activado — tus consultas ayudan a detectar cupos para otros estudiantes.'
                                        : '¿Permites que tus consultas al SIIAU también ayuden a verificar materias que otros esperan?'}
                            </span>
                        </div>
                        {queryConsent !== null && (
                            <button
                                className={`notif-settings-btn ${queryConsent ? 'secondary' : ''}`}
                                onClick={async () => {
                                    const newVal = !queryConsent;
                                    setQueryConsent(newVal);
                                    localStorage.setItem('horario-udg-query-consent', newVal ? 'granted' : 'denied');
                                    await saveNotificationPref(user.uid, { queryConsent: newVal });
                                    showToast(
                                        newVal
                                            ? 'Gracias por apoyar a la comunidad 🙌'
                                            : 'Monitoreo colaborativo desactivado',
                                        newVal ? 'success' : 'info'
                                    );
                                }}
                                type="button"
                            >
                                {queryConsent ? 'Desactivar' : 'Activar'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Filtros */}
                <div className="notif-filters">
                    {TYPES.map(t => (
                        <button
                            key={t.value}
                            className={`notif-filter-btn ${filter === t.value ? 'active' : ''}`}
                            onClick={() => setFilter(t.value)}
                            type="button"
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* Lista */}
                {loading ? (
                    <div className="notif-loading">
                        <div className="spinner"></div>
                        <p>Cargando notificaciones...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="notif-empty-state">
                        <span className="notif-empty-icon">
                            {filter === 'all' ? '🔔' : '📭'}
                        </span>
                        <h2>
                            {filter === 'all'
                                ? 'No hay notificaciones aún'
                                : 'No hay notificaciones de este tipo'}
                        </h2>
                        <p>
                            {filter === 'all'
                                ? 'Monitorea materias desde el planificador para recibir alertas de cupos y cambios.'
                                : 'Cambia el filtro para ver otras notificaciones.'}
                        </p>
                        {filter === 'all' && (
                            <button className="notif-cta" onClick={() => navigate('/planear')} type="button">
                                Ir al planificador
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="notif-list">
                        {filtered.map((notif, i) => (
                            <div
                                key={notif.id}
                                className={`notif-card ${!notif.read ? 'notif-unread' : ''}`}
                                style={{ animationDelay: `${i * 0.03}s` }}
                                onClick={() => handleClick(notif)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={e => e.key === 'Enter' && handleClick(notif)}
                            >
                                <div className="notif-card-icon">
                                    {getTypeIcon(notif.type)}
                                </div>
                                <div className="notif-card-content">
                                    <div className="notif-card-top">
                                        <strong className="notif-card-title">
                                            {notif.title || getTypeLabel(notif.type)}
                                        </strong>
                                        {!notif.read && <span className="notif-card-dot" />}
                                    </div>
                                    <p className="notif-card-body">{notif.body || '—'}</p>
                                    <div className="notif-card-meta">
                                        <span className={`notif-type-tag ${notif.type}`}>
                                            {getTypeLabel(notif.type)}
                                        </span>
                                        {notif.data?.nrc && (
                                            <span className="notif-nrc">NRC {notif.data.nrc}</span>
                                        )}
                                        <span className="notif-time">{formatDate(notif.createdAt)}</span>
                                    </div>
                                </div>
                                <button
                                    className="notif-card-delete"
                                    onClick={(e) => handleDeleteNotification(e, notif)}
                                    title="Eliminar notificación"
                                    type="button"
                                >
                                    ✕
                                </button>
                                {notif.data?.nrc && (
                                    <div className="notif-card-arrow">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* === MODAL DE GESTIÓN DE MONITOREO === */}
                {manageModalCourse && createPortal(
                    <div className="modal-overlay" onClick={() => setManageModalCourse(null)}>
                        <div className="monitor-modal" onClick={e => e.stopPropagation()}>
                            <div className="monitor-modal-header">
                                <h3>🔔 Gestionar monitoreo</h3>
                                <button className="modal-close-btn" onClick={() => setManageModalCourse(null)}>×</button>
                            </div>

                            <div className="monitor-modal-body">
                                <p className="monitor-modal-subtitle">
                                    {manageModalCourse.materia || 'Materia'} — NRC {manageModalCourse.nrc}
                                </p>

                                {manageModalCourse.profesor && (
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary-color)', margin: '-8px 0 14px' }}>
                                        👨‍🏫 {manageModalCourse.profesor}
                                        {manageModalCourse.horarioLabel && ` · ${manageModalCourse.horarioLabel}`}
                                    </p>
                                )}

                                <label className="monitor-option">
                                    <input
                                        type="checkbox"
                                        checked={manageRegistered}
                                        onChange={e => setManageRegistered(e.target.checked)}
                                    />
                                    <div className="monitor-option-content">
                                        <strong>Ya estoy inscrito(a)</strong>
                                        <p>Solo notificarme si cambia el horario o profesor.</p>
                                    </div>
                                </label>

                                <div className="monitor-info-box">
                                    {manageRegistered ? (
                                        <p>📋 Monitorearemos cambios en el horario y profesor asignado.</p>
                                    ) : (
                                        <p>🎯 Te avisaremos cuando haya <strong>cupos disponibles</strong> para esta materia.</p>
                                    )}
                                    <p className="monitor-info-note">
                                        Las verificaciones se realizan cada ~15 minutos.
                                        Necesitarás tener las notificaciones activadas.
                                    </p>
                                </div>

                                {availableSchedules.length > 0 && (
                                    <div className="monitor-schedule-picker">
                                        <p className="monitor-picker-title">📁 Vincular a horario(s):</p>
                                        <p className="monitor-picker-hint">Al recibir una notificación podrás abrir el horario directamente.</p>
                                        <div className="monitor-schedule-list">
                                            <label className="monitor-schedule-option">
                                                <input
                                                    type="checkbox"
                                                    checked={manageSelectedScheduleIds.length === 0}
                                                    onChange={() => setManageSelectedScheduleIds([])}
                                                />
                                                <span className="monitor-schedule-name">Ninguno (solo notificación)</span>
                                            </label>
                                            {availableSchedules.map(sch => (
                                                <label key={sch.id} className="monitor-schedule-option">
                                                    <input
                                                        type="checkbox"
                                                        checked={manageSelectedScheduleIds.includes(sch.id)}
                                                        onChange={() => toggleManageSchedule(sch.id)}
                                                    />
                                                    <span className="monitor-schedule-name">{sch.name || 'Sin título'}</span>
                                                    {(sch.selectedNRCs || []).map(String).includes(String(manageModalCourse.nrc)) && (
                                                        <span className="monitor-schedule-match">✅ Contiene este NRC</span>
                                                    )}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="monitor-modal-footer">
                                <button
                                    className="btn-cancel"
                                    onClick={() => setManageModalCourse(null)}
                                    type="button"
                                >
                                    Cancelar
                                </button>
                                <button
                                    className="btn-primary"
                                    onClick={handleConfirmManage}
                                    disabled={manageLoading}
                                    type="button"
                                >
                                    {manageLoading ? 'Guardando...' : 'Guardar configuración'}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </div>
    );
}
