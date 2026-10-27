// src/components/Navbar.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { logout } from '../services/authService';
import { GoogleAuthBtn } from './GoogleAuthBtn'; 
import NotificationBell from './NotificationBell';
import udgLogo from '/udgleonline.svg';
import './Navbar.css';

const Navbar = React.memo(({ theme, toggleTheme, showNewQuery, onNewQuery }) => {
  const { user } = useAuth();
  const location = useLocation();
  const handleLogout = async () => {
    try { 
        await logout(); 
    } catch (error) { 
        console.error("Error al cerrar sesión:", error); 
    }
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        
        {/* --- SECCIÓN IZQUIERDA: LOGO --- */}
        <div className="navbar-left">
            <Link to="/" className="navbar-logo">
                <img src={udgLogo} alt="Logo UDG" className="logo-img" width="32" height="32" />
                <div className="logo-text">
                    <span className="logo-heading">Planeador <span className="text-highlight">UDG</span></span>
                </div>
            </Link>
        </div>

        {/* --- SECCIÓN CENTRAL: ENLACES (Visible en desktop) --- */}
        <div className="navbar-links desktop-only">
            <Link 
                to="/planear" 
                className={`nav-link ${location.pathname === '/planear' ? 'active' : ''}`}
            >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Planificador</span>
            </Link>

            <Link 
                to="/beneficios" 
                className={`nav-link special-link ${location.pathname === '/beneficios' ? 'active' : ''}`}
                title="Ver beneficios para estudiantes"
            >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>
                <span>Beneficios</span>
            </Link>

            <Link 
                    to="/profesores" 
                    className={`nav-link ${location.pathname === '/profesores' ? 'active' : ''}`}
                >
                    <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>Profesores</span>
                </Link>
        </div>

        {/* --- SECCIÓN DERECHA: ACCIONES (Siempre visibles) --- */}
        <div className="navbar-actions">
            
            {showNewQuery && (
                <button onClick={onNewQuery} className="btn-new-query" title="Nueva Consulta">
                    <span className="plus-icon">+</span> 
                    <span className="btn-text">Nueva</span> 
                </button>
            )}

            <NotificationBell />

            <button onClick={toggleTheme} className="btn-theme-toggle" title="Cambiar Tema">
                {theme === 'light' ? '🌙' : '☀️'}
            </button>

            <div className="divider"></div>

            {user ? (
                <div className="user-profile">
                    <Link to="/dashboard" className="profile-link" title="Ir al Dashboard">
                        <div className="user-info">
                            <p className="user-name">{user.displayName?.split(' ')[0]}</p>
                        </div>
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Perfil" className="user-avatar" />
                        ) : (
                            <div className="user-avatar-placeholder">{user.displayName?.charAt(0)}</div>
                        )}
                    </Link>
                    <Link to="/ajustes" className="btn-settings" title="Ajustes">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </Link>
                    <button onClick={handleLogout} className="btn-logout" title="Cerrar Sesión">
                        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            ) : (
                <GoogleAuthBtn />
            )}
        </div>
      </div>

      {/* --- BARRA DE NAVEGACIÓN INFERIOR (Solo móvil) --- */}
      <div className="mobile-bottom-nav">
        <Link 
            to="/" 
            className={`mobile-nav-item ${location.pathname === '/' ? 'active' : ''}`}
        >
            <svg className="mobile-nav-icon" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="mobile-nav-label">Inicio</span>
        </Link>

        <Link 
            to="/planear" 
            className={`mobile-nav-item ${location.pathname === '/planear' ? 'active' : ''}`}
        >
            <svg className="mobile-nav-icon" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="mobile-nav-label">Planificar</span>
        </Link>

        <Link 
            to="/profesores" 
            className={`mobile-nav-item ${location.pathname === '/profesores' ? 'active' : ''}`}
        >
            <svg className="mobile-nav-icon" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span className="mobile-nav-label">Profesores</span>
        </Link>

        <Link 
            to="/beneficios" 
            className={`mobile-nav-item ${location.pathname === '/beneficios' ? 'active' : ''}`}
        >
            <svg className="mobile-nav-icon" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span className="mobile-nav-label">Beneficios</span>
        </Link>

        {user && (
            <Link 
                to="/dashboard" 
                className={`mobile-nav-item ${location.pathname === '/dashboard' || location.pathname === '/mis-horarios' ? 'active' : ''}`}
            >
                <svg className="mobile-nav-icon" width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="mobile-nav-label">Mi Cuenta</span>
            </Link>
        )}
      </div>
    </nav>
  );
});

export default Navbar;