import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB9UbtWQ0Ec0Mji0vNigoaFgtaPm6MbQxk",
  authDomain: "workout-tracker-f9441.firebaseapp.com",
  projectId: "workout-tracker-f9441",
  storageBucket: "workout-tracker-f9441.firebasestorage.app",
  messagingSenderId: "1074705976490",
  appId: "1:1074705976490:web:dc1486c0839476cfe0d4d3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let firestorePersistenceStatus = "pending";

export const authReady = setPersistence(auth, browserLocalPersistence);

export const firestoreReady = enableIndexedDbPersistence(db)
  .then(() => {
    firestorePersistenceStatus = "enabled";
  })
  .catch((error) => {
    if (error?.code !== "failed-precondition") {
      firestorePersistenceStatus = "unavailable";
      console.warn("Firestore offline persistence unavailable.", error);
      return;
    }

    return enableMultiTabIndexedDbPersistence(db)
      .then(() => {
        firestorePersistenceStatus = "multi-tab";
      })
      .catch((fallbackError) => {
        firestorePersistenceStatus = "unavailable";
        console.warn("Firestore multi-tab persistence unavailable.", fallbackError);
      });
  });

export function getFirestorePersistenceStatus() {
  return firestorePersistenceStatus;
}

export function watchAuth(callback) {
  let unsubscribe = () => {};
  authReady.finally(() => {
    unsubscribe = onAuthStateChanged(auth, callback);
  });
  return () => unsubscribe();
}

export async function signInWithGoogle() {
  await authReady;
  return signInWithPopup(auth, googleProvider);
}

export async function addWorkoutSet(userId, workout) {
  await firestoreReady;
  return addDoc(workoutsCollection(userId), {
    exerciseName: workout.exerciseName,
    reps: Number(workout.reps) || 0,
    weight: Number(workout.weight) || 0,
    timestamp: Timestamp.fromDate(workout.timestamp || new Date())
  });
}

export async function deleteWorkoutSet(userId, workoutId) {
  await firestoreReady;
  return deleteDoc(doc(db, "users", userId, "workouts", workoutId));
}

export async function subscribeWorkouts(userId, onNext, onError) {
  await firestoreReady;
  return onSnapshot(workoutsCollection(userId), (snapshot) => {
    onNext(snapshot.docs.map(workoutFromDocument));
  }, onError);
}

export async function getWorkoutsForExercise(userId, exerciseName) {
  await firestoreReady;
  const snapshot = await getDocs(query(
    workoutsCollection(userId),
    where("exerciseName", "==", exerciseName)
  ));
  return snapshot.docs.map(workoutFromDocument);
}

function workoutsCollection(userId) {
  return collection(db, "users", userId, "workouts");
}

function workoutFromDocument(documentSnapshot) {
  const data = documentSnapshot.data();
  return {
    id: documentSnapshot.id,
    exerciseName: data.exerciseName || "",
    reps: Number(data.reps) || 0,
    weight: Number(data.weight) || 0,
    timestamp: timestampToDate(data.timestamp)
  };
}

function timestampToDate(timestamp) {
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }

  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
