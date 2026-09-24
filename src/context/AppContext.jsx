import { createContext, useContext, useReducer, useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { STORAGE_KEY, SCHEMA_VERSION, ensureUser, pruneOldSessions, computeLifetimeStats, defaultLifetimeStats, initialState, reducer, snapshotForSync } from "./appState";
import { getTodayString } from "../utils/dateHelpers";
import { auth, loadCloudProfile, saveCloudProfile } from "../services/firebase";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // undefined = still checking Firebase; null = confirmed signed out.
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [synced, setSynced] = useState(false);
  // mergedForUidRef: the merge below has *started* for this uid (guards
  // re-firing). cloudReadyUidRef: it has *finished*, so writing local state
  // to Firestore is now safe. Kept separate because marking "ready" at the
  // start let the persist effect push the device's pre-merge (possibly empty)
  // state over the account's cloud copy before it had even been read.
  const mergedForUidRef = useRef(null);
  const cloudReadyUidRef = useRef(null);

  // Track the signed-in Firebase account, if any. AuthGate reads authReady
  // (below) from context instead of subscribing to this itself, so there is
  // exactly one source of truth for "is it safe to render the real app yet".
  // Also the one place that copies the Google profile (name/photo/email)
  // into local state — fires for every path into a signed-in state (popup,
  // redirect-then-reload, or an already-persisted session), so it doesn't
  // matter which one actually signed the person in.
  useEffect(() => {
    if (!auth) {
      setFirebaseUser(null);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        dispatch({
          type: "SET_GOOGLE_PROFILE",
          payload: { name: user.displayName, email: user.email, photoURL: user.photoURL },
        });
      }
    });
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const today = getTodayString();
        const isPreVersioned = !parsed.schemaVersion || parsed.schemaVersion < SCHEMA_VERSION;
        const prunedSessions = pruneOldSessions(parsed.sessions);
        // Backfill lifetimeStats once for existing users from their full history
        // (computed before pruning, so nothing already earned is lost).
        const lifetimeStats = isPreVersioned
          ? computeLifetimeStats(parsed.sessions, parsed.rolePlay?.chats)
          : parsed.lifetimeStats || defaultLifetimeStats;
        const todayProgress = prunedSessions?.[today]?.sentences || [];
        dispatch({
          type: "LOAD_DATA",
          payload: {
            ...parsed,
            sessions: prunedSessions,
            todayProgress,
            lifetimeStats,
            user: parsed.user || ensureUser(null),
            rolePlay: parsed.rolePlay || { chats: [], customTopics: [] },
            practice: parsed.practice || { wordBank: [], customTopics: [] },
            placement: parsed.placement || null,
          },
        });
      } else {
        dispatch({ type: "LOAD_DATA", payload: {} });
      }
    } catch (e) {
      console.error("Failed to load saved data", e);
      dispatch({ type: "LOAD_DATA", payload: {} });
    }
  }, []);

  // Once signed in (and local data has finished loading), pull this
  // account's cloud copy and merge it in — or seed the cloud with what's
  // already on this device if this account has never synced before. Runs
  // once per uid (mergedForUidRef guards re-firing on unrelated re-renders).
  // AuthGate waits for `synced` before showing the real app, specifically so
  // Home's "first-ever launch" check never runs against pre-merge, still-empty
  // local state and wrongly sends a returning user (on a new device) to the
  // placement flow as if they were brand new.
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid || !state.isLoaded || mergedForUidRef.current === uid) return;
    mergedForUidRef.current = uid;
    setSynced(false);
    (async () => {
      try {
        const cloud = await loadCloudProfile(uid);
        if (cloud) {
          dispatch({ type: "MERGE_CLOUD_DATA", payload: cloud });
        } else {
          await saveCloudProfile(uid, snapshotForSync(state));
        }
        // Set before the MERGE_CLOUD_DATA re-render commits, so that render's
        // persist effect writes the merged result back to the cloud.
        cloudReadyUidRef.current = uid;
      } catch (e) {
        // Leave cloud writes off: we never saw the cloud copy, so pushing
        // this device's state could overwrite history we don't have.
        console.error("Cloud sync failed", e);
      } finally {
        setSynced(true);
      }
    })();
  }, [firebaseUser, state.isLoaded]);

  // Persist to localStorage whenever state changes, and — once the
  // one-time merge/seed above has run for this account — mirror the same
  // snapshot to Firestore so it follows the account across devices.
  useEffect(() => {
    // Before LOAD_DATA this is initialState — saving it would blank out the
    // stored history if the page died before the load re-render.
    if (!state.isLoaded) return;
    const toSave = snapshotForSync(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error("Failed to save data", e);
    }
    const uid = firebaseUser?.uid;
    if (uid && cloudReadyUidRef.current === uid) {
      saveCloudProfile(uid, toSave).catch((e) => console.error("Cloud save failed", e));
    }
  }, [firebaseUser, state.isLoaded, state.user, state.settings, state.streak, state.sessions, state.rolePlay, state.practice, state.lifetimeStats, state.placement]);

  const authReady = firebaseUser === undefined ? "checking"
    : firebaseUser === null ? "signed-out"
    : synced ? "ready" : "syncing";

  return (
    <AppContext.Provider value={{ state, dispatch, firebaseUser, authReady }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
