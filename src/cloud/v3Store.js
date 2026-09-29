// Firestore reads and writes for the schema 3 structure (MIGRATION_PLAN.md
// §3-§5). The decisions are in pure modules: which documents (schemaV3.js)
// and what to write (diffV3.js). This file only talks to Firestore.
import {
  FieldPath, collection, deleteField, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where, writeBatch,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { nestFields } from "./diffV3";

// Firestore allows 500 writes in a batch.
export const BATCH_SIZE = 450;
// Chats loaded on a new device; older ones load with the history.
export const RECENT_CHATS = 20;

const ref = (uid, path) => doc(db, "users", uid, ...path.split("/"));

// Writes diffV3 operations, in as many batches as needed. A batch is all or
// nothing; if one fails the caller keeps its baseline and retries the lot.
export async function writeOps(uid, ops) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + BATCH_SIZE)) {
      const target = ref(uid, op.doc);
      if (op.delete) {
        batch.delete(target);
      } else if (op.set) {
        batch.set(target, op.set);
      } else {
        const { data, paths } = nestFields(op, { deleteValue: deleteField() });
        batch.set(target, data, { mergeFields: paths.map((p) => new FieldPath(...p)) });
      }
    }
    await batch.commit();
  }
}

const byId = (snapshot) => Object.fromEntries(snapshot.docs.map((d) => [d.id, d.data()]));

// The schema 3 documents, or null when this account hasn't moved yet.
// With `since` (an ISO time), only months and chats changed after it: on a
// device that already has the rest, that's usually one or two reads.
export async function loadV3(uid, { since } = {}) {
  const profile = await getDoc(ref(uid, "profile/main"));
  if (!profile.exists()) return null;
  const months = collection(db, "users", uid, "months");
  const chats = collection(db, "users", uid, "chats");
  const [monthDocs, chatDocs] = await Promise.all([
    getDocs(since ? query(months, where("updatedAt", ">", since)) : months),
    getDocs(since
      ? query(chats, where("updatedAt", ">", since))
      : query(chats, orderBy("updatedAt", "desc"), limit(RECENT_CHATS))),
  ]);
  return { profile: profile.data(), months: byId(monthDocs), chats: byId(chatDocs) };
}

// One document as the other device changes it (realtime.js). This device's
// own writes are skipped while they're on their way (hasPendingWrites): the
// state already has them. A failed listen is left alone; the next open loads
// everything anyway.
export function listenDoc(uid, path, onData) {
  return onSnapshot(ref(uid, path), (snapshot) => {
    if (snapshot.metadata.hasPendingWrites || !snapshot.exists()) return;
    onData(snapshot.data());
  }, (e) => console.error("Cloud listen failed", path, e));
}

// Every document of the account, schema 3 and the old one (MIGRATION_PLAN.md
// §7). Firestore doesn't delete subcollections with their parent document,
// so each is listed and deleted.
export const SUBCOLLECTIONS = ["months", "chats", "srs", "profile"];

export async function deleteAllCloudData(uid) {
  if (!db) return 0; // Firebase isn't configured: nothing in the cloud
  const refs = [];
  for (const name of SUBCOLLECTIONS) {
    const snapshot = await getDocs(collection(db, "users", uid, name));
    refs.push(...snapshot.docs.map((d) => d.ref));
  }
  refs.push(doc(db, "users", uid));
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_SIZE).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  return refs.length;
}
