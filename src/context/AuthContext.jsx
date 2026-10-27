// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/config";
import { syncAccountProfile } from "../services/accountService.js";
import {
  getProfileType,
  profileHasCapability,
  PROFILE_CAPABILITIES,
  PROFILE_TYPES,
} from "../utils/profileAccess.js";

// 1. Creamos el contexto
const AuthContext = createContext();

// 2. Creamos un "Hook" personalizado para usar el contexto fácilmente
// Esto nos permitirá escribir `const { user } = useAuth()` en cualquier componente
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de un AuthProvider");
  return context;
};

// 3. Creamos el Proveedor que envolverá tu app
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Firebase escucha cambios en la sesión. La sincronización es idempotente:
    // solo el primer inicio crea el evento de registro de la cuenta.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        syncAccountProfile().catch((error) => {
          console.error('[AuthContext] No se pudo sincronizar el perfil interno:', error.message);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const profileType = getProfileType(user?.email);
  const isStudent = Boolean(user && profileType === PROFILE_TYPES.STUDENT);
  const isAcademic = Boolean(user && profileType === PROFILE_TYPES.ACADEMIC);
  const canUseCloudSchedules = Boolean(user && profileHasCapability(profileType, PROFILE_CAPABILITIES.CLOUD_SCHEDULES));
  const canManageRatings = Boolean(user && profileHasCapability(profileType, PROFILE_CAPABILITIES.RATINGS));
  const canUseNotifications = Boolean(user && profileHasCapability(profileType, PROFILE_CAPABILITIES.NOTIFICATIONS));
  const canUpdateProfessorCache = Boolean(user && profileHasCapability(profileType, PROFILE_CAPABILITIES.PROFESSOR_CACHE));

  // Alias compatible: `isAuthorized` conserva el significado histórico de
  // acceso a horarios personales en la nube, exclusivo de alumnos.
  const isAuthorized = canUseCloudSchedules;
  const isRestricted = Boolean(user && profileType === PROFILE_TYPES.EXTERNAL);
  const contextValue = useMemo(
    () => ({
      user,
      loading,
      profileType,
      isStudent,
      isAcademic,
      isAuthorized,
      isRestricted,
      canUseCloudSchedules,
      canManageRatings,
      canUseNotifications,
      canUpdateProfessorCache,
    }),
    [
      user,
      loading,
      profileType,
      isStudent,
      isAcademic,
      isAuthorized,
      isRestricted,
      canUseCloudSchedules,
      canManageRatings,
      canUseNotifications,
      canUpdateProfessorCache,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {/* Solo mostramos la app cuando ya sabemos si hay usuario o no */}
      {!loading && children}
    </AuthContext.Provider>
  );
};