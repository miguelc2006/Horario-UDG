import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyRatings } from '../services/myRatingsService';
import RatingForm from '../components/RatingForm';
import { showToast } from '../utils/toast';
import './MyRatingsPage.css';

export function MyRatingsPage() {
    const navigate = useNavigate();
    const { user, canManageRatings } = useAuth();
    const [ratings, setRatings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingRating, setEditingRating] = useState(null);

    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        if (!canManageRatings) {
            setRatings([]);
            setLoading(false);
            return;
        }
        loadMyRatings();
    }, [user, canManageRatings, navigate]);

    const loadMyRatings = async () => {
        if (!user || !canManageRatings) return;

        setLoading(true);
        try {
            const myRatings = await getMyRatings(user.uid);
            setRatings(myRatings);
        } catch (error) {
            console.error("Error cargando evaluaciones:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (rating) => {
        if (!canManageRatings) {
            showToast('Usa un correo @alumnos.udg.mx o @academicos.udg.mx para editar evaluaciones.', 'warning');
            return;
        }
        setEditingRating(rating);
    };

    const handleCloseEdit = () => {
        setEditingRating(null);
    };

    const handleRatingUpdated = async () => {
        setEditingRating(null);
        await loadMyRatings();
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Fecha unknown';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const renderStars = (count) => {
        return count + '/10';
    };

    const formatProfessorName = (professorId) => {
        return professorId.replace(/_/g, ' ');
    };

    if (loading) {
        return (
            <div className="my-ratings-page animate-fade-in">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando tus evaluaciones...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="my-ratings-page animate-fade-in">
            <header className="my-ratings-header">
                <h1>Mis <span className="text-highlight">Evaluaciones</span></h1>
                <p>Gestiona las calificaciones que has realizado a profesores de la UDG.</p>
            </header>

            {ratings.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📝</div>
                    <h3>No has evaluado ningún profesor</h3>
                    <p>Cuando evalúes a un profesor, aparecerá aquí.</p>
                    <a href="/profesores" className="primary-button">
                        Ir a buscar profesores
                    </a>
                </div>
            ) : (
                <>
                    <div className="ratings-summary">
                        <span className="summary-count">{ratings.length}</span>
                        <span className="summary-label">evaluaciones realizadas</span>
                    </div>

                    <div className="ratings-list">
                        {ratings.map(rating => (
                            <div key={rating.id} className="rating-card">
                                <div className="rating-card-header">
                                    <div className="professor-info">
                                        <h3>{formatProfessorName(rating.professorId)}</h3>
                                        <span className="rating-date">{formatDate(rating.createdAt)}</span>
                                    </div>
                                    <button
                                        className="edit-rating-btn"
                                        onClick={() => handleEdit(rating)}
                                    >
                                        Editar
                                    </button>
                                </div>

                                <div className="rating-details">
                                    <div className="rating-stars">
                                        <span className="stars-text">{renderStars(rating.stars)}</span>
                                        <span className="stars-number">{rating.stars}/10</span>
                                    </div>

                                    <div className="rating-difficulty">
                                        <span className="difficulty-label">Dificultad:</span>
                                        <span className="difficulty-value">{rating.difficulty}/10</span>
                                    </div>
                                </div>

                                {rating.tags && rating.tags.length > 0 && (
                                    <div className="rating-tags">
                                        {rating.tags.map((tag, idx) => (
                                            <span key={idx} className="tag-badge">{tag}</span>
                                        ))}
                                    </div>
                                )}

                                {rating.comment && (
                                    <div className="rating-comment">
                                        <p>"{rating.comment}"</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {editingRating && (
                <RatingForm
                    professorId={editingRating.professorId}
                    professorName={formatProfessorName(editingRating.professorId)}
                    onClose={handleCloseEdit}
                    onRatingEscaped={handleRatingUpdated}
                    editingRating={editingRating}
                />
            )}
        </div>
    );
}
