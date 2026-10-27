// src/main.jsx
import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';

// Importamos el Layout Principal (eager, necesario siempre)
import App from './App.jsx';

// Lazy loading de páginas - se cargan bajo demanda (splitting automático de Vite)
// NOTA: Las páginas usan named exports, por eso re-mapeamos a .default
const HomePage = lazy(() => import('./pages/HomePage.jsx').then(m => ({ default: m.HomePage })));
const PlannerPage = lazy(() => import('./pages/PlannerPage.jsx').then(m => ({ default: m.PlannerPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then(m => ({ default: m.DashboardPage })));
const MySchedulesPage = lazy(() => import('./pages/MySchedulesPage.jsx').then(m => ({ default: m.MySchedulesPage })));
const BenefitsPage = lazy(() => import('./pages/BenefitsPage.jsx').then(m => ({ default: m.BenefitsPage })));
const TeachersPage = lazy(() => import('./pages/TeachersPage.jsx').then(m => ({ default: m.TeachersPage })));
const MyRatingsPage = lazy(() => import('./pages/MyRatingsPage.jsx').then(m => ({ default: m.MyRatingsPage })));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage.jsx').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/TermsPage.jsx').then(m => ({ default: m.TermsPage })));
const NotificationTestPage = lazy(() => import('./pages/NotificationTestPage.jsx').then(m => ({ default: m.NotificationTestPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx').then(m => ({ default: m.NotificationsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx').then(m => ({ default: m.ProfilePage })));

import './index.css';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Componente de carga mientras se descarga el chunk de la página
function PageLoader() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '50vh', color: 'var(--text-secondary-color)',
      fontSize: '1.1rem'
    }}>
      <span>Cargando...</span>
    </div>
  );
}

// DEFINICIÓN DEL ROUTER (Data Router) con Lazy Loading
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />, // App es el contenedor principal (Layout + AuthProvider)
    children: [
      {
        index: true, // Ruta raíz "/"
        element: <Suspense fallback={<PageLoader />}><HomePage /></Suspense>,
      },
      {
        path: "planear",
        element: <Suspense fallback={<PageLoader />}><PlannerPage /></Suspense>,
      },
      {
        path: "dashboard",
        element: <Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>,
      },
      {
        path: "mis-horarios",
        element: <Suspense fallback={<PageLoader />}><MySchedulesPage /></Suspense>,
      },
      {
        path: "beneficios",
        element: <Suspense fallback={<PageLoader />}><BenefitsPage /></Suspense>,
      },
      {
        path: "profesores",
        element: <Suspense fallback={<PageLoader />}><TeachersPage /></Suspense>,
      },
      {
        path: "mis-evaluaciones",
        element: <Suspense fallback={<PageLoader />}><MyRatingsPage /></Suspense>,
      },
      {
        path: "privacidad",
        element: <Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense>,
      },
      {
        path: "terminos",
        element: <Suspense fallback={<PageLoader />}><TermsPage /></Suspense>,
      },
      {
        path: "mis-notificaciones",
        element: <Suspense fallback={<PageLoader />}><NotificationsPage /></Suspense>,
      },
      {
        path: "ajustes",
        element: <Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>,
      },
      // Ruta de pruebas interna — solo disponible en desarrollo
      ...(import.meta.env.DEV ? [{
        path: "test-notificaciones",
        element: <Suspense fallback={<PageLoader />}><NotificationTestPage /></Suspense>,
      }] : []),
      {
        path: "*",
        element: <Suspense fallback={<PageLoader />}><HomePage /></Suspense>,
      }
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={clientId}>
      {/* RouterProvider provee el contexto necesario para useBlocker */}
      <RouterProvider router={router} />
    </GoogleOAuthProvider>
  </React.StrictMode>,
);