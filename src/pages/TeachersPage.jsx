import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { hasUserRatedProfessor, getUserRatingForProfessor, getRatingsForProfessor } from '../services/myRatingsService';
import { ConsultaForm } from '../components/ConsultaForm';
import { normalizeSiiauName, getProfessorData, getProfessorsByNames } from '../services/professorService';
import RatingForm from '../components/RatingForm';
import './TeachersPage.css';

export function TeachersPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [professors, setProfessors] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedProf, setSelectedProf] = useState(null);
    const [showRatingForm, setShowRatingForm] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [stats, setStats] = useState({ count: 0 });
    const [userHasRatedProf, setUserHasRatedProf] = useState({});
    const [profInternalRatings, setProfInternalRatings] = useState({});
    
    // Búsqueda en vivo
    const [searchQuery, setSearchQuery] = useState('');
    const [filterRating, setFilterRating] = useState('all');
    const [sortBy, setSortBy] = useState('name');

    const clearBodyModal = () => {
        document.body.classList.remove('modal-open');
    };

    const closeAllModals = useCallback(() => {
        clearBodyModal();
        setSelectedProf(null);
        setShowRatingForm(false);
    }, []);

    // Cerrar con Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeAllModals();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeAllModals]);

    // Cleanup al desmontar
    useEffect(() => {
        return () => {
            document.body.classList.remove('modal-open');
        };
    }, []);

    const handleSiiauConsultar = async (params) => {
        setLoading(true);
        setHasSearched(true);
        setProfessors([]);
        
        try {
            const response = await fetch('/api/consultar-oferta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ciclop: params.calendario,
                    cup: params.centro,
                    majrp: params.carrera
                })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    setProfessors([]);
                    setStats({ count: 0 });
                    return;
                }
                const errorPayload = await response.json().catch(() => ({}));
                throw new Error(errorPayload.error || "Error en la consulta de oferta");
            }
            
            // Extraer nombres únicos y normalizarlos
            const rawNames = [...new Set(data.map(item => item.profesor))];
            const normalizedList = rawNames
                .map(name => ({
                    original: name,
                    human: normalizeSiiauName(name)
                }))
                .filter(p => p.human !== null)
                .sort((a, b) => a.human.localeCompare(b.human));

            // Optimización: cargar ratings locales EN PARALELO con el set inicial
            // Esto muestra los datos inmediatamente si existen en cache
            const humanNames = normalizedList.map(p => p.human);
            
            // Cargar datos locales en background (sin bloquear UI)
            const localDataPromise = getProfessorsByNames(humanNames);
            
            // Aplicar datos locales inmediatamente cuando estén disponibles
            const localData = await localDataPromise;
            
            const finalResults = normalizedList.map(p => {
                // Usar ID con underscores para coincidir con Firestore
                const id = p.human.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/g, "").replace(/\s+/g, "_").trim();
                const profData = localData[id] || {};
                
                // Si tiene datos de MisProfesores o ratings nativos, usarlos
                const hasData = profData.ratingMP || profData.nativeRatingCount > 0;
                
                return {
                    ...p,
                    id,
                    ratingMP: profData.ratingMP || null,
                    difficultyMP: profData.difficultyMP || null,
                    recommendationMP: profData.recommendationMP || null,
                    numRatings: profData.numRatings || null,
                    nativeRatingCount: profData.nativeRatingCount || 0,
                    nativeRatingSum: profData.nativeRatingSum || 0,
                    nativeDifficultySum: profData.nativeDifficultySum || 0,
                    department: profData.department || '',
                    school: profData.school || '',
                    urlMP: profData.urlMP || '',
                    comments: profData.comments || [],
                    hasLocalData: hasData, // Flag para saber si tiene datos
                    isCached: profData.updatedAt ? true : false
                };
            });

            setProfessors(finalResults);
            setStats({ count: finalResults.length });
        } catch (error) {
            console.error("Error:", error);
            setStats({ count: 0 });
        } finally {
            setLoading(false);
        }
    };

const handleSelectProfessor = async (prof) => {
        document.body.classList.add('modal-open');
        setSelectedProf(prof);
        
        if (user) {
            const alreadyRated = await hasUserRatedProfessor(user.uid, prof.id);
            const existingRating = alreadyRated ? await getUserRatingForProfessor(user.uid, prof.id) : null;
            setUserHasRatedProf(prev => ({ ...prev, [prof.id]: existingRating }));
        }
        
        const internalRatings = await getRatingsForProfessor(prof.id);
        setProfInternalRatings(prev => ({ ...prev, [prof.id]: internalRatings }));
        
        if (prof.hasLocalData || prof.ratingMP || prof.nativeRatingCount > 0) {
            setDetailLoading(false);
        } else {
            setDetailLoading(true);
            try {
                const fullData = await getProfessorData(prof.human);
                if (fullData) {
                    const updatedProf = { 
                        ...prof, 
                        ...fullData,
                        hasLocalData: true
                    };
                    setSelectedProf(updatedProf);
                    
                    // Actualizar la lista para mantener sincronizado
                    setProfessors(prev => prev.map(p => 
                        p.id === prof.id ? updatedProf : p
                    ));
                }
            } catch (err) {
                console.warn("No se cargaron datos adicionales:", err);
            } finally {
                setDetailLoading(false);
            }
        }
    };

    const getInitials = (name) => {
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    };

    // Filtrar y ordenar profesores en vivo
    const filteredProfessors = useMemo(() => {
        if (!professors.length) return [];
        
        let result = [...professors];
        
        // Filtro por búsqueda de texto
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(p => 
                p.human.toLowerCase().includes(query) ||
                p.original?.toLowerCase().includes(query)
            );
        }
        
        // Filtro por rating
        if (filterRating !== 'all') {
            result = result.filter(p => {
                const rating = parseFloat(p.ratingMP) || 0;
                switch (filterRating) {
                    case 'high':
                        return rating >= 7;
                    case 'mid':
                        return rating >= 4 && rating < 7;
                    case 'low':
                        return rating > 0 && rating < 4;
                    case 'none':
                        return rating === 0 || !p.ratingMP;
                    default:
                        return true;
                }
            });
        }
        
        // Ordenar
        result.sort((a, b) => {
            switch (sortBy) {
                case 'rating':
                    return (parseFloat(b.ratingMP) || 0) - (parseFloat(a.ratingMP) || 0);
                case 'name':
                default:
                    return a.human.localeCompare(b.human);
            }
        });
        
        return result;
    }, [professors, searchQuery, filterRating, sortBy]);

    return (
        <div className="teachers-page animate-fade-in">
            <header className="teachers-hero">
                <h1>Directorio de <span className="text-highlight">Profesores</span></h1>
                <p>Busca por centro universitario y carrera para ver la lista oficial del SIIAU y sus evaluaciones.</p>
                
                {!user && hasSearched && (
                    <p className="login-prompt">
                        <button className="login-link-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-auth-modal'))}>
                            Inicia sesión
                        </button>{' '}
                        para evaluar profesores y guardar tus calificaciones.
                    </p>
                )}
                
                {user && (
                    <button 
                        className="my-ratings-btn"
                        onClick={() => navigate('/mis-evaluaciones')}
                    >
                        Mis Evaluaciones
                    </button>
                )}
            </header>

            <div className="teachers-content-layout">
                <aside className="teachers-filters">
                    <div className="sticky-form">
                        <ConsultaForm onConsultar={handleSiiauConsultar} loading={loading} />
                    </div>
                </aside>

                <main className="teachers-results">
                    {loading && professors.length === 0 ? (
                        <div className="loading-state-hub">
                            <div className="spinner"></div>
                            <p>Obteniendo profesores del SIIAU...</p>
                        </div>
                    ) : hasSearched ? (
                        <>
                            <div className="results-header">
                                <div className="search-bar-container">
                                    <input 
                                        type="text" 
                                        placeholder="Buscar profesor..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="search-input"
                                    />
                                    <select 
                                        value={filterRating} 
                                        onChange={(e) => setFilterRating(e.target.value)}
                                        className="filter-select"
                                    >
                                        <option value="all">Todos los ratings</option>
                                        <option value="high">⭐ 7+ (Buenos)</option>
                                        <option value="mid">⭐ 4-6 (Regulares)</option>
                                        <option value="low">⭐ 1-3 (Difíciles)</option>
                                        <option value="none">Sin rating</option>
                                    </select>
                                    <select 
                                        value={sortBy} 
                                        onChange={(e) => setSortBy(e.target.value)}
                                        className="filter-select"
                                    >
                                        <option value="name">Alfabetico</option>
                                        <option value="rating">Por rating</option>
                                    </select>
                                    {searchQuery && (
                                        <button 
                                            className="clear-search-btn"
                                            onClick={() => setSearchQuery('')}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                                <h2>
                                    {filteredProfessors.length} de {stats.count} Profesores
                                    {searchQuery && ` (busqueda: "${searchQuery}")`}
                                </h2>
                            </div>
                            <div className="teachers-grid">
                                {filteredProfessors.map(prof => (
                                    <div key={prof.id} className="teacher-card" onClick={() => handleSelectProfessor(prof)}>
                                        <div className="teacher-card-header">
                                            <div className="teacher-initials">{getInitials(prof.human)}</div>
                                            <div className="teacher-main-score">
                                                {prof.ratingMP ? (
                                                    <span className="score-value">⭐ {prof.ratingMP}</span>
                                                ) : (
                                                    <span className="no-score">Sin rating</span>
                                                )}
                                            </div>
                                        </div>
                                        <h3>{prof.human}</h3>
                                        <div className="teacher-metrics-row">
                                            {prof.difficultyMP && (
                                                <span className="metric-badge">🧠 {prof.difficultyMP}</span>
                                            )}
                                            {prof.ratingMP && (
                                                <span className="metric-badge external-rating">
                                                    ⭐ {prof.ratingMP}
                                                </span>
                                            )}
                                            {prof.nativeRatingCount > 0 && (
                                                <span className="metric-badge internal-rating">
                                                    👥 {prof.nativeRatingCount}
                                                </span>
                                            )}
                                            {!prof.ratingMP && prof.nativeRatingCount === 0 && (
                                                <span className="metric-badge no-rating">Sin rating</span>
                                            )}
                                        </div>
                                        <button className="view-details-btn">Ver Detalles</button>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="empty-search-state">
                            <div className="empty-icon">📁</div>
                            <h3>Inicia una búsqueda</h3>
                            <p>Selecciona tu centro y carrera para ver la lista de profesores disponibles en este ciclo.</p>
                        </div>
                    )}
                </main>
            </div>

            {selectedProf && createPortal(
                <div className="teacher-detail-modal-overlay" onClick={closeAllModals}>
                    <div className="teacher-detail-modal animate-pop-in" onClick={e => e.stopPropagation()}>
                        <button className="modal-close-top" onClick={closeAllModals}>×</button>
                        <header className="modal-prof-header">
                            <div className="prof-avatar-large">{getInitials(selectedProf.human)}</div>
                            <div>
                                <h2>{selectedProf.human}</h2>
                                <p className="prof-original-name">Original SIIAU: {selectedProf.original}</p>
                            </div>
                        </header>

                        {detailLoading && !selectedProf.ratingMP ? (
                            <div className="modal-loading-stats">
                                <div className="spinner"></div>
                                <p>Buscando evaluaciones...</p>
                            </div>
                        ) : (
                            <>
                                <div className="detail-stats-large">
                                    {(selectedProf.ratingMP || profInternalRatings[selectedProf.id]?.length > 0) ? (
                                        <>
                                            {selectedProf.ratingMP && (
                                                <>
                                                    <div className="large-stat tooltip" title="Calificación promedio en MisProfesores.com">
                                                        <span className="large-val">{selectedProf.ratingMP}</span>
                                                        <span className="large-lab">MisProfesores</span>
                                                    </div>
                                                    <div className="large-stat">
                                                        <span className="large-val">{selectedProf.difficultyMP}</span>
                                                        <span className="large-lab">Dificultad</span>
                                                    </div>
                                                </>
                                            )}
                                            
                                            {profInternalRatings[selectedProf.id]?.length > 0 && (
                                                <div className="large-stat tooltip" title="Calificación de usuarios de Horario UDG">
                                                    {(() => {
                                                        const ratings = profInternalRatings[selectedProf.id];
                                                        const avg = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
                                                        return (
                                                            <>
                                                                <span className="large-val">{avg.toFixed(1)}</span>
                                                                <span className="large-lab">Horario UDG ({ratings.length})</span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="no-external-data-msg">
                                            <p>No encontramos evaluaciones para este profesor.</p>
                                            <p className="small-detail">Sé el primero en calificarlo en nuestra plataforma.</p>
                                        </div>
                                    )}
                                </div>
                                
                                {/* Sección de Comentarios - 50/50 Split */}
                                {(selectedProf.comments?.length > 0 || profInternalRatings[selectedProf.id]?.length > 0) && (
                                    <div className="comments-split-container">
                                        {/* MisProfesores Comments - 50% */}
                                        {selectedProf.comments && selectedProf.comments.length > 0 && (
                                            <div className="comments-half">
                                                <h4 className="comments-title">
                                                    MisProfesores
                                                    <span className="comments-count">({selectedProf.comments.length})</span>
                                                </h4>
                                                <div className="comments-list">
                                                    {selectedProf.comments.slice(0, 3).map((comment, index) => (
                                                        <div key={index} className="comment-card">
                                                            <div className="comment-meta">
                                                                {comment.score && (
                                                                    <span className="comment-score">⭐ {comment.score}</span>
                                                                )}
                                                            </div>
                                                            <p className="comment-text">{comment.text}</p>
                                                            {comment.tags && comment.tags.length > 0 && (
                                                                <div className="comment-tags">
                                                                    {comment.tags.slice(0, 3).map((tag, tagIdx) => (
                                                                        <span key={tagIdx} className="tag-badge">{tag}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* Horario UDG Comments - 50% */}
                                        {profInternalRatings[selectedProf.id]?.length > 0 && (
                                            <div className="comments-half">
                                                <h4 className="comments-title">
                                                    Horario UDG
                                                    <span className="comments-count">({profInternalRatings[selectedProf.id].length})</span>
                                                </h4>
                                                <div className="comments-list">
                                                    {profInternalRatings[selectedProf.id].slice(0, 3).map((rating) => (
                                                        <div key={rating.id} className="comment-card internal-comment">
                                                            <div className="comment-meta">
                                                                <span className="comment-score">{rating.stars}/10</span>
                                                                <span className="comment-date">{rating.createdAt?.toDate ? rating.createdAt.toDate().toLocaleDateString('es-MX') : 'Reciente'}</span>
                                                            </div>
                                                            {rating.comment && (
                                                                <p className="comment-text">"{rating.comment}"</p>
                                                            )}
                                                            {rating.tags && rating.tags.length > 0 && (
                                                                <div className="comment-tags">
                                                                    {rating.tags.slice(0, 3).map((tag, tagIdx) => (
                                                                        <span key={tagIdx} className="tag-badge internal-tag">{tag}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        <div className="modal-actions-hub">
                            {selectedProf.urlMP && (
                                <a href={selectedProf.urlMP} target="_blank" rel="noreferrer" className="external-link-btn-hub">
                                    Perfil en MisProfesores ↗
                                </a>
                            )}
                            <button 
                                className="rate-now-btn-hub" 
                                onClick={() => setShowRatingForm(true)}
                                disabled={!user && !selectedProf.urlMP}
                                style={!selectedProf.ratingMP ? { gridColumn: '1 / -1' } : {}}
                            >
                                {userHasRatedProf[selectedProf.id] ? 'Ya evaluaste (Editar)' : (selectedProf.nativeRatingCount > 0 ? 'Actualizar mi voto' : 'Evaluar ahora')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showRatingForm && selectedProf && (
                <RatingForm 
                    professorId={selectedProf.id} 
                    professorName={selectedProf.human} 
                    onClose={closeAllModals}
                    onRatingEscaped={async () => {
                        setShowRatingForm(false);
                        setUserHasRatedProf(prev => ({ ...prev, [selectedProf.id]: true }));
                        const fullData = await getProfessorData(selectedProf.human);
                        setSelectedProf({ ...selectedProf, ...fullData });
                        setProfessors(prev => prev.map(p => p.id === selectedProf.id ? { ...p, ...fullData } : p));
                    }}
                />
            )}
        </div>
    );
}
