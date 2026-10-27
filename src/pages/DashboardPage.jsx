import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { clearSession } from '../utils/session';
import { getUserSchedules } from '../services/storageService';
import { getMyRatings } from '../services/myRatingsService';
import { showToast } from '../utils/toast';
import './DashboardPage.css';

/**
 * Presenta un resumen de la actividad disponible para el perfil autenticado.
 * Cada fuente persistente se consulta y muestra únicamente cuando la cuenta
 * posee la capacidad correspondiente.
 *
 * @returns {React.JSX.Element} Dashboard personalizado por capacidades.
 */
export function DashboardPage() {
    const {
        user,
        canUseCloudSchedules,
        canManageRatings,
        canUseNotifications,
    } = useAuth();
    const navigate = useNavigate();
    const {
        permission,
        monitoredCourses,
        unreadCount,
        stopMonitor,
        requestPermission,
        deviceRegistered,
        deviceRegistrationStatus,
        deviceError,
        isRequestingPermission,
    } = useNotifications();

    const [schedules, setSchedules] = useState([]);
    const [ratings, setRatings] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadDashboardData = useCallback(async () => {
        if (!user) return;

        setLoading(true);
        try {
            const [schedulesData, ratingsData] = await Promise.all([
                canUseCloudSchedules ? getUserSchedules(user.uid) : Promise.resolve([]),
                canManageRatings ? getMyRatings(user.uid) : Promise.resolve([]),
            ]);
            setSchedules(schedulesData);
            setRatings(ratingsData);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, [user, canUseCloudSchedules, canManageRatings]);

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }

        loadDashboardData();
    }, [user, navigate, loadDashboardData]);

    const handleNewSchedule = () => {
        clearSession();
        navigate('/planear');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 7) return `Hace ${diffDays} días`;
        if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    };

    const formatRatingDate = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 7) return `Hace ${diffDays} días`;
        if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
        return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
    };

    const formatProfName = (profId) => profId.replace(/_/g, ' ');

    const getUniqueSubjectsCount = (schedule) => {
        const rawSubjects = (schedule.materias || []).filter(m =>
            (schedule.selectedNRCs || []).includes(m.nrc)
        );
        return rawSubjects.filter((obj, index, self) =>
            index === self.findIndex((t) => t.nrc === obj.nrc)
        ).length;
    };

    const stats = [
        canUseCloudSchedules && {
            id: 'schedules',
            icon: '📅', label: 'Horarios', value: schedules.length,
            color: 'var(--primary-color)', bg: 'var(--primary-color-light)',
            link: '/mis-horarios',
        },
        canManageRatings && {
            id: 'ratings',
            icon: '⭐', label: 'Evaluaciones', value: ratings.length,
            color: 'var(--star-active-color)', bg: 'var(--tag-yellow-bg)',
            link: '/mis-evaluaciones',
        },
        canUseNotifications && {
            id: 'alerts',
            icon: '🔔', label: 'Monitoreo y alertas',
            color: 'var(--success-color)', bg: 'var(--tag-green-bg)',
            link: '/mis-notificaciones',
            metrics: [
                { label: 'no leídas', value: unreadCount },
                { label: 'monitoreos', value: monitoredCourses.length },
            ],
        },
    ].filter(Boolean);

    const recentSchedules = schedules.slice(0, 3);
    const recentRatings = ratings.slice(0, 3);

    if (loading) {
        return (
            <div className="animate-fade-in dashboard-container">
                <div className="dashboard-loading">
                    <div className="spinner"></div>
                    <p>Cargando tu dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in dashboard-container">
            {/* === WELCOME BANNER === */}
            <header className="welcome-banner">
                <div className="welcome-avatar">
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt="" className="avatar-img" />
                    ) : (
                        <span className="avatar-fallback">
                            {user?.displayName?.charAt(0) || 'U'}
                        </span>
                    )}
                </div>
                <div className="welcome-text">
                    <h1>¡Qué gusto verte, {user?.displayName?.split(' ')[0]}! 👋</h1>
                    <p>Resumen de tu actividad en Horario UDG</p>
                </div>
                <button onClick={handleNewSchedule} className="welcome-cta">
                    ✨ Nuevo Horario
                </button>
            </header>

            {/* === STATS ROW === */}
            {stats.length > 0 && (
                <div className="stats-row">
                    {stats.map((stat) => (
                        <Link
                            key={stat.id}
                            to={stat.link}
                            className="stat-card stat-card-clickable"
                            style={{
                                '--stat-color': stat.color,
                                '--stat-bg': stat.bg,
                            }}
                        >
                            <span className="stat-icon">{stat.icon}</span>
                            <div className="stat-info">
                                {stat.metrics ? (
                                    <div className="stat-metrics" aria-label={stat.label}>
                                        {stat.metrics.map((metric) => (
                                            <span className="stat-metric" key={metric.label}>
                                                <strong>{metric.value}</strong>
                                                <small>{metric.label}</small>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="stat-value">{stat.value}</span>
                                )}
                                <span className="stat-label">{stat.label}</span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            {/* === QUICK ACTIONS === */}
            <div className="quick-actions">
                <span className="quick-actions-label">Acceso rápido:</span>
                <div className="quick-actions-buttons">
                    <button onClick={handleNewSchedule} className="quick-btn">
                        ✨ Nuevo Horario
                    </button>
                    {canUseCloudSchedules && (
                        <Link to="/mis-horarios" className="quick-btn">
                            📅 Mis Horarios
                        </Link>
                    )}
                    {canManageRatings && (
                        <Link to="/mis-evaluaciones" className="quick-btn">
                            ⭐ Mis Evaluaciones
                        </Link>
                    )}
                    <Link to="/profesores" className="quick-btn">
                        👨‍🏫 Profesores
                    </Link>
                    <Link to="/ajustes" className="quick-btn">
                        ⚙️ Ajustes
                    </Link>
                    {canUseNotifications && (
                        <Link to="/mis-notificaciones" className="quick-btn">
                            🔔 Monitoreo y alertas
                        </Link>
                    )}
                </div>
            </div>

            {/* === NOTIFICATION AND MONITORING MANAGEMENT === */}
            {canUseNotifications && (
                <section className="dashboard-section notif-manage-section">
                <div className="section-header clickable-header" onClick={() => navigate('/mis-notificaciones')}>
                    <h2>🔔 Monitoreo y alertas</h2>
                    <Link to="/mis-notificaciones" className="section-link" onClick={e => e.stopPropagation()}>
                        Gestionar &rarr;
                    </Link>
                </div>
                <div className="notif-manage-body">
                    <div className="notif-manage-status">
                        <span className={`notif-permission-dot ${permission || 'default'}`}></span>
                        <div className="notif-manage-status-text">
                            <strong>Notificaciones de este dispositivo</strong>
                            <span className="notif-manage-status-label">
                                {deviceRegistered
                                    ? '✅ Permiso concedido y dispositivo registrado para recibir alertas'
                                    : permission === 'denied'
                                        ? '❌ Permiso denegado — cámbialo desde la configuración del navegador'
                                        : permission !== 'granted'
                                            ? '🔕 Permiso pendiente — actívalo para registrar este dispositivo'
                                            : deviceRegistrationStatus === 'registering'
                                                ? '⏳ Permiso concedido; registrando el dispositivo…'
                                                : `⚠️ Permiso concedido, pero el dispositivo no está registrado${deviceError ? `: ${deviceError}` : ''}`}
                            </span>
                        </div>
                    </div>
                    <div className="notif-manage-actions">
                        {!deviceRegistered && permission !== 'denied' && (
                            <button
                                onClick={requestPermission}
                                className="notif-manage-btn"
                                type="button"
                                disabled={isRequestingPermission || deviceRegistrationStatus === 'registering'}
                            >
                                {isRequestingPermission || deviceRegistrationStatus === 'registering'
                                    ? '⏳ Registrando…'
                                    : permission === 'granted'
                                        ? '🔄 Registrar dispositivo'
                                        : '🔔 Activar notificaciones'}
                            </button>
                        )}
                        <Link to="/mis-notificaciones" className="notif-manage-btn secondary">
                            Ver notificaciones
                        </Link>
                    </div>
                </div>
                {(monitoredCourses.length > 0) && (
                    <div className="notif-manage-monitored">
                        <div className="notif-manage-monitored-header">
                            <span className="notif-manage-monitored-title">📡 Resumen de monitoreo</span>
                            <span className="notif-manage-monitored-count">{monitoredCourses.length} materia{monitoredCourses.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="notif-manage-monitored-list">
                            {monitoredCourses.slice(0, 4).map((mc) => (
                                <div key={`${mc.nrc}_${mc.ciclo || mc.ciclop || ''}`} className="notif-manage-monitored-item">
                                    <span className="monitor-status-dot"></span>
                                    <span className="notif-manage-monitored-name">{mc.materia || 'Sin nombre'}</span>
                                    <span className="monitor-nrc">NRC {mc.nrc}</span>
                                    <button
                                        className="notif-manage-monitored-remove"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                                const targetCiclo = mc.ciclo || mc.ciclop || mc.horarioLabel || (mc.id?.includes('_') ? mc.id.split('_')[1] : '');
                                                await stopMonitor(mc.nrc, targetCiclo);
                                                showToast(`Monitoreo de ${mc.materia || mc.nrc} detenido`, 'info');
                                            } catch (err) {
                                                showToast(err.message || 'Error al detener monitoreo', 'error');
                                            }
                                        }}
                                        title="Detener monitoreo"
                                        type="button"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        {monitoredCourses.length > 4 && (
                            <Link to="/mis-notificaciones" className="notif-manage-monitored-more">
                                + {monitoredCourses.length - 4} más &rarr;
                            </Link>
                        )}
                    </div>
                )}
                {monitoredCourses.length === 0 && (
                    <div className="notif-manage-empty">
                        <span>📡 Aún no monitoreas materias — monitorea desde el planificador</span>
                        <Link to="/planear" className="notif-manage-btn secondary small">Ir al planificador</Link>
                    </div>
                )}
                </section>
            )}

            {/* === MAIN CONTENT: TWO COLUMNS === */}
            {(canUseCloudSchedules || canManageRatings) && (
            <div className={`dashboard-main ${canUseCloudSchedules !== canManageRatings ? 'single-column' : ''}`}>
                {/* === RECENT SCHEDULES === */}
                {canUseCloudSchedules && (
                <section className="dashboard-section">
                    <div className="section-header clickable-header" onClick={() => schedules.length > 0 && navigate('/mis-horarios')}>
                        <h2>📅 Horarios Recientes</h2>
                        {schedules.length > 0 && (
                            <Link to="/mis-horarios" className="section-link" onClick={e => e.stopPropagation()}>
                                Ver todos &rarr;
                            </Link>
                        )}
                    </div>

                    {schedules.length === 0 ? (
                        <div className="section-empty">
                            <span className="empty-icon">📅</span>
                            <p>Aún no tienes horarios guardados</p>
                            <button onClick={handleNewSchedule} className="empty-cta">
                                Crear mi primer horario
                            </button>
                        </div>
                    ) : (
                        <div className="section-list">
                            {recentSchedules.map((sch) => {
                                const count = getUniqueSubjectsCount(sch);
                                return (
                                    <div
                                        key={sch.id}
                                        className="list-item clickable"
                                        onClick={() => navigate(`/mis-horarios?edit=${sch.id}`)}
                                    >
                                        <div className="list-item-bar"></div>
                                        <div className="list-item-content">
                                            <div className="list-item-top">
                                                <span className="list-item-name">{sch.name || 'Sin título'}</span>
                                                <span className="list-item-time">{formatDate(sch.updatedAt)}</span>
                                            </div>
                                            <div className="list-item-meta">
                                                {sch.formParams?.carrera && (
                                                    <span className="list-item-tag">{sch.formParams.carrera}</span>
                                                )}
                                                <span className="list-item-count">{count} materias</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
                )}

                {/* === RECENT RATINGS === */}
                {canManageRatings && (
                <section className="dashboard-section">
                    <div className="section-header clickable-header" onClick={() => ratings.length > 0 && navigate('/mis-evaluaciones')}>
                        <h2>⭐ Evaluaciones Recientes</h2>
                        {ratings.length > 0 && (
                            <Link to="/mis-evaluaciones" className="section-link" onClick={e => e.stopPropagation()}>
                                Ver todas &rarr;
                            </Link>
                        )}
                    </div>

                    {ratings.length === 0 ? (
                        <div className="section-empty">
                            <span className="empty-icon">⭐</span>
                            <p>Aún no has evaluado profesores</p>
                            <Link to="/profesores" className="empty-cta-link">
                                Evaluar profesores
                            </Link>
                        </div>
                    ) : (
                        <div className="section-list">
                            {recentRatings.map((r) => (
                                <div
                                    key={r.id}
                                    className="list-item clickable"
                                    onClick={() => navigate('/mis-evaluaciones')}
                                >
                                    <div className="list-item-bar rating-bar"></div>
                                    <div className="list-item-content">
                                        <div className="list-item-top">
                                            <span className="list-item-name">{formatProfName(r.professorId)}</span>
                                            <span
                                                className="rating-score"
                                                style={{
                                                    '--score-color':
                                                        r.stars >= 7
                                                            ? 'var(--success-color)'
                                                            : r.stars >= 4
                                                              ? 'var(--warning-color)'
                                                              : 'var(--error-color)',
                                                }}
                                            >
                                                ★ {r.stars}/10
                                            </span>
                                        </div>
                                        <div className="list-item-meta">
                                            <span className="list-item-time">
                                                {formatRatingDate(r.createdAt)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
                )}
            </div>
            )}
        </div>
    );
}