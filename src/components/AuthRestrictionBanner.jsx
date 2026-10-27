// src/components/AuthRestrictionBanner.jsx
// Advertencia global para cuentas autenticadas sin permisos de persistencia.

import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RESTRICTED_ACCOUNT_MESSAGE } from '../utils/authGuard';
import './AuthRestrictionBanner.css';

/**
 * Muestra el modo de acceso de solo consulta para correos no institucionales.
 * La advertencia permanece visible para evitar que la restricción pase inadvertida.
 */
export default function AuthRestrictionBanner() {
    const { user, isRestricted } = useAuth();

    if (!user || !isRestricted) return null;

    return (
        <aside className="auth-restriction-banner" role="status" aria-live="polite">
            <span className="auth-restriction-icon" aria-hidden="true">⚠️</span>
            <div className="auth-restriction-content">
                <strong>Cuenta con acceso limitado</strong>
                <p>{RESTRICTED_ACCOUNT_MESSAGE}</p>
            </div>
            <Link className="auth-restriction-link" to="/ajustes">
                Administrar cuenta
            </Link>
        </aside>
    );
}
