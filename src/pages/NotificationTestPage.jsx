// src/pages/NotificationTestPage.jsx
// Página de prueba manual del sistema de notificaciones push
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import {
    initFCM,
    getMonitoredCourses,
    getUserNotifications,
    markNotificationRead,
} from '../services/notificationService';
import { getUserSchedules } from '../services/storageService';
import { showToast } from '../utils/toast';
import './NotificationTestPage.css';

// Sección plegable
function Section({ title, defaultOpen = true, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="test-section">
            <button
                className="test-section-header"
                onClick={() => setOpen(o => !o)}
                type="button"
            >
                <span>{title}</span>
                <span className={`test-chevron ${open ? 'open' : ''}`}>▼</span>
            </button>
            {open && <div className="test-section-body">{children}</div>}
        </div>
    );
}

// Badge status
function StatusBadge({ ok, label }) {
    return (
        <span className={`test-badge ${ok ? 'ok' : 'no'}`}>
            {ok ? 'OK' : 'X'} {label}
        </span>
    );
}

export function NotificationTestPage() {
    const { user, canUseNotifications } = useAuth();
    const {
        unreadCount,
        fetchNotifications,
        requestPermission,
        permission,
        fcmInitialized,
        token,
        deviceRegistered,
        deviceRegistrationStatus,
        deviceError,
        startMonitor,
        stopMonitor,
    } = useNotifications();

    // Estado local de las pruebas manuales, no de la sesión FCM compartida.
    const [localCourses, setLocalCourses] = useState([]);
    const [localNotifs, setLocalNotifs] = useState([]);
    const [sending, setSending] = useState(false);
    const [testTitle, setTestTitle] = useState('🎯 Notificación de prueba');
    const [testBody, setTestBody] = useState('Esta es una notificación de prueba del sistema de monitoreo.');
    const [testResult, setTestResult] = useState(null);
    const [lastFetch, setLastFetch] = useState(null);

    // NRC de prueba rápido
    const [quickNrc, setQuickNrc] = useState('');
    const [quickMateria, setQuickMateria] = useState('');
    const [quickCiclop, setQuickCiclop] = useState('202510');

    // Cargar datos locales
    const loadData = useCallback(async () => {
        if (!user) return;
        if (!canUseNotifications) {
            setLocalCourses([]);
            setLocalNotifs([]);
            setLastFetch(null);
            return;
        }
        const [courses, notifs] = await Promise.all([
            getMonitoredCourses(user.uid),
            getUserNotifications(user.uid),
        ]);
        setLocalCourses(courses);
        setLocalNotifs(notifs);
        setLastFetch(new Date().toLocaleTimeString());
    }, [user, canUseNotifications]);

    useEffect(() => { loadData(); }, [loadData]);

    // Inicializar FCM manualmente
    const handleInitFCM = async () => {
        if (!canUseNotifications) {
            showToast('Las notificaciones requieren una cuenta institucional UDG.', 'warning');
            return;
        }
        const ok = await initFCM();
        showToast(ok ? 'FCM inicializado correctamente' : 'Error al inicializar FCM', ok ? 'success' : 'error');
    };

    // Solicitar permiso y confirmar el registro mediante la fuente compartida.
    const handleRequestPermission = async () => {
        if (!canUseNotifications) {
            showToast('Las notificaciones requieren una cuenta institucional UDG.', 'warning');
            return;
        }
        const ok = await requestPermission();
        showToast(
            ok ? 'Permiso concedido y dispositivo registrado' : (deviceError || 'No se pudo activar el dispositivo'),
            ok ? 'success' : 'warning'
        );
    };

    // Enviar notificación de prueba
    const handleSendTest = async () => {
        if (!user) {
            showToast('Debes iniciar sesión', 'warning');
            return;
        }
        if (!canUseNotifications) {
            showToast('Las notificaciones requieren una cuenta institucional UDG.', 'warning');
            return;
        }
        setSending(true);
        setTestResult(null);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/test-notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ title: testTitle, body: testBody }),
            });
            const data = await res.json();
            setTestResult(data);
            if (data.success) {
                showToast(data.message, 'success');
                loadData();
            } else {
                showToast(data.error || 'Error al enviar', 'error');
            }
        } catch (err) {
            showToast('Error de red: ' + err.message, 'error');
            setTestResult({ error: err.message });
        } finally {
            setSending(false);
        }
    };

    // Enviar notificación de prueba con datos de una materia real monitoreada
    const handleSendCourseTest = async (course, type) => {
        if (!user) {
            showToast('Debes iniciar sesión', 'warning');
            return;
        }
        if (!canUseNotifications) {
            showToast('Las notificaciones requieren una cuenta institucional UDG.', 'warning');
            return;
        }
        const nrc = course.nrc || '00000';
        const materia = course.materia || 'Materia';

        let title, body;
        switch (type) {
            case 'seat_available':
                title = `🎓 ¡Cupo disponible!`;
                body = `${materia} — NRC ${nrc} tiene lugar(es) disponible(s).`;
                break;
            case 'schedule_change':
                title = `Aviso: Cambio de horario`;
                body = `${materia} — NRC ${nrc} ha modificado su horario o profesor.`;
                break;
            case 'professor_change':
                title = `Profesor: Cambio de profesor`;
                body = `${materia} — NRC ${nrc} tiene un cambio de profesor asignado.`;
                break;
            default:
                title = `🔔 Notificación`;
                body = `${materia} — NRC ${nrc}`;
        }

        try {
            const idToken = await user.getIdToken();

            // Buscar si el NRC está en algún horario guardado
            let scheduleId = '';
            try {
                const schedules = await getUserSchedules(user.uid);
                const match = schedules.find(s => s.selectedNRCs?.includes(Number(nrc)));
                if (match) scheduleId = match.id;
            } catch {
                // La prueba puede continuar sin vincularse a un horario.
            }

            const res = await fetch('/api/test-notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ title, body, type, nrc, materia, scheduleId }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Notificación "${type}" enviada para ${materia}`, 'success');
                loadData();
            } else {
                showToast(data.error || 'Error al enviar', 'error');
            }
        } catch (err) {
            showToast('Error de red: ' + err.message, 'error');
        }
    };

    // Monitor rápido
    const handleQuickMonitor = async () => {
        if (!canUseNotifications) {
            showToast('El monitoreo requiere una cuenta institucional UDG.', 'warning');
            return;
        }
        if (!quickNrc || !quickMateria) {
            showToast('Ingresa NRC y materia', 'warning');
            return;
        }
        try {
            const started = await startMonitor({
                nrc: quickNrc,
                materia: quickMateria,
                ciclo: quickCiclop,
                horarioLabel: quickCiclop,
                registered: false,
            });
            if (!started) throw new Error('No se pudo activar el monitoreo');
            showToast(`Monitoreo activado para NRC ${quickNrc}`, 'success');
            loadData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // Detener monitoreo
    const handleStopMonitor = async (nrc, ciclo) => {
        if (!canUseNotifications) {
            showToast('El monitoreo requiere una cuenta institucional UDG.', 'warning');
            return;
        }
        try {
            const stopped = await stopMonitor(nrc, ciclo);
            if (!stopped) throw new Error('No se pudo detener el monitoreo');
            showToast(`Monitoreo detenido para NRC ${nrc}`, 'info');
            loadData();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };

    // Marcar notificación como leída
    const handleMarkRead = async (notifId) => {
        if (!user || !canUseNotifications) return;
        await markNotificationRead(user.uid, notifId);
        loadData();
        if (typeof fetchNotifications === 'function') fetchNotifications();
    };

    // Forzar refresco
    const handleRefresh = () => {
        loadData();
        if (typeof fetchNotifications === 'function') fetchNotifications();
        showToast('Datos recargados', 'info');
    };

    if (!user) {
        return (
            <div className="test-page">
                <div className="test-container">
                    <h1>🧪 Prueba de Notificaciones</h1>
                    <div className="test-card test-card-warn">
                        <p>Debes <strong>iniciar sesión</strong> para usar esta página de prueba.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="test-page">
            <div className="test-container">
                <div className="test-header-bar">
                    <h1>🧪 Prueba de Notificaciones</h1>
                    <div className="test-header-actions">
                        <span className="test-user-badge">{user.email}</span>
                        <button className="test-btn test-btn-sm" onClick={handleRefresh} type="button">
                            ↻ Recargar
                        </button>
                    </div>
                </div>

                {/* Estado FCM */}
                <Section title="📡 Estado de FCM">
                    <div className="test-grid">
                        <div><StatusBadge ok={fcmInitialized} label="FCM Init" /></div>
                        <div><StatusBadge ok={permission === 'granted'} label={`Permiso: ${permission || 'no soportado'}`} /></div>
                        <div><StatusBadge ok={!!token} label="Token recuperado" /></div>
                        <div><StatusBadge ok={deviceRegistered} label={`Backend: ${deviceRegistrationStatus}`} /></div>
                        <div><StatusBadge ok={unreadCount > 0} label={`${unreadCount} no leídas`} /></div>
                    </div>
                    {token && (
                        <div className="test-token-box">
                            <strong>Token:</strong>
                            <code>{token.substring(0, 50)}…</code>
                        </div>
                    )}
                    {deviceError && <div className="test-token-box">Error: {deviceError}</div>}
                    {lastFetch && <div className="test-token-box">Última carga: {lastFetch}</div>}
                    <div className="test-btn-row">
                        <button className="test-btn" onClick={handleInitFCM} type="button">🔧 Iniciar FCM</button>
                        <button className="test-btn" onClick={handleRequestPermission} type="button">🔔 Solicitar permiso</button>
                        {!fcmInitialized && <span className="test-hint">Usa "Iniciar FCM" primero si no se inicializó solo</span>}
                    </div>
                </Section>

                {/* Enviar notificación de prueba */}
                <Section title="📨 Enviar notificación de prueba">
                    <div className="test-form">
                        <div className="test-field">
                            <label>Título</label>
                            <input
                                type="text"
                                value={testTitle}
                                onChange={e => setTestTitle(e.target.value)}
                                className="test-input"
                            />
                        </div>
                        <div className="test-field">
                            <label>Cuerpo</label>
                            <input
                                type="text"
                                value={testBody}
                                onChange={e => setTestBody(e.target.value)}
                                className="test-input"
                            />
                        </div>
                        <button
                            className="test-btn test-btn-primary"
                            onClick={handleSendTest}
                            disabled={sending}
                            type="button"
                        >
                            {sending ? 'Enviando...' : 'Enviar notificación push'}
                        </button>
                    </div>
                    {testResult && (
                        <div className={`test-result-box ${testResult.success ? 'ok' : 'err'}`}>
                            <pre>{JSON.stringify(testResult, null, 2)}</pre>
                        </div>
                    )}
                </Section>

                {/* Monitoreo rápido */}
                <Section title="Monitoreo rápido (NRC manual)">
                    <div className="test-form test-form-inline">
                        <div className="test-field">
                            <label>NRC</label>
                            <input
                                type="text"
                                value={quickNrc}
                                onChange={e => setQuickNrc(e.target.value)}
                                className="test-input"
                                placeholder="ej. 12345"
                            />
                        </div>
                        <div className="test-field">
                            <label>Materia</label>
                            <input
                                type="text"
                                value={quickMateria}
                                onChange={e => setQuickMateria(e.target.value)}
                                className="test-input"
                                placeholder="ej. Cálculo I"
                            />
                        </div>
                        <div className="test-field">
                            <label>Ciclo</label>
                            <input
                                type="text"
                                value={quickCiclop}
                                onChange={e => setQuickCiclop(e.target.value)}
                                className="test-input test-input-sm"
                            />
                        </div>
                        <button className="test-btn test-btn-primary" onClick={handleQuickMonitor} type="button">
                            ➕ Monitorear
                        </button>
                    </div>
                    {localCourses.length === 0 ? (
                        <p className="test-muted">No hay materias monitoreadas aún.</p>
                    ) : (
                        <div className="test-list">
                            {localCourses.map(c => (
                                <div key={c.id || c.nrc} className="test-list-item">
                                    <div className="test-list-item-info">
                                        <strong>{c.materia || '—'}</strong>
                                        <span className="test-nrc">NRC {c.nrc}</span>
                                        {c.horarioLabel && <span className="test-tag">{c.horarioLabel}</span>}
                                        {c.registered && <span className="test-tag test-tag-green">registrado</span>}
                                    </div>
                                    <button
                                        className="test-btn test-btn-danger test-btn-sm"
                                        onClick={() => handleStopMonitor(c.nrc, c.ciclo || c.ciclop)}
                                        type="button"
                                    >
                                        ✕ Detener
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>

                {/* Pruebas con materias reales */}
                <Section title="🧪 Notificaciones desde materias reales">
                    {localCourses.length === 0 ? (
                        <p className="test-muted">
                            No hay materias monitoreadas. Usa la sección "Monitoreo rápido" o agrega materias desde el planificador.
                        </p>
                    ) : (
                        <div className="test-list">
                            {localCourses.map(c => (
                                <div key={c.id || c.nrc} className="test-list-item test-list-item-vertical">
                                    <div className="test-list-item-info">
                                        <strong>{c.materia || '—'}</strong>
                                        <span className="test-nrc">NRC {c.nrc}</span>
                                        {c.horarioLabel && <span className="test-tag">{c.horarioLabel}</span>}
                                    </div>
                                    <div className="test-course-actions">
                                        <button
                                            className="test-btn test-btn-sm test-btn-green"
                                            onClick={() => handleSendCourseTest(c, 'seat_available')}
                                            type="button"
                                            title="Simular cupo disponible"
                                        >
                                            🎓 Cupo
                                        </button>
                                        <button
                                            className="test-btn test-btn-sm test-btn-orange"
                                            onClick={() => handleSendCourseTest(c, 'schedule_change')}
                                            type="button"
                                            title="Simular cambio de horario"
                                        >
                                            Aviso: Horario
                                        </button>
                                        <button
                                            className="test-btn test-btn-sm test-btn-purple"
                                            onClick={() => handleSendCourseTest(c, 'professor_change')}
                                            type="button"
                                            title="Simular cambio de profesor"
                                        >
                                            Profesor
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="test-hint" style={{ marginTop: '0.5rem' }}>
                        Cada botón envía una notificación real con los datos de la materia y prueba la navegación por tipo.
                    </p>
                </Section>

                {/* Notificaciones recientes */}
                <Section title={`📋 Notificaciones recientes (${localNotifs.length})`}>
                    {localNotifs.length === 0 ? (
                        <p className="test-muted">No hay notificaciones aún.</p>
                    ) : (
                        <div className="test-list">
                            {localNotifs.map(n => (
                                <div key={n.id} className={`test-list-item ${!n.read ? 'test-unread' : ''}`}>
                                    <div className="test-list-item-info">
                                        <strong>{n.title || '—'}</strong>
                                        <p className="test-body-preview">{n.body || '—'}</p>
                                        <div className="test-meta">
                                            <span className={`test-tag ${n.type === 'seat_available' ? 'test-tag-green' : n.type === 'schedule_change' ? 'test-tag-orange' : ''}`}>
                                                {n.type || 'general'}
                                            </span>
                                            {n.data?.nrc && <span className="test-nrc">NRC {n.data.nrc}</span>}
                                            {!n.read && <span className="test-tag test-tag-blue">nueva</span>}
                                        </div>
                                    </div>
                                    {!n.read && (
                                        <button
                                            className="test-btn test-btn-sm"
                                            onClick={() => handleMarkRead(n.id)}
                                            type="button"
                                        >
                                            ✓ Leída
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    <button className="test-btn test-btn-sm" onClick={() => loadData()} type="button">
                        Recargar notificaciones
                    </button>
                </Section>

                {/* Atajos */}
                <Section title="⚡ Atajos de prueba" defaultOpen={false}>
                    <div className="test-btn-row">
                        <button
                            className="test-btn"
                            onClick={() => { setTestTitle('🎓 ¡Cupo disponible!'); setTestBody('Cálculo Diferencial — NRC 12345 tiene 3 lugar(es) disponible(s).'); }}
                            type="button"
                        >
                            📗 Cupo disponible
                        </button>
                        <button
                            className="test-btn"
                            onClick={() => { setTestTitle('Aviso: Cambio de horario'); setTestBody('Física II — NRC 67890 ha modificado su horario o profesor.'); }}
                            type="button"
                        >
                            Cambio de horario
                        </button>
                        <button
                            className="test-btn"
                            onClick={() => { setTestTitle('🔔 Recordatorio'); setTestBody('Tu horario guardado "Semestre 2025A" está por comenzar.'); }}
                            type="button"
                        >
                            🔔 Recordatorio
                        </button>
                    </div>
                </Section>
            </div>
        </div>
    );
}
