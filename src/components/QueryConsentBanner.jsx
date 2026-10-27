// src/components/QueryConsentBanner.jsx
// Banner tipo "cookie" que pide permiso para usar las consultas del usuario
// como ayuda al monitoreo colaborativo de cupos
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { saveNotificationPref } from '../services/notificationService';
import { Link } from 'react-router-dom';
import './QueryConsentBanner.css';

const STORAGE_KEY = 'horario-udg-query-consent';

export default function QueryConsentBanner() {
    const { user, canUseNotifications } = useAuth();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!user || !canUseNotifications) {
            setVisible(false);
            return;
        }

        // Verificar si ya respondió (localStorage como cache rápido)
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached === 'granted' || cached === 'denied') {
            setVisible(false);
            return;
        }

        // No hay respuesta aún → mostrar
        setVisible(true);
    }, [user, canUseNotifications]);

    const handleAccept = async () => {
        localStorage.setItem(STORAGE_KEY, 'granted');
        setVisible(false);
        // Persistir en Firestore
        if (user && canUseNotifications) {
            try {
                await saveNotificationPref(user.uid, { queryConsent: true });
            } catch { /* falla silenciosa */ }
        }
    };

    const handleDecline = async () => {
        localStorage.setItem(STORAGE_KEY, 'denied');
        setVisible(false);
        if (user && canUseNotifications) {
            try {
                await saveNotificationPref(user.uid, { queryConsent: false });
            } catch { /* falla silenciosa */ }
        }
    };

    if (!visible) return null;

    return (
        <div className="qconsent-overlay">
            <div className="qconsent-banner">
                <div className="qconsent-icon">🤝</div>
                <div className="qconsent-content">
                    <strong>Ayuda a la comunidad</strong>
                    <p>
                        ¿Permites que tus consultas al SIIAU también ayuden a verificar
                        materias que otros estudiantes están esperando? Es anónimo,
                        automático y no afecta tu consulta.
                        <Link to="/privacidad" className="qconsent-link"> Más info</Link>
                    </p>
                </div>
                <div className="qconsent-actions">
                    <button className="qconsent-btn qconsent-btn-accept" onClick={handleAccept} type="button">
                        ✓ Aceptar
                    </button>
                    <button className="qconsent-btn qconsent-btn-decline" onClick={handleDecline} type="button">
                        No, gracias
                    </button>
                </div>
            </div>
        </div>
    );
}
