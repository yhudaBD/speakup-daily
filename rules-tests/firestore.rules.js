// firestore.rules against the Firestore emulator (MIGRATION_PLAN.md §7,
// ACTION_PLAN.md 7ה). Runs in CI (the "rules" job) and with
// `npm run test:rules`, which needs Java for the emulator. Not part of
// `npm test`.
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-speakup-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid) => env.authenticatedContext(uid).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

// Every document the app keeps for an account: the old one and schema 3's.
const PATHS = [
  ["users", "alice"],
  ["users", "alice", "profile", "main"],
  ["users", "alice", "months", "2026-09"],
  ["users", "alice", "chats", "c1"],
  ["users", "alice", "srs", "s1"],
];

describe("firestore.rules", () => {
  for (const path of PATHS) {
    const name = path.join("/");

    it(`the owner reads, writes and deletes ${name}`, async () => {
      const db = as("alice");
      await assertSucceeds(setDoc(doc(db, ...path), { x: 1 }));
      await assertSucceeds(getDoc(doc(db, ...path)));
      await assertSucceeds(deleteDoc(doc(db, ...path)));
    });

    it(`another account can't read or write ${name}`, async () => {
      await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), ...path), { x: 1 }));
      const db = as("bob");
      await assertFails(getDoc(doc(db, ...path)));
      await assertFails(setDoc(doc(db, ...path), { x: 2 }));
      await assertFails(deleteDoc(doc(db, ...path)));
    });

    it(`a visitor who isn't signed in can't read or write ${name}`, async () => {
      const db = anonymous();
      await assertFails(getDoc(doc(db, ...path)));
      await assertFails(setDoc(doc(db, ...path), { x: 2 }));
    });
  }

  it("nothing outside users/{uid} is open", async () => {
    await assertFails(setDoc(doc(as("alice"), "analytics", "e1"), { x: 1 }));
    await assertFails(getDoc(doc(as("alice"), "other", "x")));
  });
});
