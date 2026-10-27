import { auth, getDb } from "../firebase/config";
import { isEmailAuthorized, requireAuthorizedUser } from "../utils/authGuard";

let _firestore = null;
async function getFirestoreModules() {
  if (!_firestore) {
    const db = await getDb();
    const mod = await import('firebase/firestore');
    _firestore = { db, ...mod };
  }
  return _firestore;
}

/**
 * Crea un NUEVO horario en la subcolección.
 */
export const createSchedule = async (userId, scheduleData, name) => {
  try {
    requireAuthorizedUser(auth.currentUser);
    const { db, collection, addDoc } = await getFirestoreModules();
    const schedulesRef = collection(db, "users", userId, "schedules");
    const docRef = await addDoc(schedulesRef, {
      ...scheduleData,
      name: name || "Horario Sin Título",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creando horario:", error);
    throw error;
  }
};

/**
 * Actualiza un horario EXISTENTE (Sobreescribe).
 */
export const updateSchedule = async (userId, scheduleId, scheduleData) => {
  try {
    requireAuthorizedUser(auth.currentUser);
    const { db, doc, updateDoc } = await getFirestoreModules();
    const docRef = doc(db, "users", userId, "schedules", scheduleId);
    await updateDoc(docRef, {
      ...scheduleData,
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error("Error actualizando horario:", error);
    throw error;
  }
};

/**
 * Obtiene la lista de todos los horarios del usuario.
 */
export const getUserSchedules = async (userId) => {
  if (!auth.currentUser || !isEmailAuthorized(auth.currentUser.email)) return [];

  try {
    const { db, collection, query, orderBy, getDocs } = await getFirestoreModules();
    const schedulesRef = collection(db, "users", userId, "schedules");
    const q = query(schedulesRef, orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Error obteniendo horarios:", error);
    return [];
  }
};

/**
 * Elimina un horario.
 */
export const deleteSchedule = async (userId, scheduleId) => {
  try {
    requireAuthorizedUser(auth.currentUser);
    const { db, doc, deleteDoc } = await getFirestoreModules();
    await deleteDoc(doc(db, "users", userId, "schedules", scheduleId));
    return true;
  } catch (error) {
    console.error("Error eliminando horario:", error);
    throw error;
  }
};