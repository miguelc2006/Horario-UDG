// src/pages/MySchedulesPage.jsx
// Vista completa: lista de horarios guardados + editor inline con planificador
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getUserSchedules, deleteSchedule, updateSchedule, createSchedule } from '../services/storageService';
import { clearSession } from '../utils/session';
import { fetchOfertaAcademica } from '../services/siiauApi';
import { useNotifications } from '../hooks/useNotifications';
import { showToast } from '../utils/toast';
import { ConsultaForm } from '../components/ConsultaForm';
import { SeleccionMaterias } from '../components/SeleccionMaterias';
import { GenerarHorario } from '../components/GenerarHorario';
import './MySchedulesPage.css';
import './PlannerPage.css';

// Helper: agrupar sesiones por NRC (misma lógica que en usePlanner)
const groupSessionsByNRC = (classes) => {
    const map = new Map();
    const dayOrder = { 'LUNES': 1, 'MARTES': 2, 'MIERCOLES': 3, 'MIÉRCOLES': 3, 'JUEVES': 4, 'VIERNES': 5, 'SABADO': 6, 'SÁBADO': 6, 'DOMINGO': 7 };
    classes.forEach(c => {
        const nrc = String(c.nrc).trim();
        if (!map.has(nrc)) {
            map.set(nrc, {
                nrc, materia: (c.materia || c.nombre || '').trim().replace(/\s+/g, ' '),
                clave: (c.clave || '').trim(), profesor: (c.profesor || '').trim().replace(/\s+/g, ' '),
                disponibles: parseInt(c.disponibles) || 0, sesiones: []
            });
        }
        map.get(nrc).sesiones.push({
            dia: (c.dia || '').trim().toUpperCase(), hora_inicio: (c.hora_inicio || '').trim(),
            hora_fin: (c.hora_fin || '').trim(), edificio: (c.edificio || '').trim(), aula: (c.aula || '').trim()
        });
    });
    const result = Array.from(map.values());
    result.forEach(item => {
        item.sesiones.sort((a, b) => {
            const d1 = dayOrder[a.dia] || 99; const d2 = dayOrder[b.dia] || 99;
            if (d1 !== d2) return d1 - d2; return a.hora_inicio.localeCompare(b.hora_inicio);
        });
    });
    return result;
};

export function MySchedulesPage() {
    const { user, isAuthorized } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isMonitoring } = useNotifications();
    const outletTheme = null; // Se obtendría de Outlet context si es necesario
    const editorRef = useRef(null);

    // --- Lista de horarios ---
    const [schedules, setSchedules] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- Editor inline ---
    const [editingScheduleId, setEditingScheduleId] = useState(null);
    const [editorData, setEditorData] = useState(null); // { schedule, materias, selectedNRCs, formParams, ... }
    const [editMaterias, setEditMaterias] = useState([]);
    const [editSelectedNRCs, setEditSelectedNRCs] = useState([]);
    const [editFormParams, setEditFormParams] = useState({ centro: '', carrera: '', calendario: '' });
    const [editCalendarioLabel, setEditCalendarioLabel] = useState('');
    const [editConsultaRealizada, setEditConsultaRealizada] = useState(false);
    const [editLoading, setEditLoading] = useState(false);
    const [editError, setEditError] = useState(null);
    const [editSaving, setEditSaving] = useState(false);
    const [loadingSchedule, setLoadingSchedule] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    // Nombre editable
    const [editingName, setEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState('');

    // --- Modal de delete desde lista ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [scheduleToDelete, setScheduleToDelete] = useState(null);

    // Modal para eliminar desde el editor
    const [showEditorDeleteModal, setShowEditorDeleteModal] = useState(false);

    // Modal para duplicar con nombre
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateName, setDuplicateName] = useState('');

    // --- Conflictos del editor ---
    const [editConflicts, setEditConflicts] = useState([]);
    const [showEditConflictModal, setShowEditConflictModal] = useState(false);
    const editPendingDataRef = useRef(null);

    // --- NRC desde URL (deep linking desde notificaciones) ---
    const [deepLinkNrc, setDeepLinkNrc] = useState('');
    const [highlightNrc, setHighlightNrc] = useState('');
    const [deepLinkInfo, setDeepLinkInfo] = useState('');

    // --- Leer ?edit=ID y ?nrc=NRC de la URL al montar ---
    useEffect(() => {
        const editParam = searchParams.get('edit');
        const nrcParam = searchParams.get('nrc');
        if (editParam && user) {
            setEditingScheduleId(editParam);
        }
        if (nrcParam) {
            setHighlightNrc(nrcParam);
            // deepLinkNrc solo cuando también hay edit → activa auto-apertura del modal
            if (editParam) {
                setDeepLinkNrc(nrcParam);
            }
        }
    }, [searchParams, user]);

    // --- Cuando se carga un horario desde deep link con nrc, mostrar banner ---
    useEffect(() => {
        if (!deepLinkNrc || !editConsultaRealizada || editMaterias.length === 0) return;
        const materia = editMaterias.find(m => String(m.nrc) === String(deepLinkNrc));
        if (materia) {
            setDeepLinkInfo(`🔔 Notificación: ${materia.materia || 'Materia'} — NRC ${deepLinkNrc}`);
        } else {
            setDeepLinkInfo(`🔔 Notificación: NRC ${deepLinkNrc}`);
        }
    }, [deepLinkNrc, editConsultaRealizada, editMaterias]);

    // --- Cuando highlightNrc está presente sin edit, buscar en horarios guardados ---
    useEffect(() => {
        if (!highlightNrc || editingScheduleId || schedules.length === 0) return;
        const match = schedules.find(s =>
            s.selectedNRCs?.some(n => String(n) === String(highlightNrc))
        );
        if (match) {
            setEditingScheduleId(match.id);
        }
    }, [highlightNrc, schedules, editingScheduleId]);

    // --- Cargar horario a editar cuando editingScheduleId cambia ---
    useEffect(() => {
        if (!editingScheduleId || !user || !isAuthorized) return;
        loadScheduleForEdit(editingScheduleId);
    }, [editingScheduleId, user, isAuthorized]);

    // --- Cargar lista ---
    useEffect(() => {
        if (user && isAuthorized) {
            loadSchedules();
        } else {
            setSchedules([]);
            setLoading(false);
        }
    }, [user, isAuthorized]);

    const loadSchedules = async () => {
        setLoading(true);
        const data = await getUserSchedules(user.uid);
        data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        setSchedules(data);
        setLoading(false);
    };

    const loadScheduleForEdit = async (scheduleId) => {
        setLoadingSchedule(true);
        setEditConsultaRealizada(false);
        try {
            // Buscar en schedules ya cargados o cargar uno por uno
            let sch = schedules.find(s => s.id === scheduleId);
            if (!sch) {
                const all = await getUserSchedules(user.uid);
                sch = all.find(s => s.id === scheduleId);
            }
            if (!sch) { setEditingScheduleId(null); return; }

            const savedFormParams = sch.formParams || { centro: '', carrera: '', calendario: '' };
            const savedCalendarioLabel = sch.calendarioLabel || '';

            setEditorData(sch);
            setEditMaterias(sch.materias || []);
            setEditSelectedNRCs(sch.selectedNRCs || []);
            setEditFormParams(savedFormParams);
            setEditCalendarioLabel(savedCalendarioLabel);
            setEditError(null);
            setEditNameValue(sch.name || '');
            setEditingName(false);

            // Auto-consultar la oferta académica actual del SIIAU
            if (savedFormParams.centro && savedFormParams.carrera && savedFormParams.calendario) {
                try {
                    const apiParams = { cup: savedFormParams.centro, majrp: savedFormParams.carrera, ciclop: savedFormParams.calendario };
                    const newData = await fetchOfertaAcademica(apiParams);

                    if (newData && newData.length > 0) {
                        const oldSelectedFlat = (sch.materias || []).filter(m => (sch.selectedNRCs || []).includes(m.nrc));
                        const oldGrouped = groupSessionsByNRC(oldSelectedFlat);
                        const newGrouped = groupSessionsByNRC(newData);
                        const foundConflicts = [];

                        if (oldGrouped.length > 0) {
                            oldGrouped.forEach(oldNRC => {
                                const freshNRC = newGrouped.find(c => String(c.nrc) === String(oldNRC.nrc));
                                if (freshNRC) {
                                    const deltas = [];
                                    if (freshNRC.profesor !== oldNRC.profesor) deltas.push('profesor');
                                    if (freshNRC.disponibles !== oldNRC.disponibles) deltas.push('cupos');
                                    if (JSON.stringify(freshNRC.sesiones) !== JSON.stringify(oldNRC.sesiones)) deltas.push('horario');
                                    if (deltas.length > 0) {
                                        foundConflicts.push({ nrc: oldNRC.nrc, materia: oldNRC.materia, old: oldNRC, fresh: freshNRC, deltas });
                                    }
                                } else {
                                    foundConflicts.push({ nrc: oldNRC.nrc, materia: oldNRC.materia, old: oldNRC, fresh: null, removed: true });
                                }
                            });
                        }

                        if (foundConflicts.length > 0) {
                            // Verificar si TODOS los conflictos son solo de cupos
                            const soloCupos = foundConflicts.every(c =>
                                !c.removed && c.deltas.length === 1 && c.deltas[0] === 'cupos'
                            );

                            if (soloCupos) {
                                // Auto-resolver: sincronizar silenciosamente
                                const otherSelected = (sch.materias || []).filter(
                                    m => (sch.selectedNRCs || []).includes(m.nrc) && !newData.some(n => String(n.nrc) === String(m.nrc))
                                );
                                setEditMaterias([...newData, ...otherSelected]);
                            } else {
                                // Mostrar modal de conflictos
                                setEditConflicts(foundConflicts);
                                setShowEditConflictModal(true);
                                editPendingDataRef.current = { newData, oldMaterias: sch.materias || [], oldSelectedNRCs: sch.selectedNRCs || [] };
                            }
                        } else {
                            // Sin conflictos: usar datos actualizados
                            const otherSelected = (sch.materias || []).filter(
                                m => (sch.selectedNRCs || []).includes(m.nrc) && !newData.some(n => String(n.nrc) === String(m.nrc))
                            );
                            setEditMaterias([...newData, ...otherSelected]);
                        }
                    }
                } catch (fetchErr) {
                    // Si falla la consulta, no bloqueamos la edición — solo log y seguimos con datos guardados
                    console.warn("Auto-consulta falló al abrir editor:", fetchErr.message);
                }
            }

            setEditConsultaRealizada(true);

            // Scroll al editor
            setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
        } catch (err) {
            console.error("Error loading schedule for edit:", err);
            setEditError("No se pudo cargar el horario.");
        } finally {
            setLoadingSchedule(false);
        }
    };

    // --- Handlers del editor ---

    const handleEditConsulta = useCallback(async (params, calLabel) => {
        setEditFormParams(params);
        setEditCalendarioLabel(calLabel);
        setEditLoading(true);
        setEditError(null);
        try {
            const apiParams = { cup: params.centro, majrp: params.carrera, ciclop: params.calendario };
            const newData = await fetchOfertaAcademica(apiParams);
            if (!newData || newData.length === 0) throw new Error("Sin resultados.");

            // Conflicto simple: mantener materias seleccionadas que ya no están en la nueva búsqueda
            const otherSelected = editMaterias.filter(
                m => editSelectedNRCs.includes(m.nrc) && !newData.some(n => n.nrc === m.nrc)
            );
            setEditMaterias([...newData, ...otherSelected]);
            setEditConsultaRealizada(true);
        } catch (err) {
            setEditError(err.message);
            setEditConsultaRealizada(false);
            setEditMaterias([]);
        } finally {
            setEditLoading(false);
        }
    }, [editMaterias, editSelectedNRCs]);

    const handleEditSave = async () => {
        if (!user || !editingScheduleId || !editorData) return;
        if (!isAuthorized) {
            showToast('Usa un correo @alumnos.udg.mx para modificar horarios.', 'warning');
            return;
        }
        const selectedClasses = editMaterias.filter(m => editSelectedNRCs.includes(m.nrc));
        const scheduleData = { materias: selectedClasses, selectedNRCs: editSelectedNRCs, formParams: editFormParams, calendarioLabel: editCalendarioLabel };
        setEditSaving(true);
        try {
            const name = editNameValue.trim() || editorData.name || "Mi Horario";
            await updateSchedule(user.uid, editingScheduleId, { ...scheduleData, name });
            showToast(`"${name}" actualizado correctamente.`, 'success');
            await loadSchedules();
            // Actualizar el nombre local en editorData
            setEditorData(prev => ({ ...prev, name }));
        } catch (err) {
            console.error("Error al actualizar:", err);
            showToast("Error al guardar: " + (err.message || "Error desconocido"), 'error');
        } finally {
            setEditSaving(false);
        }
    };

    // Resolver conflictos del editor (sync = usar nuevos, keep = mantener viejos)
    const resolveEditConflicts = (action) => {
        if (!editPendingDataRef.current) return;
        const { newData, oldMaterias } = editPendingDataRef.current;
        const conflictedNRCs = editConflicts.map(c => String(c.nrc));

        if (action === 'sync') {
            const removedNRCs = editConflicts.filter(c => c.removed).map(c => String(c.nrc));
            const syncFilteredSelected = oldMaterias.filter(oldCls =>
                !newData.some(newCls => String(newCls.nrc) === String(oldCls.nrc)) &&
                !removedNRCs.includes(String(oldCls.nrc))
            );
            if (removedNRCs.length > 0) {
                setEditSelectedNRCs(prev => prev.filter(n => !removedNRCs.includes(String(n))));
            }
            setEditMaterias([...newData, ...syncFilteredSelected]);
            showToast("Información sincronizada con el SIIAU.", 'info');
        } else {
            const keptOldEntries = oldMaterias.filter(m => conflictedNRCs.includes(String(m.nrc)));
            const freshNonConflicted = newData.filter(c => !conflictedNRCs.includes(String(c.nrc)));
            const otherSelected = oldMaterias.filter(oldCls =>
                !conflictedNRCs.includes(String(oldCls.nrc)) &&
                !newData.some(newCls => String(newCls.nrc) === String(oldCls.nrc))
            );
            setEditMaterias([...freshNonConflicted, ...keptOldEntries, ...otherSelected]);
            showToast("Datos anteriores preservados. Revisa los cambios.", 'info');
        }
        setShowEditConflictModal(false);
        setEditConflicts([]);
        editPendingDataRef.current = null;
        setEditConsultaRealizada(true);
    };

    const handleEditDuplicate = async () => {
        if (!user) return;
        if (!isAuthorized) {
            showToast('Usa un correo @alumnos.udg.mx para duplicar horarios.', 'warning');
            return;
        }
        setDuplicateName((editorData?.name || "Mi Horario") + " (copia)");
        setShowDuplicateModal(true);
    };

    const confirmDuplicate = async () => {
        if (!user) return;
        if (!isAuthorized) {
            setShowDuplicateModal(false);
            showToast('Usa un correo @alumnos.udg.mx para duplicar horarios.', 'warning');
            return;
        }
        const name = duplicateName?.trim();
        if (!name) return;
        setShowDuplicateModal(false);
        const selectedClasses = editMaterias.filter(m => editSelectedNRCs.includes(m.nrc));
        const scheduleData = { materias: selectedClasses, selectedNRCs: editSelectedNRCs, formParams: editFormParams, calendarioLabel: editCalendarioLabel };
        setEditSaving(true);
        try {
            await createSchedule(user.uid, scheduleData, name);
            showToast("¡Horario duplicado exitosamente!", 'success');
            await loadSchedules();
        } catch (err) {
            console.error("Error al duplicar:", err);
            showToast("Error al duplicar: " + (err.message || "Error desconocido"), 'error');
        } finally {
            setEditSaving(false);
        }
    };

    const handleEditDelete = async () => {
        if (!user || !editingScheduleId) return;
        if (!isAuthorized) {
            showToast('Usa un correo @alumnos.udg.mx para eliminar horarios.', 'warning');
            return;
        }
        setShowEditorDeleteModal(true);
    };

    const confirmEditorDelete = async () => {
        if (!user || !editingScheduleId) return;
        if (!isAuthorized) {
            setShowEditorDeleteModal(false);
            showToast('Usa un correo @alumnos.udg.mx para eliminar horarios.', 'warning');
            return;
        }
        setShowEditorDeleteModal(false);
        setIsDeleting(true);
        try {
            await deleteSchedule(user.uid, editingScheduleId);
            showToast("Horario eliminado.", 'warning');
            await loadSchedules();
            exitEditMode();
        } catch (err) {
            console.error("Error al eliminar:", err);
            showToast("Error al eliminar.", 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const exitEditMode = () => {
        setEditingScheduleId(null);
        setEditorData(null);
        setEditMaterias([]);
        setEditSelectedNRCs([]);
        setEditFormParams({ centro: '', carrera: '', calendario: '' });
        setEditCalendarioLabel('');
        setEditConsultaRealizada(false);
        setEditError(null);
        setDeepLinkNrc('');
        setHighlightNrc('');
        setDeepLinkInfo('');
        // Limpiar URL param
        setSearchParams({});
    };

    // --- Handlers de lista ---

    const handleCreateNew = () => {
        clearSession();
        navigate('/planear');
    };

    // Click en la cabecera/tarjeta (no en el área de toggle) → seleccionar para editar
    const handleCardSelect = (sch) => {
        if (!isAuthorized) {
            showToast('Tu cuenta está en modo consulta y no tiene horarios guardados.', 'warning');
            return;
        }
        if (editingScheduleId === sch.id) return;
        setEditingScheduleId(sch.id);
        setSearchParams({ edit: sch.id });
    };

    const [expandedIds, setExpandedIds] = useState(new Set());
    const handleToggleExpand = (id) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const openDeleteModal = (e, id) => {
        e.stopPropagation();
        if (!isAuthorized) {
            showToast('Usa un correo @alumnos.udg.mx para eliminar horarios.', 'warning');
            return;
        }
        setScheduleToDelete(id);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!scheduleToDelete) return;
        if (!isAuthorized) {
            setIsDeleteModalOpen(false);
            showToast('Usa un correo @alumnos.udg.mx para eliminar horarios.', 'warning');
            return;
        }
        setIsDeleting(true);
        try {
            await deleteSchedule(user.uid, scheduleToDelete);
            showToast("Horario eliminado.", 'warning');
            await loadSchedules();
            setIsDeleteModalOpen(false);
            setScheduleToDelete(null);
            if (editingScheduleId === scheduleToDelete) exitEditMode();
        } catch (error) {
            console.error("Error al eliminar:", error);
            showToast("Hubo un error al eliminar el horario.", 'error');
        } finally {
            setIsDeleting(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
            return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dateString));
        } catch { return ''; }
    };

    const clasesSeleccionadas = useMemo(() => editMaterias.filter(m => editSelectedNRCs.includes(m.nrc)), [editMaterias, editSelectedNRCs]);

    // --- RENDER ---
    return (
        <div className="schedules-page animate-fade-in">
            {/* ==================== HEADER ==================== */}
            <header className="page-header">
                <div>
                    <h1 className="page-title">Mis Horarios</h1>
                    <p className="page-subtitle">Gestiona y edita tus planificaciones guardadas.</p>
                </div>
                <button onClick={handleCreateNew} className="primary-button btn-new">
                    <span>+</span> Nuevo Horario
                </button>
            </header>

            {/* ==================== LISTA DE HORARIOS ==================== */}
            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando tus horarios...</p>
                </div>
            ) : schedules.length === 0 ? (
                <div className="empty-state-schedules">
                    <div className="empty-icon">📅</div>
                    <h3>No tienes horarios guardados</h3>
                    <p>Crea tu primer horario para verlo aquí.</p>
                    <button onClick={handleCreateNew} className="secondary-button mt-4">
                        Comenzar ahora
                    </button>
                </div>
            ) : (
                <div className="schedules-grid">
                    {schedules.map(sch => {
                        const isExpanded = expandedIds.has(sch.id);
                        const isEditing = editingScheduleId === sch.id;
                        const rawSubjects = (sch.materias || []).filter(m => (sch.selectedNRCs || []).includes(m.nrc));
                        const uniqueSubjects = rawSubjects.filter((obj, i, self) => i === self.findIndex(t => t.nrc === obj.nrc));

                        return (
                            <div
                                key={sch.id}
                                className={`schedule-card ${isExpanded ? 'expanded' : ''} ${isEditing ? 'editing' : ''}`}
                            >
                                <div className="card-top-bar"></div>
                                <div className="card-content" onClick={() => handleCardSelect(sch)}>
                                    <div className="card-header-row">
                                        <h3 className="schedule-name" title={sch.name}>{sch.name}</h3>
                                        <button onClick={(e) => openDeleteModal(e, sch.id)} className="btn-delete" title="Eliminar horario">🗑️</button>
                                    </div>
                                    <div className="schedule-meta">
                                        {sch.calendarioLabel && <span className="meta-badge cycle-badge">{sch.calendarioLabel.split(' - ')[0]}</span>}
                                        <span className="meta-badge subjects-badge">{uniqueSubjects.length} Materias</span>
                                        {isEditing && <span className="meta-badge editing-badge">Editando</span>}
                                    </div>
                                    {sch.formParams?.carrera && <p className="career-text">{sch.formParams.carrera}</p>}
                                    <div className="card-toggle-area" onClick={() => handleToggleExpand(sch.id)}>
                                        <div className={`subjects-list-container ${isExpanded ? 'open' : ''}`}>
                                            <div className="subjects-divider"></div>
                                            <ul className="mini-subjects-list">
                                                {uniqueSubjects.map(subj => (
                                                    <li key={subj.nrc} className="mini-subject-item">
                                                        <span className="mini-subject-nrc">{subj.nrc}</span>
                                                        <span className="mini-subject-name">{subj.materia}</span>
                                                        {isMonitoring(subj.nrc) && <span className="mini-subject-monitor" title="Monitoreando">🔔</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="card-footer">
                                            <span className="btn-toggle-details">
                                                {isExpanded ? 'Ocultar ▲' : 'Ver materias ▼'}
                                            </span>
                                            <span className="last-update">{formatDate(sch.updatedAt)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ==================== EDITOR INLINE ==================== */}
            {editingScheduleId && (
                <div className="schedule-editor-section animate-slide-up" ref={editorRef}>
                    {/* Barra superior del editor */}
                    <div className="editor-topbar">
                        <button className="secondary-button btn-back" onClick={exitEditMode}>
                            ← Volver a lista
                        </button>
                        <div className="editor-title-group">
                            {editingName ? (
                                <div className="editor-name-edit">
                                    <input
                                        type="text"
                                        className="editor-name-input"
                                        value={editNameValue}
                                        onChange={e => setEditNameValue(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') setEditingName(false); if (e.key === 'Escape') { setEditNameValue(editorData?.name || ''); setEditingName(false); } }}
                                        onBlur={() => setEditingName(false)}
                                        autoFocus
                                        maxLength={60}
                                        placeholder="Nombre del horario"
                                    />
                                    <small className="editor-name-hint">Enter para confirmar</small>
                                </div>
                            ) : (
                                <h2 className="editor-title" onClick={() => { setEditNameValue(editorData?.name || ''); setEditingName(true); }} title="Clic para editar nombre">
                                    ✏️ {editorData?.name || 'Editando horario'}
                                    <span className="editor-rename-hint">✎</span>
                                </h2>
                            )}
                        </div>
                        <div className="editor-actions-top">
                            <button className="secondary-button btn-small" onClick={handleEditDuplicate} disabled={editSaving || !editConsultaRealizada}>
                                📋 Duplicar
                            </button>
                            <button className="primary-button btn-small btn-save-editor" onClick={handleEditSave} disabled={editSaving || !editConsultaRealizada}>
                                {editSaving ? 'Guardando...' : '💾 Guardar'}
                            </button>
                            <button className="btn-delete-editor" onClick={handleEditDelete} disabled={isDeleting} title="Eliminar horario">
                                🗑️
                            </button>
                        </div>
                    </div>

                    {/* Banner de deep link desde notificación */}
                    {deepLinkInfo && (
                        <div className="alert alert-info deep-link-banner" style={{ margin: '12px 16px', padding: '10px 16px', borderRadius: '8px', fontSize: '0.9rem' }}>
                            {deepLinkInfo}
                            <button
                                onClick={() => setDeepLinkInfo('')}
                                style={{ marginLeft: '12px', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, fontSize: '1rem' }}
                                aria-label="Cerrar"
                            >×</button>
                        </div>
                    )}

                    {loadingSchedule ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Cargando horario...</p>
                        </div>
                    ) : (
                        <div className="planner-layout editor-planner-layout">
                            {/* Sidebar: Filtros */}
                            <aside className="layout-sidebar">
                                <div className="card sticky-card">
                                    <h2 className="panel-title">Filtros de Búsqueda</h2>
                                    <ConsultaForm onConsultar={handleEditConsulta} loading={editLoading} initialParams={editFormParams} />
                                    {editError && <div className="alert alert-error"><h4>Error</h4><p>{editError}</p></div>}
                                    {editConsultaRealizada && (
                                        <button className="btn-new-query" onClick={() => {
                                            setEditMaterias([]);
                                            setEditSelectedNRCs([]);
                                            setEditConsultaRealizada(false);
                                            setEditError(null);
                                        }}>
                                            <span>🔄</span> Nueva Consulta
                                        </button>
                                    )}
                                </div>
                            </aside>

                            {/* Content: Materias y Horario */}
                            <section className="layout-content">
                                {!editConsultaRealizada ? (
                                    <div className="empty-state">
                                        <svg className="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" width="64" height="64">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                                        </svg>
                                        <p className="empty-title">Selecciona un horario o realiza una consulta</p>
                                        <p className="empty-subtitle">Usa los filtros para actualizar la oferta académica.</p>
                                    </div>
                                ) : (
                                    <div className="content-stack">
                                        <div className="card panel">
                                            <div className="panel-header">
                                                <h2 className="panel-title">Oferta Académica</h2>
                                                <span className="section-tag">{editMaterias.length} Resultados</span>
                                            </div>
                                            <SeleccionMaterias
                                                materias={editMaterias}
                                                selectedNRCs={editSelectedNRCs}
                                                onSelectionChange={setEditSelectedNRCs}
                                                ciclo={editFormParams.calendario}
                                                availableSchedules={schedules}
                                                currentScheduleId={editingScheduleId}
                                                deepLinkNrc={deepLinkNrc}
                                                highlightNrc={highlightNrc}
                                            />
                                        </div>

                                        {editSelectedNRCs.length > 0 && (
                                            <div className="card panel schedule-panel animate-slide-up">
                                                <div className="panel-header schedule-header">
                                                    <div className="schedule-title-group">
                                                        <h2 className="panel-title">Tu Horario</h2>
                                                        {editorData?.name && <span className="schedule-name-tag">{editorData.name}</span>}
                                                    </div>
                                                </div>
                                                <GenerarHorario
                                                    clasesSeleccionadas={clasesSeleccionadas}
                                                    calendarioLabel={editCalendarioLabel}
                                                    theme={outletTheme}
                                                    onRemoveClase={(nrc) => setEditSelectedNRCs(prev => prev.filter(n => n !== nrc))}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        </div>
                    )}
                </div>
            )}

            {/* ==================== MODAL ELIMINAR (lista) ==================== */}
            {isDeleteModalOpen && createPortal(
                <div className="modal-overlay" onClick={() => !isDeleting && setIsDeleteModalOpen(false)}>
                    <div className="modal-content animate-scale-up modal-delete" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">¿Eliminar horario?</h2>
                        <p>Estás a punto de eliminar este horario permanentemente. <strong>Esta acción no se puede deshacer.</strong></p>
                        <div className="modal-actions">
                            <button className="secondary-button" onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting}>Cancelar</button>
                            <button className="primary-button btn-danger-solid" onClick={confirmDelete} disabled={isDeleting}>
                                {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== MODAL ELIMINAR (editor) ==================== */}
            {showEditorDeleteModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowEditorDeleteModal(false)}>
                    <div className="modal-content animate-scale-up modal-delete" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">¿Eliminar horario?</h2>
                        <p>Estás a punto de eliminar este horario permanentemente. <strong>Esta acción no se puede deshacer.</strong></p>
                        <div className="modal-actions">
                            <button className="secondary-button" onClick={() => setShowEditorDeleteModal(false)}>Cancelar</button>
                            <button className="primary-button btn-danger-solid" onClick={confirmEditorDelete}>Sí, Eliminar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== MODAL DUPLICAR NOMBRE ==================== */}
            {showDuplicateModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowDuplicateModal(false)}>
                    <div className="modal-content animate-scale-up modal-name-input" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">Duplicar horario</h2>
                        <p>Escribe un nombre para la copia:</p>
                        <input
                            type="text"
                            className="modal-input"
                            value={duplicateName}
                            onChange={e => setDuplicateName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') confirmDuplicate(); if (e.key === 'Escape') setShowDuplicateModal(false); }}
                            placeholder="Mi Horario (copia)"
                            autoFocus
                            maxLength={60}
                        />
                        <div className="modal-actions">
                            <button className="secondary-button" onClick={() => setShowDuplicateModal(false)}>Cancelar</button>
                            <button className="primary-button" onClick={confirmDuplicate} disabled={!duplicateName?.trim()}>Duplicar</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ==================== MODAL CONFLICTOS (editor) ==================== */}
            {showEditConflictModal && createPortal(
                <div className="modal-overlay" onClick={() => setShowEditConflictModal(false)}>
                    <div className="modal-content animate-scale-up modal-conflict" onClick={e => e.stopPropagation()}>
                        <h2 className="modal-title">⚠️ Cambios detectados en la oferta académica</h2>
                        <p>Se encontraron diferencias entre los datos guardados y la información actual del SIIAU.</p>

                        <div className="conflicts-list" style={{ maxHeight: '350px', overflowY: 'auto', margin: '16px 0', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                            {editConflicts.map(conflict => (
                                <div key={conflict.nrc} className="conflict-card" style={{ padding: '12px', marginBottom: '8px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                    <div className="conflict-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <strong style={{ color: 'var(--warning-color)' }}>[{conflict.nrc}]</strong>
                                        <span style={{ fontWeight: 500 }}>{conflict.materia}</span>
                                    </div>
                                    {conflict.removed ? (
                                        <div style={{ color: 'var(--danger-color)', fontWeight: 500, fontSize: '0.9rem' }}>
                                            ⛔ ESTA MATERIA YA NO FIGURA EN LA OFERTA
                                        </div>
                                    ) : (
                                        <div className="conflict-deltas" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                                            {conflict.deltas.includes('profesor') && (
                                                <span className="delta-badge" style={{ background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '4px' }}>
                                                    👤 Profesor: {conflict.old.profesor} → {conflict.fresh.profesor}
                                                </span>
                                            )}
                                            {conflict.deltas.includes('cupos') && (
                                                <span className="delta-badge" style={{ background: '#cce5ff', color: '#004085', padding: '2px 8px', borderRadius: '4px' }}>
                                                    👥 Cupos: {conflict.old.disponibles} → {conflict.fresh.disponibles}
                                                </span>
                                            )}
                                            {conflict.deltas.includes('horario') && (
                                                <span className="delta-badge" style={{ background: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '4px' }}>
                                                    🕐 Cambio en horario/aula
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions vertical">
                            <button className="primary-button" onClick={() => resolveEditConflicts('sync')}>
                                Sincronizar con SIIAU (Recomendado)
                            </button>
                            <button className="secondary-button" onClick={() => resolveEditConflicts('keep')}>
                                Mantener mis datos actuales
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}