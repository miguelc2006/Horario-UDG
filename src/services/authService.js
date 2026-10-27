// src/services/authService.js
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut as firebaseSignOut 
} from "firebase/auth";
import { auth } from "../firebase/config";

const provider = new GoogleAuthProvider();

// Forzamos que siempre pida seleccionar cuenta (útil si tienes varias sesiones)
provider.setCustomParameters({
    prompt: "select_account"
});

/**
 * Inicia sesión con cualquier cuenta de Google.
 * La autorización para persistir datos se evalúa después mediante AuthContext
 * y las guardias de servicio; una cuenta no institucional conserva acceso de consulta.
 *
 * @returns {Promise<import('firebase/auth').User>} Usuario autenticado.
 */
export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        // Relanzamos el error para manejarlo en el componente visual (Navbar)
        console.error("Error en login:", error.message);
        throw error;
    }
};

export const logout = async () => {
    return await firebaseSignOut(auth);
};