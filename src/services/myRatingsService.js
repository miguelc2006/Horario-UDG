import { auth, getDb } from '../firebase/config';
import { canManageRatings, requireRatingsAccess } from '../utils/authGuard.js';

const COLL_RATINGS = 'ratings';

let _firestore = null;
async function getFS() {
  if (!_firestore) {
    const db = await getDb();
    _firestore = { db, ...(await import('firebase/firestore')) };
  }
  return _firestore;
}

/**
 * Obtiene todas las evaluaciones del usuario actual
 */
export const getMyRatings = async (userId) => {
    if (!userId || !canManageRatings(auth.currentUser?.email)) return [];

    try {
        const { db, collection, query, where, getDocs } = await getFS();
        const q = query(
            collection(db, COLL_RATINGS),
            where('userId', '==', userId)
        );

        const snapshot = await getDocs(q);
        const ratings = [];

        snapshot.forEach(doc => {
            ratings.push({
                id: doc.id,
                ...doc.data()
            });
        });

        // Ordenar por fecha más reciente
        ratings.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });

        return ratings;
    } catch (error) {
        console.error("Error obteniendo mis evaluaciones:", error);
        return [];
    }
};

/**
 * Obtiene una evaluación específica por ID
 */
export const getMyRatingById = async (ratingId) => {
    if (!canManageRatings(auth.currentUser?.email)) return null;

    try {
        const { db, doc: docRef, getDoc } = await getFS();
        const docSnap = await getDoc(docRef(db, COLL_RATINGS, ratingId));

        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        return null;
    } catch (error) {
        console.error("Error obteniendo evaluación:", error);
        return null;
    }
};

/**
 * Actualiza una evaluación existente
 */
export const updateMyRating = async (ratingId, userId, updatedData) => {
    if (!ratingId || !userId) return false;

    try {
        requireRatingsAccess(auth.currentUser);
        const { db, doc: docFn, getDoc, updateDoc, serverTimestamp } = await getFS();
        const docRef = docFn(db, COLL_RATINGS, ratingId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.error("Evaluación no encontrada");
            return false;
        }

        const ratingData = docSnap.data();

        // Verificar que el usuario es el autor
        if (ratingData.userId !== userId) {
            console.error("No tienes permiso para editar esta evaluación");
            return false;
        }

        await updateDoc(docRef, {
            ...updatedData,
            updatedAt: serverTimestamp()
        });

        return true;
    } catch (error) {
        console.error("Error actualizando evaluación:", error);
        return false;
    }
};

/**
 * Obtiene el conteo de evaluaciones del usuario
 */
export const getMyRatingsCount = async (userId) => {
    if (!userId || !canManageRatings(auth.currentUser?.email)) return 0;

    try {
        const { db, collection, query, where, getDocs } = await getFS();
        const q = query(
            collection(db, COLL_RATINGS),
            where('userId', '==', userId)
        );

        const snapshot = await getDocs(q);
        return snapshot.size;
    } catch (error) {
        console.error("Error obteniendo conteo:", error);
        return 0;
    }
};

/**
 * Verifica si el usuario ya evaluó a un profesor específico
 */
export const hasUserRatedProfessor = async (userId, professorId) => {
    if (!userId || !professorId || !canManageRatings(auth.currentUser?.email)) return false;

    try {
        const { db, collection, query, where, getDocs } = await getFS();
        const q = query(
            collection(db, COLL_RATINGS),
            where('userId', '==', userId),
            where('professorId', '==', professorId)
        );

        const snapshot = await getDocs(q);
        return !snapshot.empty;
    } catch (error) {
        console.error("Error verificando evaluación:", error);
        return false;
    }
};

/**
 * Obtiene la evaluación del usuario para un profesor específico
 */
export const getUserRatingForProfessor = async (userId, professorId) => {
    if (!userId || !professorId || !canManageRatings(auth.currentUser?.email)) return null;

    try {
        const { db, collection, query, where, getDocs } = await getFS();
        const q = query(
            collection(db, COLL_RATINGS),
            where('userId', '==', userId),
            where('professorId', '==', professorId)
        );

        const snapshot = await getDocs(q);

        if (snapshot.empty) return null;

        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    } catch (error) {
        console.error("Error obteniendo evaluación:", error);
        return null;
    }
};

/**
 * Obtiene todas las evaluaciones de un profesor específico (para mostrar en detalle)
 */
export const getRatingsForProfessor = async (professorId) => {
    if (!professorId) return [];

    try {
        const { db, collection, query, where, getDocs } = await getFS();
        const q = query(
            collection(db, COLL_RATINGS),
            where('professorId', '==', professorId)
        );

        const snapshot = await getDocs(q);
        const ratings = [];

        snapshot.forEach(doc => {
            ratings.push({
                id: doc.id,
                ...doc.data()
            });
        });

        return ratings;
    } catch (error) {
        console.error("Error obteniendo evaluaciones del profesor:", error);
        return [];
    }
};
