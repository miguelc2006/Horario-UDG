// src/components/MonitorToggle.jsx
// Botón de campana para activar/desactivar monitoreo de un NRC
// Se integra en las mini-cards de SeleccionMaterias
// Soporta vinculación a uno o varios horarios guardados
import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { showToast } from '../utils/toast.js';
import './MonitorToggle.css';

const MonitorToggle = React.memo(({ nrc, materia, clave, profesor, cup, majrp, ciclo, horarioLabel, scheduleId, availableSchedules, currentScheduleId }) => {
    const { user, canUseNotifications } = useAuth();
    const {
        isMonitoring,
        getMonitorData,
        startMonitor,
        stopMonitor,
        requestPermission,
        permission,
        deviceRegistered,
        deviceError,
    } = useNotifications();
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [registered, setRegistered] = useState(false);

    // Estado para selección de horarios
    const [selectedScheduleIds, setSelectedScheduleIds] = useState([]);

    const monitoring = isMonitoring(nrc, ciclo);
    const monitorData = getMonitorData(nrc, ciclo);

    // Pre-seleccionar horarios que contienen este NRC o el currentScheduleId
    const handleOpenModal = useCallback(() => {
        const preSelected = [];
        if (Array.isArray(availableSchedules)) {
            availableSchedules.forEach(sch => {
                const sNRCs = (sch.selectedNRCs || []).map(String);
                if (sNRCs.includes(String(nrc)) || sch.id === currentScheduleId) {
                    preSelected.push(sch.id);
                }
            });
        }
        // Si no se preseleccionó ninguno pero hay currentScheduleId, usarlo
        if (preSelected.length === 0 && currentScheduleId) {
            preSelected.push(currentScheduleId);
        }
        setSelectedScheduleIds(preSelected);
        setShowModal(true);
    }, [availableSchedules, nrc, currentScheduleId]);

    // Alternar selección de un horario en el modal
    const toggleSchedule = useCallback((id) => {
        setSelectedScheduleIds(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    }, []);

    const handleToggle = useCallback(async (e) => {
        e?.stopPropagation();

        if (!user) {
            showToast('Debes iniciar sesión para monitorear materias.', 'warning');
            return;
        }
        if (!canUseNotifications) {
            showToast('Usa un correo @alumnos.udg.mx o @academicos.udg.mx para monitorear materias.', 'warning');
            return;
        }

        // Si ya está monitoreando, desactivar
        if (monitoring) {
            setLoading(true);
            const stopped = await stopMonitor(nrc, ciclo);
            setLoading(false);
            if (!stopped) showToast('No se pudo detener el monitoreo. Intenta de nuevo.', 'error');
            return;
        }

        // El monitoreo solo se activa si este dispositivo puede recibir push.
        if (permission !== 'granted' || !deviceRegistered) {
            const registeredDevice = await requestPermission();
            if (!registeredDevice) {
                const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';
                showToast(
                    blocked
                        ? 'Notificaciones bloqueadas. Actívalas en la configuración del navegador.'
                        : (deviceError || 'No se pudo registrar este dispositivo para recibir notificaciones.'),
                    'warning'
                );
                return;
            }
        }

        // Mostrar modal para configurar tipo de monitoreo
        handleOpenModal();
    }, [user, canUseNotifications, monitoring, nrc, ciclo, permission, deviceRegistered, deviceError, requestPermission, stopMonitor, handleOpenModal]);

    const handleConfirmMonitor = useCallback(async () => {
        setLoading(true);
        setShowModal(false);

        const ok = await startMonitor({
            nrc: String(nrc),
            materia: materia || '',
            clave: clave || '',
            profesor: profesor || '',
            cup: cup || '',
            majrp: majrp || '',
            ciclo: ciclo || '',
            horarioLabel: horarioLabel || '',
            registered,
            scheduleIds: selectedScheduleIds.length > 0 ? selectedScheduleIds : (scheduleId ? [scheduleId] : []),
        });

        setLoading(false);
        if (!ok) {
            showToast('Error al activar monitoreo. Intenta de nuevo.', 'error');
        }
    }, [nrc, materia, clave, profesor, cup, majrp, ciclo, horarioLabel, registered, selectedScheduleIds, scheduleId, startMonitor]);

    // Determinar estado visual
    let icon = '🔕';
    let title = 'Monitorear esta materia';
    let stateClass = '';

    if (loading) {
        icon = '⏳';
        title = 'Procesando...';
        stateClass = 'loading';
    } else if (monitoring) {
        if (monitorData?.registered) {
            icon = '🔔';
            title = 'Monitoreando cambios (inscrito)';
            stateClass = 'active-registered';
        } else {
            icon = '🔔';
            title = 'Monitoreando cupos disponibles';
            stateClass = 'active-seats';
        }
    }

    return (
        <>
            <button
                className={`monitor-toggle ${stateClass}`}
                onClick={handleToggle}
                title={title}
                aria-label={title}
                disabled={loading}
            >
                <span className="monitor-icon">{icon}</span>
                {monitoring && <span className="monitor-dot" />}
            </button>

            {showModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="monitor-modal animate-scale-up" onClick={e => e.stopPropagation()}>
                        <div className="monitor-modal-header">
                            <h3>🔔 Monitorear materia</h3>
                            <button className="modal-close-btn" onClick={() => setShowModal(false)}>×</button>
                        </div>

                        <div className="monitor-modal-body">
                            <p className="monitor-modal-subtitle">
                                {materia || 'Materia'} — NRC {nrc}
                            </p>

                            <label className="monitor-option">
                                <input
                                    type="checkbox"
                                    checked={registered}
                                    onChange={e => setRegistered(e.target.checked)}
                                />
                                <div className="monitor-option-content">
                                    <strong>Ya estoy inscrito(a)</strong>
                                    <p>Solo notificarme si cambia el horario o profesor.</p>
                                </div>
                            </label>

                            <div className="monitor-info-box">
                                {registered ? (
                                    <p>📋 Monitorearemos cambios en el horario y profesor asignado.</p>
                                ) : (
                                    <p>🎯 Te avisaremos cuando haya <strong>cupos disponibles</strong> para esta materia.</p>
                                )}
                                <p className="monitor-info-note">
                                    Las verificaciones se realizan cada ~15 minutos.
                                    Necesitarás tener las notificaciones activadas.
                                </p>
                            </div>

                            {Array.isArray(availableSchedules) && availableSchedules.length > 0 && (
                                <div className="monitor-schedule-picker">
                                    <p className="monitor-picker-title">📁 Vincular a horario(s):</p>
                                    <p className="monitor-picker-hint">Al recibir una notificación podrás abrir el horario directamente.</p>
                                    <div className="monitor-schedule-list">
                                        <label className="monitor-schedule-option">
                                            <input
                                                type="checkbox"
                                                checked={selectedScheduleIds.length === 0}
                                                onChange={() => setSelectedScheduleIds([])}
                                            />
                                            <span className="monitor-schedule-name">Ninguno (solo notificación)</span>
                                        </label>
                                        {availableSchedules.map(sch => (
                                            <label key={sch.id} className="monitor-schedule-option">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedScheduleIds.includes(sch.id)}
                                                    onChange={() => toggleSchedule(sch.id)}
                                                />
                                                <span className="monitor-schedule-name">{sch.name || 'Sin título'}</span>
                                                {(sch.selectedNRCs || []).map(String).includes(String(nrc)) && (
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
                                onClick={() => setShowModal(false)}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-primary"
                                onClick={handleConfirmMonitor}
                            >
                                {registered ? 'Monitorear cambios' : 'Monitorear cupos'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
});

MonitorToggle.displayName = 'MonitorToggle';

export default MonitorToggle;
