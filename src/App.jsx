// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { NotificationsProvider } from './context/NotificationsContext.jsx';
import { Footer } from './components/Footer.jsx';
import Navbar from './components/Navbar.jsx';
import { ToastContainer } from './components/Toast.jsx';
import QueryConsentBanner from './components/QueryConsentBanner.jsx';
import AuthRestrictionBanner from './components/AuthRestrictionBanner.jsx';
import './App.css';

function App() {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('app-theme') || 'light';
    });
    const location = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);

    useEffect(() => {
        document.body.classList.remove('light-theme', 'dark-theme');
        document.body.classList.add(`${theme}-theme`);
        localStorage.setItem('app-theme', theme);

        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    const toggleTheme = () => setTheme(prev => (prev === 'light' ? 'dark' : 'light'));

    return (
        // AuthProvider ahora está DENTRO del RouterProvider (porque App es hijo del Router)
        // Esto permite que AuthContext pueda usar hooks de navegación si lo necesita.
        <AuthProvider>
            <NotificationsProvider>
                <div className="app-root">
                    <a href="#main-content" className="skip-link">
                        Saltar al contenido principal
                    </a>
                    <Navbar theme={theme} toggleTheme={toggleTheme} />
                    <AuthRestrictionBanner />

                    <main className="app-main" id="main-content">
                        <Outlet context={{ theme }} />
                    </main>

                    <QueryConsentBanner />

                    <Footer />
                </div>
                <ToastContainer />
            </NotificationsProvider>
        </AuthProvider>
    );
}

export default App;
