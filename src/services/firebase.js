import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

// Firebase's web config identifies which project to talk to — it is not a
// secret (unlike GROQ_API_KEY, see PROJECT_OVERVIEW.md §2) and is safe to
// ship in the client bundle, so a normal VITE_-prefixed env var is fine here.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// getAuth() throws synchronously on an invalid/missing API key, which would
// otherwise crash every page that imports this module before the user has
// created a Firebase project and filled in .env.local. Guard it so the rest
// of the app (which works fine without accounts, per PROJECT_OVERVIEW.md §8)
// keeps working, and only the Google sign-in button itself is unavailable.
let app = null;
export let auth = null;
try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
} catch (err) {
  console.warn("Firebase not configured — Google sign-in is disabled:", err);
}

const googleProvider = new GoogleAuthProvider();

// Identify-only sign-in: no Firestore, no server-side session. The caller
// is responsible for merging the returned profile into the existing local
// (localStorage) user record — see Settings.jsx.
export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured (missing VITE_FIREBASE_* env vars)");
  const result = await signInWithPopup(auth, googleProvider);
  const { displayName, email, photoURL } = result.user;
  return { displayName, email, photoURL };
}

export function signOutOfGoogle() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}
