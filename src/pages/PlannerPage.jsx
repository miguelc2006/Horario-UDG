// src/pages/PlannerPage.jsx
// Planificador simplificado: solo crear horarios nuevos desde cero
import React from 'react';
import { createPortal } from 'react-dom';

// Hooks
import { usePlanner } from '../hooks/usePlanner';

// Componentes UI
import { ConsultaForm } from '../components/ConsultaForm.jsx';
import { SeleccionMaterias } from '../components/SeleccionMaterias.jsx';
import { GenerarHorario } from '../components/GenerarHorario.jsx';

import './PlannerPage.css';

export function PlannerPage() {
    const {
        user, theme, saving, isResetModalOpen, setIsResetModalOpen, loading, error, resultsRef,
        materias, selectedNRCs, setSelectedNRCs, consultaRealizada, formParams, calendarioLabel,
        currentScheduleId, setCurrentScheduleId, currentScheduleName,
        conflicts, isConflictModalOpen, resolveConflicts,
        isDirty, blocker,
        handleSaveCloud, handleDiscardNavigation, handleCancelNavigation, handleTriggerReset, handleConfirmReset,
        handleConsulta, handleRemoveNrc, clasesSeleccionadas,
        showNameModal, pendingName, setPendingName, handleNameModalConfirm, handleNameModalCancel,
        showNotFoundModal, handleNotFoundSaveAsNew, handleNotFoundDiscard,
        formResetKey,
        nrcTarget
    } = usePlanner();

    // --- RENDER ---
    return (
        <div className="planner-page-container animate-fade-in">
            {/* Topbar unificada (idéntica a MySchedulesPage editor-topbar) */}
            <div className="editor-topbar planner-topbar">
                <div className="editor-title-group">
                    <h2 className="editor-title">
                        📅 {currentScheduleName || 'Planificador de Horarios'}
                        {isDirty && <span className="unsaved-badge" title="Cambios sin guardar">●</span>}
                    </h2>
                </div>
                {user && (
                    <div className="editor-actions-top">
                        {currentScheduleId && (
                            <button
                                onClick={() => { setCurrentScheduleId(null); handleSaveCloud(); }}
                                className="secondary-button btn-small"
                                disabled={saving}
                            >
                                📋 Duplicar
                            </button>
                        )}
                        {selectedNRCs.length > 0 && (
                            <button
                                onClick={handleSaveCloud}
                                disabled={saving}
                                className="primary-button btn-small btn-save-editor"
                            >
                                {saving ? 'Guardando...' : (currentScheduleId ? '💾 Actualizar' : '💾 Guardar')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Banner de deep link si viene desde notificación */}
            {nrcTarget && !consultaRealizada && (
                <div className="alert alert-info deep-link-banner" style={{ margin: '0 0 1.5rem', padding: '10px 16px', borderRadius: '8px', fontSize: '0.9rem' }}>
                    🔗 Notificación recibida: buscando NRC <strong>{nrcTarget}</strong>.
                    Usa los filtros para consultar la oferta y la materia se preseleccionará.
                </div>
            )}

            <div className="planner-layout editor-planner-layout">
                {/* Sidebar: Filtros */}
                <aside className="layout-sidebar">
                    <div className="card sticky-card">
                        <h2 className="panel-title">Filtros de Búsqueda</h2>
                        <ConsultaForm key={formResetKey} onConsultar={handleConsulta} loading={loading} initialParams={formParams} />
                        {error && <div className="alert alert-error"><h4>Error</h4><p>{error}</p></div>}

                        {consultaRealizada && (
                            <button className="btn-new-query" onClick={handleTriggerReset} title="Reiniciar">
                                <span>🔄</span> Iniciar Nueva Consulta
                            </button>
                        )}
                    </div>
                </aside>

                {/* Content: Materias y Horario */}
                <section className="layout-content" ref={resultsRef}>
                    {!consultaRealizada ? (
                        <div className="empty-state">
                            <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                            </svg>
                            <p className="empty-title">Planificador Académico</p>
                            <p className="empty-subtitle">Configura los filtros para armar tu horario desde cero.</p>
                            
                            {!user && (
                                <p className="login-prompt">
                                    <button className="login-link-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal'))}>
                                        Inicia sesión
                                    </button>{' '}
                                    para guardar tus horarios.
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="content-stack">
                            <div className="card panel">
                                <div className="panel-header">
                                    <h2 className="panel-title">Oferta Académica</h2>
                                    <span className="section-tag">{materias.length} Resultados</span>
                                </div>
                                <SeleccionMaterias
                                    materias={materias}
                                    selectedNRCs={selectedNRCs}
                                    onSelectionChange={setSelectedNRCs}
                                    ciclo={formParams?.calendario}
                                />
                            </div>

                            {selectedNRCs.length > 0 && (
                                <div className="card panel schedule-panel animate-slide-up">
                                    <div className="panel-header schedule-header">
                                        <div className="schedule-title-group">
                                            <h2 className="panel-title">Tu Horario</h2>
                                            {currentScheduleName && <span className="schedule-name-tag">{currentScheduleName}</span>}
                                            {isDirty && <span className="unsaved-badge" title="Cambios sin guardar">●</span>}
                                        </div>
                                    </div>
                                    <GenerarHorario
                                        clasesSeleccionadas={clasesSeleccionadas}
                                        calendarioLabel={calendarioLabel}
                                        theme={theme}
                                        onRemoveClase={handleRemoveNrc}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>

            {/* Modal Reset */}
            {isResetModalOpen && createPortal(
                <div className="modal-overlay" onClick={() => setIsResetModalOpen(false)}>
                    <div className="modal-content animate-scale-up modal-reset" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">¿Iniciar nueva consulta?</h2>
                        {!user ? (
                            <>
                                <p className="modal-warning-text">⚠️ <strong>No has iniciado sesión.</strong></p>
                                <p>Si continúas, <strong>perderás el horario actual</strong>.</p>
                                <div className="modal-actions vertical">
                                    <button className="primary-button" onClick={() => setIsResetModalOpen(false)}>Cancelar</button>
                                    <button className="secondary-button btn-danger-solid" onClick={handleConfirmReset}>Descartar</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p>Se limpiará la búsqueda actual. Los cambios no guardados se perderán.</p>
                                <div className="modal-actions">
                                    <button className="secondary-button" onClick={() => setIsResetModalOpen(false)}>Cancelar</button>
                                    <button className="primary-button" onClick={handleConfirmReset}>Aceptar</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* Modal de Resolución de Conflictos */}
            {isConflictModalOpen && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content animate-scale-up modal-conflict-resolution">
                        <h2 className="modal-title">Sincronización de Datos</h2>
                        <p>Se detectaron cambios en la oferta académica del SIIAU para las materias de tu horario actual:</p>

                        <div className="conflicts-list">
                            {conflicts.map((conflict, idx) => (
                                <div key={idx} className={`conflict-item ${conflict.removed ? 'item-removed' : ''}`}>
                                    <div className="conflict-nrc-header">
                                        <span className="nrc-badge">{conflict.nrc}</span>
                                        <strong>{conflict.materia}</strong>
                                        {conflict.deltas && (
                                            <div className="delta-tags">
                                                {conflict.deltas.map(d => <span key={d} className={`delta-tag tag-${d}`}>{d === 'horario' ? 'horario/aula' : d}</span>)}
                                            </div>
                                        )}
                                    </div>

                                    <div className="conflict-comparison">
                                        <div className="comparison-side old">
                                            <span className="side-label">Dato Guardado:</span>
                                            <div className="side-info">
                                                <div className="info-row"><span className="info-icon">👤</span> {conflict.old.profesor || 'Sin profesor'}</div>
                                                <div className="info-row"><span className="info-icon">👥</span> {conflict.old.disponibles} cupos</div>
                                                <div className="info-sessions-detailed">
                                                    {conflict.old.sesiones.map((s, i) => (
                                                        <div key={i} className="session-detail-card">
                                                            <div className="sd-time">📅 {s.dia} {s.hora_inicio}-{s.hora_fin}</div>
                                                            <div className="sd-location">📍 {s.edificio} - {s.aula}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="comparison-arrow">➡️</div>
                                        <div className="comparison-side fresh">
                                            <span className="side-label">Actual en SIIAU:</span>
                                            {conflict.removed ? (
                                                <div className="side-info info-removed"><div className="removal-msg">ESTA MATERIA YA NO FIGURA EN LA OFERTA</div></div>
                                            ) : (
                                                <div className="side-info">
                                                    <div className={`info-row ${conflict.deltas.includes('profesor') ? 'highlight-delta' : ''}`}><span className="info-icon">👤</span> {conflict.fresh.profesor || 'Sin profesor'}</div>
                                                    <div className={`info-row ${conflict.deltas.includes('cupos') ? 'highlight-delta' : ''}`}><span className="info-icon">👥</span> {conflict.fresh.disponibles} cupos</div>
                                                    <div className={`info-sessions-detailed ${conflict.deltas.includes('horario') ? 'highlight-delta' : ''}`}>
                                                        {conflict.fresh.sesiones.map((s, i) => (
                                                            <div key={i} className="session-detail-card">
                                                                <div className="sd-time">📅 {s.dia} {s.hora_inicio}-{s.hora_fin}</div>
                                                                <div className="sd-location">📍 {s.edificio} - {s.aula}</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions vertical">
                            <button className="primary-button" onClick={() => resolveConflicts('sync')}>Sincronizar con SIIAU (Recomendado)</button>
                            <button className="secondary-button" onClick={() => resolveConflicts('keep')}>Mantener mis datos actuales</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Modal Block Navigation */}
            {blocker.state === "blocked" && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content animate-scale-up modal-reset">
                        <h2 className="modal-title">¿Tienes cambios sin guardar?</h2>
                        <p>Estás intentando salir, pero tienes modificaciones sin guardar.</p>
                        <div className="modal-actions vertical">
                            <button className="primary-button" onClick={handleSaveCloud} disabled={saving}>
                                {saving ? 'Guardando...' : '💾 Guardar y Salir'}
                            </button>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', width: '100%' }}>
                                <button className="secondary-button" onClick={handleCancelNavigation} style={{ flex: 1 }}>Seguir Editando</button>
                                <button className="secondary-button btn-danger-solid" onClick={handleDiscardNavigation} style={{ flex: 1 }}>Descartar</button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ============ MODAL NOMBRE NUEVO HORARIO ============ */}
            {showNameModal && createPortal(
                <div className="modal-overlay" onClick={() => handleNameModalCancel()}>
                    <div className="modal-content animate-scale-up modal-name-input" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">Nuevo horario</h2>
                        <p>Escribe un nombre para tu horario:</p>
                        <input
                            type="text"
                            className="modal-input"
                            value={pendingName}
                            onChange={e => setPendingName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleNameModalConfirm(); if (e.key === 'Escape') handleNameModalCancel(); }}
                            placeholder="Mi Horario"
                            autoFocus
                            maxLength={60}
                        />
                        <div className="modal-actions">
                            <button className="secondary-button" onClick={handleNameModalCancel}>Cancelar</button>
                            <button className="primary-button" onClick={handleNameModalConfirm} disabled={!pendingName?.trim()}>Guardar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ============ MODAL HORARIO NO ENCONTRADO ============ */}
            {showNotFoundModal && createPortal(
                <div className="modal-overlay">
                    <div className="modal-content animate-scale-up modal-not-found">
                        <h2 className="modal-title">Horario no encontrado</h2>
                        <p>Este horario ya no existe en la nube (posiblemente fue eliminado).</p>
                        <p>¿Deseas guardarlo como un horario nuevo?</p>
                        <div className="modal-actions">
                            <button className="secondary-button" onClick={handleNotFoundDiscard}>Descartar</button>
                            <button className="primary-button" onClick={handleNotFoundSaveAsNew}>Guardar como nuevo</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}