// src/services/professorService.js
import { auth, getDb } from "../firebase/config";
import {
  canUpdateProfessorCache,
  requireRatingsAccess,
} from "../utils/authGuard";

let _firestore = null;
async function getFirestoreModules() {
  if (!_firestore) {
    const db = await getDb();
    const mod = await import('firebase/firestore');
    _firestore = { db, ...mod };
  }
  return _firestore;
}

const COLL_PROFESSORS = "professors";
const COLL_RATINGS = "ratings";

/**
 * Normaliza un nombre del SIIAU (APELLIDOS, NOMBRE) a un formato humano (Nombre Apellidos)
 */
export const normalizeSiiauName = (rawName) => {
    if (!rawName || rawName.includes("POR ASIGNAR") || rawName.includes("---")) return null;

    // Convertir APELLIDOS, NOMBRES -> NOMBRES APELLIDOS
    if (rawName.includes(",")) {
        const [apellidos, nombres] = rawName.split(",").map(s => s.trim());
        rawName = `${nombres} ${apellidos}`;
    }

    // Capitalizar correctamente (LUIS ERNESTO -> Luis Ernesto)
    return rawName
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};


/**
 * Normaliza el nombre del profesor para usarlo como ID o búsqueda
 */
export const normalizeName = (name) => {
    if (!name) return "";
    return name
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9 ]/g, "")
        .trim();
};

/**
 * Busca múltiples profesores en Firestore por sus IDs (nombres normalizados)
 */
export const getProfessorsByNames = async (names) => {
    try {
        const { db, collection, query, where, getDocs } = await getFirestoreModules();
        // Usar IDs con underscores para coincidir con cómo se guardan en Firestore
        const ids = names.map(n => normalizeName(n).replace(/\s+/g, "_"));
        const results = {};

        // Firestore no permite 'in' con más de 10 elementos, así que lo hacemos por chunks
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const q = query(collection(db, COLL_PROFESSORS), where("__name__", "in", chunk));
            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
                results[doc.id] = doc.data();
            });
        }
        return results;
    } catch (error) {
        console.error("Error en búsqueda por lote:", error);
        return {};
    }
};

/**
 * Obtiene la información de un profesor (Caché local + Scraping)
 */
export const getProfessorData = async (professorName) => {
    const { db, doc, getDoc, setDoc, serverTimestamp } = await getFirestoreModules();
    const rawName = professorName;
    const cleanName = normalizeName(rawName);
    const docId = cleanName.replace(/\s+/g, "_");
    const profRef = doc(db, COLL_PROFESSORS, docId);

    try {
        const profSnap = await getDoc(profRef);

        // Si existe en caché y es reciente (ej: < 15 días) y tiene los campos correctos
        if (profSnap.exists()) {
            const data = profSnap.data();
            const lastUpdate = data.updatedAt?.toDate() || 0;
            const diffDays = (new Date() - lastUpdate) / (1000 * 60 * 60 * 24);

            // Invalida el caché si: es viejo, tiene notFound, o tiene el formato antiguo (sin ratingMP)
            const isStale = diffDays >= 15;
            const isBadFormat = !data.notFound && data.ratingMP === undefined;

            if (!isStale && !isBadFormat) {
                return { ...data, id: docId, isCached: true };
            }
        }


        // Si no está en caché o es viejo, consultamos la API de scraping
        console.log(`[professorService] Consultando API externa para: "${cleanName}"`);
        const response = await fetch(`/api/get-professor?name=${encodeURIComponent(cleanName)}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`[professorService] Error API (${response.status}):`, errorData);

            // Si no se encuentra en MisProfesores, registramos al menos el nombre para evitar re-consultas fallidas continuas
            if (response.status === 404 && canUpdateProfessorCache(auth.currentUser?.email)) {
                await setDoc(profRef, {
                    name: cleanName,
                    updatedAt: serverTimestamp(),
                    notFound: true
                }, { merge: true });
            }
            throw new Error(errorData.error || "No se pudo obtener información externa.");
        }

        const externalData = await response.json();
        console.log(`[professorService] Datos obtenidos de API:`, externalData);

        // Guardamos en Firestore con los campos que ya espera el UI
        const newProfData = {
            name: cleanName,
            mpId: externalData.id,
            ratingMP: externalData.ratingMP,
            difficultyMP: externalData.difficultyMP,
            recommendationMP: externalData.recommendationMP,
            numRatings: externalData.numRatings,
            department: externalData.department,
            school: externalData.school,
            urlMP: externalData.urlMP,
            comments: externalData.comments || [],
            updatedAt: serverTimestamp(),
            notFound: false
        };


        // La consulta pública sigue disponible, pero solo una cuenta institucional
        // puede actualizar la caché persistente de Firestore.
        if (canUpdateProfessorCache(auth.currentUser?.email)) {
            await setDoc(profRef, newProfData, { merge: true });
        }

        return { ...newProfData, id: docId, isCached: false };

    } catch (error) {
        console.warn("Error en professorService:", error.message);
        return null;
    }
};

/**
 * Agrega una evaluación nativa
 */
export const addRating = async (professorId, ratingInfo) => {
    try {
        requireRatingsAccess(auth.currentUser);
        const { db, collection, addDoc, doc, updateDoc, increment, serverTimestamp } = await getFirestoreModules();
        const ratingRef = collection(db, COLL_RATINGS);

        // Guardar la evaluación individual
        await addDoc(ratingRef, {
            professorId,
            ...ratingInfo,
            createdAt: serverTimestamp()
        });

        // Actualizar los promedios en el documento del profesor
        const profRef = doc(db, COLL_PROFESSORS, professorId);

        await updateDoc(profRef, {
            nativeRatingCount: increment(1),
            nativeRatingSum: increment(ratingInfo.stars),
            nativeDifficultySum: increment(ratingInfo.difficulty)
        });

        return true;
    } catch (error) {
        console.error("Error al guardar calificación:", error);
        return false;
    }
};

/**
 * Busca profesores en la base de datos local
 */
export const searchProfessors = async (searchTerm = "", limitCount = 20) => {
    try {
        const { db, collection, query, where, getDocs } = await getFirestoreModules();
        const normalizedSearch = normalizeName(searchTerm);
        const q = query(
            collection(db, COLL_PROFESSORS),
            where("name", ">=", normalizedSearch),
            where("name", "<=", normalizedSearch + "\uf8ff")
        );

        const querySnapshot = await getDocs(q);
        const results = [];
        querySnapshot.forEach((doc) => {
            results.push({ id: doc.id, ...doc.data() });
        });

        return results.slice(0, limitCount);
    } catch (error) {
        console.error("Error al buscar profesores:", error);
        return [];
    }
};
