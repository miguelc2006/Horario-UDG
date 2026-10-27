// src/components/ConsultaForm.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import './ConsultaForm.css';

const NOMBRES_CENTROS = {
    '3': 'CUTLAJO - Centro Universitario de Tlajomulco',
    '4': 'CUGDL - Centro Universitario de Guadalajara',
    '5': 'CUTLAQUEPAQUE - Centro Universitario de Tlaquepaque',
    '6': 'CUCHAPALA - Centro Universitario de Chapala',
    'A': 'CUAAD - Centro Universitario de Arte, Arquitectura y Diseño',
    'B': 'CUCBA - Centro Universitario de Ciencias Biológicas y Agropecuarias',
    'C': 'CUCEA - Centro Universitario de Ciencias Económico Administrativas',
    'D': 'CUCEI - Centro Universitario de Ciencias Exactas e Ingenierías',
    'E': 'CUCS - Centro Universitario de Ciencias de la Salud',
    'F': 'CUCSH - Centro Universitario de Ciencias Sociales y Humanidades',
    'G': 'CUALTOS - Centro Universitario de los Altos',
    'H': 'CUCIENEGA - Centro Universitario de la Ciénega',
    'I': 'CUCOSTA - Centro Universitario de la Costa',
    'J': 'CUCSUR - Centro Universitario de la Costa Sur',
    'K': 'CUSUR - Centro Universitario del Sur',
    'M': 'CUVALLES - Centro Universitario de los Valles',
    'N': 'CUNORTE - Centro Universitario del Norte',
    'O': 'CUCEI - Sede Valles',
    'P': 'CUCSUR - Sede Valles',
    'Q': 'CUCEI - Sede Norte',
    'R': 'CUALTOS - Sede Norte',
    'S': 'CUCOSTA - Sede Norte',
    'T': 'CUTLAJO - Sede Tlajomulco',
    'U': 'CULAGOS - Centro Universitario de los Lagos',
    'V': 'CICLO DE VERANO',
    'W': 'CUCEA - Sede Valle',
    'X': 'SUV - Sistema de Universidad Virtual',
    'Y': 'ESCUELAS INCORPORADAS',
    'Z': 'CUTONALA - Centro Universitario de Tonalá'
};

function loadFormPrefs() {
    try {
        const raw = localStorage.getItem('horario-udg-form-prefs');
        if (raw) {
            const p = JSON.parse(raw);
            if (p && p.centro) return p;
        }
    } catch {
        return null;
    }
    return null;
}

export function ConsultaForm({ onConsultar, loading, initialParams = {} }) {
    
    // Cargar preferencias guardadas al montar (para restaurar centro/carrera)
    const prefsRef = useRef(null);

    // Inicializamos sin valores para esperar a la API y evitar defaults incorrectos
    const [params, setParams] = useState({
        centro: '',
        carrera: '',
        calendario: '', 
    });

    // Estados de datos
    const [centros, setCentros] = useState([]);
    const [allCalendarios, setAllCalendarios] = useState([]); 
    const [carreras, setCarreras] = useState([]);
    const [loadingCarreras, setLoadingCarreras] = useState(false);
    const [optionsLoaded, setOptionsLoaded] = useState(false);
    const [showAllCycles, setShowAllCycles] = useState(false);

    // Estados para autocomplete
    const [busquedaCarrera, setBusquedaCarrera] = useState('');
    const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
    const wrapperRef = useRef(null); 

    // Lógica para mostrar ciclos recientes primero
    const ciclosVisibles = useMemo(() => {
        if (!allCalendarios.length) return [];
        
        // Función auxiliar para formatear etiqueta (ej: 202510 -> 2025-A)
        const formatLabel = (ciclo) => {
            const val = String(ciclo.value);
            const year = val.substring(0, 4);
            const sub = val.substring(4);
            let label = ciclo.description;
            
            // Lógica estándar SIIAU: 10=A, 20=B
            if (sub === '10') label = `${year}-A`;
            else if (sub === '20') label = `${year}-B`;
            
            // Prioridad a los ciclos estándar (A/B) de los últimos 2 años
            const currentYear = new Date().getFullYear();
            const cycleYear = parseInt(year);
            const isRecent = cycleYear >= currentYear - 1;
            const isStandard = (sub === '10' || sub === '20');

            return { ...ciclo, label, isPriority: isRecent && isStandard };
        };

        const formattedCycles = allCalendarios.map(formatLabel);

        if (showAllCycles) return formattedCycles;

        // Mostrar prioritarios, pero ASEGURAR que el seleccionado siempre sea visible
        return formattedCycles.filter(c => 
            c.isPriority || c.value === params.calendario
        ).sort((a, b) => b.value.localeCompare(a.value)); // Ordenar descendente (más nuevo arriba)
    }, [allCalendarios, showAllCycles, params.calendario]);

    // Formatear Centros para el Select
    const centrosFormateados = useMemo(() => {
        return centros.map(centro => ({
            value: centro.value,
            label: NOMBRES_CENTROS[centro.value] || `${centro.value} - ${centro.description}`
        })).sort((a, b) => a.label.localeCompare(b.label));
    }, [centros]);

    // Filtrado de carreras en tiempo real
    const carrerasFiltradas = useMemo(() => {
        if (!busquedaCarrera) return carreras;
        const term = busquedaCarrera.toLowerCase();
        return carreras.filter(c => 
            c.name.toLowerCase().includes(term) || c.id.toLowerCase().includes(term)
        );
    }, [carreras, busquedaCarrera]);

    // Cerrar sugerencias al hacer clic fuera
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setMostrarSugerencias(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    // 1. CARGA INICIAL DE OPCIONES (Ciclos y Centros)
    useEffect(() => {
        fetch('/api/form-options')
            .then(res => res.ok ? res.json() : Promise.reject(res))
            .then(data => {
                const listaCiclos = data.ciclop || [];
                const listaCentros = data.cup || [];
                
                setAllCalendarios(listaCiclos);
                setCentros(listaCentros);

                // LÓGICA DE SELECCIÓN DE CICLO SEGURO
                let cicloInicial = '';

                // A) Si hay parámetro inicial y existe en la lista, úsalo
                if (initialParams.calendario && listaCiclos.some(c => c.value === initialParams.calendario)) {
                    cicloInicial = initialParams.calendario;
                } 
                // B) Buscar el ciclo estándar (A/B) más reciente de los últimos 2 años
                else {
                    const currentYear = new Date().getFullYear();
                    const ciclosEstandar = listaCiclos
                        .filter(c => {
                            const val = String(c.value);
                            const sub = val.substring(4);
                            const year = parseInt(val.substring(0, 4), 10);
                            return (sub === '10' || sub === '20') && year >= currentYear - 2;
                        })
                        .sort((a, b) => b.value.localeCompare(a.value)); // Más reciente primero

                    if (ciclosEstandar.length > 0) {
                        cicloInicial = ciclosEstandar[0].value;
                    }
                    // C) Si no hay ciclo estándar, usa el primero de la lista
                    else if (listaCiclos.length > 0) {
                        cicloInicial = listaCiclos[0].value;
                    }
                }

                // Cargar preferencias guardadas del usuario
                const prefs = loadFormPrefs();
                prefsRef.current = prefs;

                setParams(p => ({ 
                    ...p, 
                    calendario: cicloInicial,
                    centro: initialParams.centro || prefs?.centro || '',
                    carrera: initialParams.carrera || prefs?.carrera || '',
                }));
            })
            .catch(err => console.error("Error cargando opciones:", err))
            .finally(() => setOptionsLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    // 2. CARGA DE CARRERAS CUANDO CAMBIA EL CENTRO
    useEffect(() => {
        if (params.centro) {
            setLoadingCarreras(true);
            setCarreras([]); 
            setBusquedaCarrera(''); 
            
            // Si cambiamos de centro manualmente, limpiamos la carrera seleccionada
            if (params.centro !== initialParams.centro) {
                 setParams(p => ({ ...p, carrera: '' }));
            }
            
            fetch(`/api/majors?cup=${params.centro}`)
                .then(res => res.ok ? res.json() : Promise.reject(res))
                .then(data => {
                    let fetchedCarreras = [];
                    // Manejar si la API devuelve objeto o array
                    if (Array.isArray(data)) {
                        fetchedCarreras = data; // Formato nuevo [{value, description}] o [{id, name}]
                        // Normalizar formato si viene como value/description
                        if(fetchedCarreras.length > 0 && fetchedCarreras[0].value) {
                             fetchedCarreras = fetchedCarreras.map(c => ({ id: c.value, name: c.description }));
                        }
                    } else if (typeof data === 'object') {
                        fetchedCarreras = Object.entries(data).map(([id, name]) => ({ id, name }));
                    }

                    fetchedCarreras.sort((a, b) => `${a.id} - ${a.name}`.localeCompare(`${b.id} - ${b.name}`));
                    setCarreras(fetchedCarreras);

                    // Restaurar carrera desde initialParams o preferencias guardadas
                    const targetCarrera = initialParams.carrera || prefsRef.current?.carrera;
                    if (targetCarrera) {
                        const found = fetchedCarreras.find(c => c.id === targetCarrera);
                        if (found) {
                            setParams(p => ({ ...p, carrera: found.id }));
                            setBusquedaCarrera(`${found.id} - ${found.name}`);
                        }
                    }
                })
                .catch(err => {
                    console.error("Error cargando carreras:", err);
                    setCarreras([]);
                })
                .finally(() => setLoadingCarreras(false));
        } else {
            setCarreras([]);
            setBusquedaCarrera('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params.centro]); // Solo depende de params.centro

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'calendario' && value === 'ver_mas') {
            setShowAllCycles(true);
            return;
        }
        setParams(prev => ({ ...prev, [name]: value }));
    };

    const handleCarreraSearch = (e) => {
        setBusquedaCarrera(e.target.value);
        setMostrarSugerencias(true);
        // Si el usuario borra, limpiamos la selección interna
        if (e.target.value === '') {
            setParams(prev => ({ ...prev, carrera: '' }));
        }
    };

    const seleccionarCarrera = (carrera) => {
        setParams(prev => ({ ...prev, carrera: carrera.id }));
        setBusquedaCarrera(`${carrera.id} - ${carrera.name}`);
        setMostrarSugerencias(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        // Guardar preferencias de centro y carrera
        try {
            localStorage.setItem('horario-udg-form-prefs', JSON.stringify({
                centro: params.centro,
                carrera: params.carrera,
                savedAt: new Date().toISOString()
            }));
        } catch {
            // localStorage puede no estar disponible; la consulta puede continuar.
        }
        // Encontrar etiqueta bonita para mostrar en el historial
        const calendarioSeleccionado = allCalendarios.find(c => c.value === params.calendario);
        let labelBonito = params.calendario;
        
        if (calendarioSeleccionado) {
            const val = String(calendarioSeleccionado.value);
            const year = val.substring(0,4);
            const sub = val.substring(4);
            if(sub === '10') labelBonito = `${year}-A`;
            else if(sub === '20') labelBonito = `${year}-B`;
            else labelBonito = calendarioSeleccionado.description; 
        }
        
        onConsultar(params, labelBonito);
    };

    return (
        <form onSubmit={handleSubmit} className="consulta-form">
            <p>Configura los filtros para buscar materias.</p>
            
            <div className="form-group">
                <label htmlFor="calendario">Ciclo Escolar</label>
                <select
                    id="calendario"
                    name="calendario"
                    value={params.calendario}
                    onChange={handleChange}
                    required
                    disabled={!optionsLoaded}
                >
                    {/* Opción placeholder mientras carga */}
                    {!optionsLoaded && <option value="">Cargando ciclos...</option>}
                    
                    {ciclosVisibles.map(ciclo => (
                        <option key={ciclo.value} value={ciclo.value}>
                            {ciclo.label}
                        </option>
                    ))}
                    {!showAllCycles && optionsLoaded && (
                        <option value="ver_mas" style={{ fontStyle: 'italic', color: '#666' }}>
                            ⬇ Ver ciclos anteriores...
                        </option>
                    )}
                </select>
            </div>

            <div className="form-group">
                <label htmlFor="centro">Centro Universitario</label>
                <select
                    id="centro"
                    name="centro"
                    value={params.centro}
                    onChange={handleChange}
                    required
                    disabled={!optionsLoaded}
                >
                    <option value="">Selecciona...</option>
                    {centrosFormateados.map(centro => (
                        <option key={centro.value} value={centro.value}>
                            {centro.label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group" ref={wrapperRef} style={{ position: 'relative' }}>
                <label htmlFor="carrera-search">Carrera</label>
                <input
                    type="text"
                    id="carrera-search"
                    className="autocomplete-input"
                    placeholder={loadingCarreras ? "Cargando carreras..." : (!params.centro ? "Selecciona un centro primero" : "Escribe para buscar...")}
                    value={busquedaCarrera}
                    onChange={handleCarreraSearch}
                    onFocus={(e) => { 
                        if(params.centro && !loadingCarreras) setMostrarSugerencias(true);
                        e.target.select(); 
                    }}
                    disabled={loadingCarreras || !params.centro}
                    autoComplete="off"
                />
                
                {mostrarSugerencias && carrerasFiltradas.length > 0 && (
                    <ul className="suggestions-list animate-fade-in" role="listbox" aria-label="Carreras sugeridas">
                        {carrerasFiltradas.map((carrera) => (
                            <li 
                                key={carrera.id} 
                                role="option"
                                tabIndex={0}
                                aria-selected={params.carrera === carrera.id}
                                onClick={() => seleccionarCarrera(carrera)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        seleccionarCarrera(carrera);
                                    }
                                }}
                            >
                                <span className="suggestion-id">{carrera.id}</span>
                                <span className="suggestion-name">{carrera.name}</span>
                            </li>
                        ))}
                    </ul>
                )}
                
                {mostrarSugerencias && carrerasFiltradas.length === 0 && busquedaCarrera && (
                    <div className="suggestions-list no-results">
                        No se encontraron carreras.
                    </div>
                )}
            </div>

            <div className="form-submit-container">
                <button type="submit" className="primary-button" disabled={loading || !params.centro || !params.carrera || !params.calendario}>
                    {loading ? 'Buscando...' : 'Buscar Oferta'}
                </button>
            </div>
        </form>
    );
}