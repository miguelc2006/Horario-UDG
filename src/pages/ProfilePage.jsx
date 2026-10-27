// src/pages/ProfilePage.jsx
// Página de ajustes de perfil: información del usuario, preferencias,
// exportación de datos y eliminación de cuenta.

import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utils/toast';
import { getProfileTypeLabel } from '../utils/profileAccess.js';
import {
    updateDisplayName,
    getUserDataSummary,
    exportUserData,
    deleteAllUserData,
    deleteAuthAccount,
} from '../services/profileService';
import { logout } from '../services/authService';
import { getNotificationPrefs, saveNotificationPref } from '../services/notificationService';
import './ProfilePage.css';

// =================================================================
// Componente interno: Modal de confirmación para eliminar cuenta
// =================================================================
function DeleteAccountModal({ isOpen, onClose, onConfirm, loading }) {
    const [confirmText, setConfirmText] = useState('');
    const [step, setStep] = useState('confirm'); // 'confirm' | 'reauthenticate' | 'processing'

    const handleDelete = async () => {
        if (confirmText !== 'ELIMINAR') return;
        setStep('processing');
        await onConfirm();
    };

    const handleClose = () => {
        setConfirmText('');
        setStep('confirm');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={!loading ? handleClose : undefined} role="dialog" aria-modal="true" aria-label="Eliminar cuenta">
            <div className="modal-content danger-modal" onClick={e => e.stopPropagation()}>
                {/* Step 1: Confirmación */}
                {step === 'confirm' && (
                    <>
                        <div className="modal-header danger-header">
                            <span className="modal-icon">⚠️</span>
                            <h2>Eliminar cuenta</h2>
                        </div>

                        <div className="modal-body">
                            <div className="danger-banner">
                                <strong>Esta acción es irreversible.</strong>
                            </div>

                            <p>Se eliminarán <strong>permanentemente</strong> todos tus datos asociados:</p>
                            <ul className="data-list">
                                <li>📅 Horarios guardados</li>
                                <li>⭐ Evaluaciones a profesores</li>
                                <li>📡 Cursos monitoreados</li>
                                <li>🔔 Historial de notificaciones</li>
                                <li>⚙️ Preferencias de la cuenta</li>
                            </ul>

                            <p className="confirm-prompt">
                                Escribe <strong>ELIMINAR</strong> para confirmar:
                            </p>
                            <input
                                type="text"
                                className="confirm-input"
                                placeholder="Escribe ELIMINAR"
                                value={confirmText}
                                onChange={e => setConfirmText(e.target.value)}
                                disabled={loading}
                                autoFocus
                            />
                        </div>

                        <div className="modal-footer">
                            <button
                                className="btn btn-cancel"
                                onClick={handleClose}
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={handleDelete}
                                disabled={confirmText !== 'ELIMINAR' || loading}
                            >
                                {loading ? 'Eliminando...' : 'Eliminar mi cuenta'}
                            </button>
                        </div>
                    </>
                )}

                {/* Step 2: Procesando */}
                {step === 'processing' && (
                    <div className="modal-body processing-state">
                        <div className="spinner"></div>
                        <p>{loading ? 'Eliminando tus datos...' : 'Redirigiendo...'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// =================================================================
// Componente principal: ProfilePage
// =================================================================
export function ProfilePage() {
    const {
        user,
        profileType,
        canUseCloudSchedules,
        canManageRatings,
        canUseNotifications,
    } = useAuth();
    const navigate = useNavigate();
    const { theme } = useOutletContext(); // Tema actual desde App

    // Estados
    const [dataSummary, setDataSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Edición de nombre
    const [editingName, setEditingName] = useState(false);
    const [nameInput, setNameInput] = useState('');

    // Preferencias de notificación
    const [notifPrefs, setNotifPrefs] = useState({});
    const dataCapabilities = {
        cloudSchedules: canUseCloudSchedules,
        ratings: canManageRatings,
        notifications: canUseNotifications,
    };

    // ------------------------------------------------------------------
    // Cargar datos al montar
    // ------------------------------------------------------------------
    useEffect(() => {
        if (!user) {
            navigate('/');
            return;
        }
        if (!canUseCloudSchedules && !canManageRatings && !canUseNotifications) {
            setDataSummary({ schedules: 0, monitored: 0, notifications: 0, ratings: 0 });
            setNotifPrefs({});
            setLoading(false);
            return;
        }
        loadProfileData();
    }, [user, canUseCloudSchedules, canManageRatings, canUseNotifications, navigate]);

    const loadProfileData = async () => {
        setLoading(true);
        try {
            const [summary, prefs] = await Promise.all([
                getUserDataSummary(user.uid, dataCapabilities),
                canUseNotifications
                    ? getNotificationPrefs(user.uid).catch(() => ({}))
                    : Promise.resolve({}),
            ]);
            setDataSummary(summary);
            setNotifPrefs(prefs);
        } catch (err) {
            console.error('[ProfilePage] Error cargando datos:', err);
        } finally {
            setLoading(false);
        }
    };

    // ------------------------------------------------------------------
    // Guardar nombre de visualización
    // ------------------------------------------------------------------
    const handleSaveName = async () => {
        if (!canManageRatings && !canUseCloudSchedules) {
            showToast('Esta cuenta no tiene permisos para modificar el perfil.', 'warning');
            setEditingName(false);
            return;
        }
        if (!nameInput.trim() || nameInput.trim() === user.displayName) {
            setEditingName(false);
            return;
        }
        try {
            await updateDisplayName(user, nameInput.trim());
            showToast('Nombre actualizado correctamente', 'success');
            setEditingName(false);
        } catch (err) {
            showToast(err.message || 'Error al actualizar nombre', 'error');
        }
    };

    const handleStartEditName = () => {
        if (!canManageRatings && !canUseCloudSchedules) {
            showToast('Esta cuenta no tiene permisos para modificar el perfil.', 'warning');
            return;
        }
        setNameInput(user?.displayName || '');
        setEditingName(true);
    };

    // ------------------------------------------------------------------
    // Alternar preferencias de notificación
    // ------------------------------------------------------------------
    const handleToggleNotifPref = async (key) => {
        if (!canUseNotifications) {
            showToast('Usa un correo institucional habilitado para guardar preferencias.', 'warning');
            return;
        }
        const newValue = !notifPrefs[key];
        const updated = { ...notifPrefs, [key]: newValue };
        setNotifPrefs(updated);

        const ok = await saveNotificationPref(user.uid, { [key]: newValue });
        if (!ok) {
            // Revertir si falló
            setNotifPrefs(notifPrefs);
            showToast('Error al guardar preferencia', 'error');
        } else {
            showToast(
                newValue ? 'Preferencia activada' : 'Preferencia desactivada',
                'success'
            );
        }
    };

    // ------------------------------------------------------------------
    // Exportar datos
    // ------------------------------------------------------------------
    const handleExportData = async () => {
        if (!canUseCloudSchedules && !canManageRatings && !canUseNotifications) {
            showToast('Esta cuenta no tiene datos persistidos para exportar.', 'info');
            return;
        }
        setExporting(true);
        try {
            await exportUserData(user.uid, dataCapabilities);
            showToast('Datos exportados correctamente', 'success');
        } catch (err) {
            showToast('Error al exportar datos', 'error');
            console.error('[ProfilePage] Error exportando:', err);
        } finally {
            setExporting(false);
        }
    };

    // ------------------------------------------------------------------
    // Eliminar cuenta completa
    // ------------------------------------------------------------------
    const handleDeleteAccount = async () => {
        setDeleting(true);
        try {
            // La limpieza de Firestore es independiente y nunca debe impedir
            // que el usuario elimine su identidad de Firebase Auth.
            if (canUseCloudSchedules || canManageRatings || canUseNotifications) {
                try {
                    const deletedCounts = await deleteAllUserData(user.uid, dataCapabilities);
                    console.log('[ProfilePage] Datos eliminados:', deletedCounts);
                } catch (cleanupError) {
                    console.warn('[ProfilePage] Limpieza Firestore incompleta:', cleanupError);
                }
            }

            // Esta operación está disponible para cualquier cuenta autenticada.
            await deleteAuthAccount(user);

            // El usuario eliminado ya no tiene sesión; logout queda como limpieza local.
            await logout().catch(() => undefined);

            showToast('Cuenta eliminada permanentemente', 'info');
            navigate('/');
        } catch (err) {
            if (err.code === 'auth/popup-closed-by-user') {
                showToast('Se canceló la autenticación. La cuenta no se eliminó.', 'warning');
            } else {
                showToast(err.message || 'Error al eliminar la cuenta', 'error');
                console.error('[ProfilePage] Error eliminando cuenta:', err);
            }
        } finally {
            setDeleting(false);
            setShowDeleteModal(false);
        }
    };

    // ------------------------------------------------------------------
    // Render: Estados de carga y error
    // ------------------------------------------------------------------
    if (!user) return null;

    if (loading) {
        return (
            <div className="animate-fade-in profile-container">
                <div className="profile-loading">
                    <div className="spinner"></div>
                    <p>Cargando ajustes...</p>
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------------
    // Render: Página completa
    // ------------------------------------------------------------------
    const accountType = getProfileTypeLabel(profileType);

    return (
        <div className="animate-fade-in profile-container">
            {/* ================================================================ */}
            {/* ENCABEZADO */}
            {/* ================================================================ */}
            <header className="profile-header">
                <h1>
                    <span className="header-icon">⚙️</span>
                    Ajustes de cuenta
                </h1>
                <p className="header-subtitle">Gestiona tu perfil, preferencias y datos personales</p>
            </header>

            {/* ================================================================ */}
            {/* SECCIÓN: INFORMACIÓN DEL USUARIO */}
            {/* ================================================================ */}
            <section className="profile-section">
                <div className="section-title-row">
                    <h2>Información personal</h2>
                </div>

                <div className="profile-card">
                    <div className="profile-avatar-section">
                        <div className="profile-avatar">
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="Foto de perfil" className="avatar-img-large" />
                            ) : (
                                <span className="avatar-initials">
                                    {user.displayName?.charAt(0) || 'U'}
                                </span>
                            )}
                        </div>
                        <div className="profile-identity">
                            {editingName ? (
                                <div className="name-edit-row">
                                    <input
                                        type="text"
                                        className="name-input"
                                        value={nameInput}
                                        onChange={e => setNameInput(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveName();
                                            if (e.key === 'Escape') setEditingName(false);
                                        }}
                                        autoFocus
                                        maxLength={100}
                                        placeholder="Tu nombre"
                                    />
                                    <button className="btn-icon btn-icon-save" onClick={handleSaveName} title="Guardar">
                                        ✅
                                    </button>
                                    <button className="btn-icon btn-icon-cancel" onClick={() => setEditingName(false)} title="Cancelar">
                                        ❌
                                    </button>
                                </div>
                            ) : (
                                <div className="name-display-row">
                                    <h3 className="profile-name">{user.displayName || 'Sin nombre'}</h3>
                                    {(canManageRatings || canUseCloudSchedules) && (
                                        <button className="btn-icon btn-icon-edit" onClick={handleStartEditName} title="Editar nombre">
                                            ✏️
                                        </button>
                                    )}
                                </div>
                            )}
                            <p className="profile-email">{user.email}</p>
                            <span className="profile-badge">{accountType}</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ================================================================ */}
            {/* SECCIÓN: PREFERENCIAS */}
            {/* ================================================================ */}
            <section className="profile-section">
                <div className="section-title-row">
                    <h2>Preferencias</h2>
                </div>

                <div className="profile-card">
                    {/* Tema */}
                    <div className="pref-row">
                        <div className="pref-info">
                            <span className="pref-icon">🌓</span>
                            <div>
                                <span className="pref-label">Tema visual</span>
                                <span className="pref-desc">Usa el botón {theme === 'light' ? '🌙' : '☀️'} en la barra superior</span>
                            </div>
                        </div>
                        <span className="pref-value">{theme === 'light' ? 'Claro' : 'Oscuro'}</span>
                    </div>

                    {canUseNotifications && (
                        <>
                            <div className="pref-divider"></div>

                            {/* Notificaciones: sonido */}
                            <div className="pref-row">
                                <div className="pref-info">
                                    <span className="pref-icon">🔊</span>
                                    <div>
                                        <span className="pref-label">Sonido en notificaciones</span>
                                        <span className="pref-desc">Reproducir sonido al recibir una notificación</span>
                                    </div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={notifPrefs.soundEnabled ?? true}
                                        onChange={() => handleToggleNotifPref('soundEnabled')}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>

                            <div className="pref-divider"></div>

                            {/* Notificaciones: monitoreo */}
                            <div className="pref-row">
                                <div className="pref-info">
                                    <span className="pref-icon">📡</span>
                                    <div>
                                        <span className="pref-label">Alertas de monitoreo</span>
                                        <span className="pref-desc">Notificar cuando se liberen cupos en NRCs monitoreados</span>
                                    </div>
                                </div>
                                <span className="pref-badge-indicator">Siempre activo</span>
                            </div>
                        </>
                    )}
                </div>
            </section>

            {/* ================================================================ */}
            {/* SECCIÓN: DATOS Y EXPORTACIÓN */}
            {/* ================================================================ */}
            <section className="profile-section">
                <div className="section-title-row">
                    <h2>Mis datos</h2>
                </div>

                <div className="profile-card">
                    <div className="data-summary">
                        {canUseCloudSchedules && (
                            <div className="data-stat">
                                <span className="data-stat-icon">📅</span>
                                <span className="data-stat-value">{dataSummary?.schedules ?? 0}</span>
                                <span className="data-stat-label">Horarios</span>
                            </div>
                        )}
                        {canManageRatings && (
                            <div className="data-stat">
                                <span className="data-stat-icon">⭐</span>
                                <span className="data-stat-value">{dataSummary?.ratings ?? 0}</span>
                                <span className="data-stat-label">Evaluaciones</span>
                            </div>
                        )}
                        {canUseNotifications && (
                            <>
                                <div className="data-stat">
                                    <span className="data-stat-icon">📡</span>
                                    <span className="data-stat-value">{dataSummary?.monitored ?? 0}</span>
                                    <span className="data-stat-label">Monitoreos</span>
                                </div>
                                <div className="data-stat">
                                    <span className="data-stat-icon">🔔</span>
                                    <span className="data-stat-value">{dataSummary?.notifications ?? 0}</span>
                                    <span className="data-stat-label">Notificaciones</span>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="export-row">
                        <div className="export-info">
                            <span className="pref-label">Exportar todos mis datos</span>
                            <span className="pref-desc">Descarga un archivo JSON con toda tu información</span>
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={handleExportData}
                            disabled={exporting}
                        >
                            {exporting ? 'Exportando...' : '📥 Exportar datos'}
                        </button>
                    </div>
                </div>
            </section>

            {/* ================================================================ */}
            {/* SECCIÓN: ZONA DE PELIGRO — ELIMINAR CUENTA */}
            {/* ================================================================ */}
            <section className="profile-section">
                <div className="section-title-row">
                    <h2 className="danger-title">Zona de peligro</h2>
                </div>

                <div className="profile-card danger-card">
                    <div className="danger-row">
                        <div className="danger-info">
                            <span className="danger-icon">🗑️</span>
                            <div>
                                <span className="danger-label">Eliminar cuenta</span>
                                <span className="danger-desc">
                                    Elimina permanentemente tu cuenta y todos tus datos. Esta acción no se puede deshacer.
                                </span>
                            </div>
                        </div>
                        <button
                            className="btn btn-danger-outline"
                            onClick={() => setShowDeleteModal(true)}
                        >
                            Eliminar cuenta
                        </button>
                    </div>
                </div>
            </section>

            {/* ================================================================ */}
            {/* MODAL DE ELIMINACIÓN */}
            {/* ================================================================ */}
            <DeleteAccountModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={handleDeleteAccount}
                loading={deleting}
            />
        </div>
    );
}

