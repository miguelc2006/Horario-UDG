// src/hooks/usePlanner.js
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useBlocker, useOutletContext, useSearchParams } from 'react-router-dom';

// Servicios
import { createSchedule, updateSchedule } from '../services/storageService.js';
import { fetchOfertaAcademica } from '../services/siiauApi.js';
import { saveStateToSession, loadStateFromSession, clearSession } from '../utils/session.js';
import { showToast } from '../utils/toast.js';

// Helper local para agrupar por NRC con NORMALIZACIÓN para evitar falsos positivos
const groupSessionsByNRC = (classes) => {
    const map = new Map();
    const dayOrder = { 'LUNES': 1, 'MARTES': 2, 'MIERCOLES': 3, 'MIÉRCOLES': 3, 'JUEVES': 4, 'VIERNES': 5, 'SABADO': 6, 'SÁBADO': 6, 'DOMINGO': 7 };

    classes.forEach(c => {
        const nrc = String(c.nrc).trim();
        if (!map.has(nrc)) {
            map.set(nrc, {
                nrc,
                materia: (c.materia || c.nombre || '').trim().replace(/\s+/g, ' '),
                clave: (c.clave || '').trim(),
                profesor: (c.profesor || '').trim().replace(/\s+/g, ' '),
                disponibles: parseInt(c.disponibles) || 0,
                sesiones: []
            });
        }
        map.get(nrc).sesiones.push({
            dia: (c.dia || '').trim().toUpperCase(),
            hora_inicio: (c.hora_inicio || '').trim(),
            hora_fin: (c.hora_fin || '').trim(),
            edificio: (c.edificio || '').trim(),
            aula: (c.aula || '').trim()
        });
    });

    const result = Array.from(map.values());
    // Ordenar sesiones por día y hora para comparación estable por JSON.stringify
    result.forEach(item => {
        item.sesiones.sort((a, b) => {
            const d1 = dayOrder[a.dia] || 99;
            const d2 = dayOrder[b.dia] || 99;
            if (d1 !== d2) return d1 - d2;
            return a.hora_inicio.localeCompare(b.hora_inicio);
        });
    });

    return result;
};

// Lazy initializer para evitar llamar loadStateFromSession en cada render
function getInitialPlannerState() {
    const saved = loadStateFromSession();
    if (saved) {
        return {
            materias: saved.materias || [],
            selectedNRCs: saved.selectedNRCs || [],
            consultaRealizada: saved.consultaRealizada || false,
            formParams: saved.formParams || { centro: '', carrera: '', calendario: '' },
            calendarioLabel: saved.calendarioLabel || '',
            currentScheduleId: saved.currentScheduleId || null,
            currentScheduleName: saved.currentScheduleName || '',
            isViewMode: saved.isViewMode || false
        };
    }
    return {
        materias: [],
        selectedNRCs: [],
        consultaRealizada: false,
        formParams: { centro: '', carrera: '', calendario: '' },
        calendarioLabel: '',
        currentScheduleId: null,
        currentScheduleName: '',
        isViewMode: false
    };
}

// Debounce helper para sessionStorage
function useDebouncedSessionSave(state, delay = 1000) {
    const timeoutRef = useRef(null);
    const isFirstRender = useRef(true);

    useEffect(() => {
        // Skip en primer render porque ya cargamos desde session
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            saveStateToSession(state);
        }, delay);

        return () => clearTimeout(timeoutRef.current);
    }, [state, delay]);
}

export function usePlanner() {
    const { user, isAuthorized } = useAuth();
    const { theme } = useOutletContext();
    
    // Estados UI
    const [saving, setSaving] = useState(false);
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [conflicts, setConflicts] = useState([]);
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const pendingDataRef = useRef(null); // Para guardar los datos nuevos mientras se resuelve el conflicto
    const resultsRef = useRef(null);

    // --- Estado para modal de nombre (reemplaza prompt nativo) ---
    const [showNameModal, setShowNameModal] = useState(false);
    const [pendingName, setPendingName] = useState('');

    // --- Estado para modal de horario no encontrado ---
    const [showNotFoundModal, setShowNotFoundModal] = useState(false);

    // --- Key para forzar remontaje del formulario al resetear ---
    const [formResetKey, setFormResetKey] = useState(0);

    // --- NRC desde URL (deep linking desde notificaciones) ---
    const [searchParams] = useSearchParams();
    const nrcFromUrl = searchParams.get('nrc');
    const [nrcTarget, setNrcTarget] = useState(nrcFromUrl || '');

    // --- 1. ESTADO INICIAL (Lazy Initialization) ---
    const [materias, setMaterias] = useState(() => getInitialPlannerState().materias);
    const [selectedNRCs, setSelectedNRCs] = useState(() => getInitialPlannerState().selectedNRCs);
    const [consultaRealizada, setConsultaRealizada] = useState(() => getInitialPlannerState().consultaRealizada);
    const [formParams, setFormParams] = useState(() => getInitialPlannerState().formParams);
    const [calendarioLabel, setCalendarioLabel] = useState(() => getInitialPlannerState().calendarioLabel);
    const [isViewMode, setIsViewMode] = useState(() => getInitialPlannerState().isViewMode);
    const [currentScheduleId, setCurrentScheduleId] = useState(() => getInitialPlannerState().currentScheduleId);
    const [currentScheduleName, setCurrentScheduleName] = useState(() => getInitialPlannerState().currentScheduleName);

    // --- 2. DETECCIÓN DE CAMBIOS (DIRTY STATE) ---
    const initialSessionState = useRef(getInitialPlannerState());
    const lastSavedSnapshot = useRef(JSON.stringify({
        selectedNRCs: initialSessionState.current.selectedNRCs,
        id: initialSessionState.current.currentScheduleId
    }));

    const isDirty = useMemo(() => {
        const currentSnapshot = JSON.stringify({
            selectedNRCs,
            id: currentScheduleId
        });
        if (!currentScheduleId && selectedNRCs.length > 0) return true;
        if (currentScheduleId && currentSnapshot !== lastSavedSnapshot.current) return true;
        return false;
    }, [selectedNRCs, currentScheduleId]);

    const isDirtyRef = useRef(isDirty);
    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

    // --- 3. EFECTOS (Session save con DEBOUNCE) ---
    const sessionState = useMemo(() => ({ 
        materias, selectedNRCs, consultaRealizada, formParams, calendarioLabel, theme,
        currentScheduleId, currentScheduleName, isViewMode 
    }), [materias, selectedNRCs, consultaRealizada, formParams, calendarioLabel, theme, currentScheduleId, currentScheduleName, isViewMode]);
    
    useDebouncedSessionSave(sessionState, 800);

    useEffect(() => {
        return () => {
            if (!isDirtyRef.current) {
                clearSession();
            }
        };
    }, []);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = ''; 
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // --- Efecto para NRC desde URL (deep linking) ---
    useEffect(() => {
        if (!nrcFromUrl) return;
        
        setNrcTarget(nrcFromUrl);

        // Si ya se realizó consulta y tenemos materias cargadas, buscar y seleccionar el NRC
        if (consultaRealizada && materias.length > 0) {
            const exists = materias.some(m => m.nrc === nrcFromUrl);
            if (exists) {
                setSelectedNRCs(prev => {
                    if (prev.includes(nrcFromUrl)) return prev;
                    return [...prev, nrcFromUrl];
                });
                showToast(`Materia NRC ${nrcFromUrl} preseleccionada desde notificación.`, 'info');
                // Limpiar el target después de seleccionar
                setTimeout(() => setNrcTarget(''), 2000);
            }
        }
    }, [nrcFromUrl]); // Solo se ejecuta al montar/cuando cambia el param

    // --- 4. HANDLERS ---
    const handleSaveCloud = async () => {
        if (!user) return showToast("Debes iniciar sesión para guardar.", 'warning');
        if (!isAuthorized) {
            return showToast("Usa un correo @alumnos.udg.mx para guardar horarios.", 'warning');
        }

        const selectedClasses = materias.filter(m => selectedNRCs.includes(m.nrc));
        
        const scheduleData = { 
            materias: selectedClasses, 
            selectedNRCs, 
            formParams, 
            calendarioLabel 
        };
        
        setSaving(true);
        try {
            if (currentScheduleId) {
                try {
                    await updateSchedule(user.uid, currentScheduleId, scheduleData);
                    showToast(`¡"${currentScheduleName}" actualizado correctamente!`, 'success');
                } catch (updateErr) {
                    // Verificamos si es un error de "not-found" (documento borrado en SIIAU o Firestore)
                    if (updateErr.code === 'not-found' || updateErr.message?.includes('not found')) {
                        setSaving(false);
                        setShowNotFoundModal(true);
                        return;
                    } else {
                        throw updateErr;
                    }
                }
            } else {
                // Mostrar modal personalizado en lugar de prompt()
                setPendingName('Mi Horario');
                setSaving(false);
                setShowNameModal(true);
                return;
            }
            setTimeout(() => {
                 lastSavedSnapshot.current = JSON.stringify({ selectedNRCs, id: currentScheduleId }); 
            }, 0);
            if (blocker.state === "blocked") blocker.proceed();
        } catch (error) {
            console.error(error);
            showToast("Error al guardar: " + (error.message || "Error desconocido"), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleNameModalConfirm = async () => {
        if (!isAuthorized) {
            setShowNameModal(false);
            showToast("Usa un correo @alumnos.udg.mx para guardar horarios.", 'warning');
            return;
        }
        const name = pendingName?.trim();
        if (!name) return;
        setShowNameModal(false);
        setSaving(true);
        try {
            const selectedClasses = materias.filter(m => selectedNRCs.includes(m.nrc));
            const scheduleData = { 
                materias: selectedClasses, 
                selectedNRCs, 
                formParams, 
                calendarioLabel 
            };
            const newId = await createSchedule(user.uid, scheduleData, name);
            setCurrentScheduleId(newId);
            setCurrentScheduleName(name);
            showToast("¡Horario creado exitosamente!", 'success');
            setTimeout(() => {
                lastSavedSnapshot.current = JSON.stringify({ selectedNRCs, id: newId }); 
            }, 0);
            if (blocker.state === "blocked") blocker.proceed();
        } catch (error) {
            console.error(error);
            showToast("Error al guardar: " + (error.message || "Error desconocido"), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleNameModalCancel = () => {
        setShowNameModal(false);
    };

    const handleNotFoundSaveAsNew = async () => {
        setShowNotFoundModal(false);
        setCurrentScheduleId(null);
        setCurrentScheduleName('');
        // Volver a intentar guardar como nuevo
        return handleSaveCloud();
    };

    const handleNotFoundDiscard = () => {
        setShowNotFoundModal(false);
        setCurrentScheduleId(null);
        setCurrentScheduleName('');
        clearSession();
    };

    const handleDiscardNavigation = () => {
        if (blocker.state === "blocked") {
            clearSession();
            blocker.proceed();
        }
    };

    const handleCancelNavigation = () => {
        if (blocker.state === "blocked") blocker.reset();
    };

    const handleTriggerReset = () => {
        if (selectedNRCs.length === 0) {
            handleConfirmReset();
        } else {
            setIsResetModalOpen(true);
        }
    };

    const handleConfirmReset = () => {
        setMaterias([]);
        setSelectedNRCs([]);
        setConsultaRealizada(false);
        setFormParams({ centro: '', carrera: '', calendario: '' });
        setCalendarioLabel('');
        setError(null);
        setCurrentScheduleId(null);
        setCurrentScheduleName('');
        setIsViewMode(false);
        setIsResetModalOpen(false);
        clearSession();
        setFormResetKey(k => k + 1);
        lastSavedSnapshot.current = JSON.stringify({ selectedNRCs: [], id: null });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleConsulta = useCallback(async (params, calLabel) => {
        setFormParams(params);
        setCalendarioLabel(calLabel);
        setLoading(true);
        setError(null);
        
        try {
            const apiParams = { cup: params.centro, majrp: params.carrera, ciclop: params.calendario };
            const newData = await fetchOfertaAcademica(apiParams);
            if (!newData || newData.length === 0) throw new Error("Sin resultados.");

            // --- CONTROL DE INTEGRIDAD AVANZADO ---
            const oldGrouped = groupSessionsByNRC(materias.filter(m => selectedNRCs.includes(m.nrc)));
            const newGrouped = groupSessionsByNRC(newData);
            const foundConflicts = [];

            if (oldGrouped.length > 0) {
                oldGrouped.forEach(oldNRC => {
                    const freshNRC = newGrouped.find(c => c.nrc === oldNRC.nrc);
                    
                    if (freshNRC) {
                        const deltas = [];
                        if (freshNRC.profesor !== oldNRC.profesor) deltas.push('profesor');
                        if (freshNRC.disponibles !== oldNRC.disponibles) deltas.push('cupos');
                        if (JSON.stringify(freshNRC.sesiones) !== JSON.stringify(oldNRC.sesiones)) deltas.push('horario');

                        if (deltas.length > 0) {
                            foundConflicts.push({ 
                                nrc: oldNRC.nrc,
                                materia: oldNRC.materia,
                                old: oldNRC, 
                                fresh: freshNRC,
                                deltas 
                            });
                        }
                    } else {
                        foundConflicts.push({ 
                            nrc: oldNRC.nrc,
                            materia: oldNRC.materia,
                            old: oldNRC, 
                            fresh: null, 
                            removed: true 
                        });
                    }
                });
            }

            if (foundConflicts.length > 0) {
                setConflicts(foundConflicts);
                setIsConflictModalOpen(true);
                pendingDataRef.current = { newData, params, calLabel };
                setLoading(false);
                return;
            }

            // Si no hay conflictos, procedemos normalmente
            // MEJORA: Mantener en materias las que ya están seleccionadas (pool persistente)
            const otherSelected = materias.filter(m => selectedNRCs.includes(m.nrc) && !newData.some(n => n.nrc === m.nrc));
            setMaterias([...newData, ...otherSelected]);
            
            setConsultaRealizada(true);
            setCurrentScheduleId(prev => (params.centro === formParams.centro && params.carrera === formParams.carrera) ? prev : null);
            if (!currentScheduleId) setCurrentScheduleName('');
            setIsViewMode(false);
            if (window.innerWidth < 1024) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        } catch (err) {
            setError(err.message);
            setConsultaRealizada(false);
            setMaterias([]);
        } finally {
            setLoading(false);
        }
    }, [materias, selectedNRCs, formParams, currentScheduleId]);

    const resolveConflicts = (action) => {
        if (!pendingDataRef.current) return;
        const { newData } = pendingDataRef.current;

        // 1. Obtener todas las materias actualmente seleccionadas (formato plano original)
        const selectedFlat = materias.filter(m => selectedNRCs.includes(m.nrc));
        
        // 2. Identificar los NRCs en conflicto
        const conflictedNRCs = conflicts.map(c => String(c.nrc));

        if (action === 'sync') {
            // Acción: Sincronizar (Usar datos nuevos del SIIAU)
            const removedNRCs = conflicts.filter(c => c.removed).map(c => String(c.nrc));
            
            // Mantener seleccionados que no están en esta búsqueda y NO fueron marcados como borrados
            const syncFilteredSelected = selectedFlat.filter(oldCls => 
                !newData.some(newCls => String(newCls.nrc) === String(oldCls.nrc)) && 
                !removedNRCs.includes(String(oldCls.nrc))
            );
            
            // Si hubo materias borradas en SIIAU, las quitamos de la selección actual
            if (removedNRCs.length > 0) {
                setSelectedNRCs(prev => prev.filter(n => !removedNRCs.includes(String(n))));
            }

            setMaterias([...newData, ...syncFilteredSelected]);
            showToast("Información sincronizada con el SIIAU.", 'info');
        } else {
            // Acción: Mantener (Usar datos viejos que teníamos guardados)
            const keptOldEntries = selectedFlat.filter(m => conflictedNRCs.includes(String(m.nrc)));
            
            // Del newData de la búsqueda, filtramos los NRCs que vamos a sobreescribir con los viejos
            const freshNonConflicted = newData.filter(c => !conflictedNRCs.includes(String(c.nrc)));
            
            // Mantener otras materias seleccionadas de búsquedas anteriores
            const otherSelected = selectedFlat.filter(oldCls => 
                !conflictedNRCs.includes(String(oldCls.nrc)) && 
                !newData.some(newCls => String(newCls.nrc) === String(oldCls.nrc))
            );

            setMaterias([...freshNonConflicted, ...keptOldEntries, ...otherSelected]);
            showToast("Se han mantenido los datos previos.", 'info');
        }

        setConsultaRealizada(true);
        setIsViewMode(false);
        setIsConflictModalOpen(false);
        setConflicts([]);
        pendingDataRef.current = null;
    };

    const handleRemoveNrc = useCallback((nrcToRemove) => {
        setSelectedNRCs(prev => prev.filter(nrc => nrc !== nrcToRemove));
    }, []);

    const clasesSeleccionadas = useMemo(() => materias.filter(m => selectedNRCs.includes(m.nrc)), [materias, selectedNRCs]);

    return {
        user, theme, saving, isResetModalOpen, setIsResetModalOpen, loading, error, resultsRef,
        materias, selectedNRCs, setSelectedNRCs, consultaRealizada, formParams, calendarioLabel,
        currentScheduleId, setCurrentScheduleId, currentScheduleName, setCurrentScheduleName,
        isViewMode, setIsViewMode,
        conflicts, isConflictModalOpen, setIsConflictModalOpen, resolveConflicts,
        isDirty, blocker,
        showNameModal, pendingName, setPendingName, handleNameModalConfirm, handleNameModalCancel,
        showNotFoundModal, handleNotFoundSaveAsNew, handleNotFoundDiscard,
        formResetKey,
        handleSaveCloud, handleDiscardNavigation, handleCancelNavigation, handleTriggerReset, handleConfirmReset,
        handleConsulta, handleRemoveNrc, clasesSeleccionadas,
        nrcTarget
    };
}
