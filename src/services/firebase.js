import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, deleteUser } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

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
const REDIRECT_PENDING_KEY = "speakup_google_redirect_pending";

export function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured (missing VITE_FIREBASE_* env vars)");
  try {
    sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
  } catch {
    // Private mode / storage blocked: we lose the "came back empty" detection
    // below, but sign-in itself is unaffected, so don't fail the attempt.
  }
  return signInWithRedirect(auth, googleProvider);
}

// Call once on load to find out how the redirect round trip went. Returns
// { kind: "error" } when Firebase reported one, { kind: "empty" } when we came
// back from Google with neither a user nor an error, or null when there is
// nothing to report. That middle case is the one worth naming: it is what a
// blocked cross-origin auth iframe looks like, and treating it the same as
// "never tried to sign in" is what made this failure invisible.
export async function getGoogleRedirectOutcome() {
  if (!auth) return null;
  let wasPending = false;
  try {
    wasPending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1";
    sessionStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // Same as above — absence of the flag just means we can't tell "empty"
    // apart from a normal cold load.
  }
  try {
    const credential = await getRedirectResult(auth);
    if (credential) return null;
    return wasPending ? { kind: "empty" } : null;
  } catch (err) {
    return { kind: "error", error: err };
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

export function deleteCloudProfile(uid) {
  if (!db) return Promise.resolve();
  return deleteDoc(doc(db, "users", uid));
}

// Removes the Firebase Auth record too, which also signs the user out.
// Firebase refuses that when the sign-in is old (auth/requires-recent-login),
// and re-authenticating would mean another Google redirect. The data itself
// is already gone by the time this runs, so a plain sign-out is enough then.
export async function deleteAuthAccountOrSignOut() {
  if (!auth?.currentUser) return;
  try {
    await deleteUser(auth.currentUser);
  } catch (err) {
    if (err?.code !== "auth/requires-recent-login") console.error("Deleting the auth account failed", err);
    await signOut(auth);
  }
}
