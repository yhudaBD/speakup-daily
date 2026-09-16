import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

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
export let db = null;
try {
  if (firebaseConfig.apiKey) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (err) {
  console.warn("Firebase not configured — Google sign-in is disabled:", err);
}

const googleProvider = new GoogleAuthProvider();

// Sign-in is now mandatory (AuthGate) and each account's history is mirrored
// to Firestore (see loadCloudProfile/saveCloudProfile) so it follows the
// person across devices/browsers instead of staying stuck in one browser's
// localStorage. Uses a full-page redirect rather than a popup: popups are
// unreliable on mobile (Safari's cross-site tracking protections in
// particular can block the popup from ever reporting its result back to the
// opener tab), which is what a friend hit testing on a phone. AppContext's
// own onAuthStateChanged listener picks up the signed-in user once Google
// redirects back — see getGoogleRedirectError below for surfacing failures.
export function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured (missing VITE_FIREBASE_* env vars)");
  return signInWithRedirect(auth, googleProvider);
}

// Call once on load to surface a redirect sign-in that failed (e.g. the
// account picker was dismissed) — onAuthStateChanged alone stays silent
// about *why* no user came back, just that none did.
export async function getGoogleRedirectError() {
  if (!auth) return null;
  try {
    await getRedirectResult(auth);
    return null;
  } catch (err) {
    return err;
  }
}

export function signOutOfGoogle() {
  if (!auth) return Promise.resolve();
  return signOut(auth);
}

// One document per account at users/{uid}, mirroring the exact shape already
// persisted to localStorage (see AppContext.jsx) — no separate schema.
export async function loadCloudProfile(uid) {
  if (!db) return null;
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export function saveCloudProfile(uid, data) {
  if (!db) return Promise.resolve();
  return setDoc(doc(db, "users", uid), data, { merge: true });
}
