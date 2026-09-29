import { describe, expect, it } from "vitest";
import { deleteUserEvents, eventKey } from "../../netlify/functions/_shared/eventKeys.js";

// CRITICAL_REVIEW.md §41ב: events are keyed by uid, so "delete account" can
// find and delete a user's events without reading everyone's.
function fakeStore(entries) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    async list({ prefix = "" } = {}) {
      return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
    async get(key) { return data.get(key) ?? null; },
    async delete(key) { data.delete(key); },
  };
}

describe("eventKey", () => {
  it("starts with the uid", () => {
    expect(eventKey("uid-a", 1789683765903, "ab12cd34")).toBe("uid-a/1789683765903_ab12cd34");
  });
});

describe("deleteUserEvents", () => {
  it("deletes the user's events under their uid and the older ones by their uid field", async () => {
    const store = fakeStore({
      "uid-a/1_x": { uid: "uid-a" },
      "uid-a/2_y": { uid: "uid-a" },
      "uid-b/1_z": { uid: "uid-b" },
      "1700000000000_old1": { uid: "uid-a" },
      "1700000000001_old2": { uid: "uid-b" },
    });
    expect(await deleteUserEvents(store, "uid-a")).toBe(3);
    expect([...store.data.keys()].sort()).toEqual(["1700000000001_old2", "uid-b/1_z"]);
  });

  it("leaves other users alone when the uid is a prefix of another", async () => {
    const store = fakeStore({ "uid-a/1_x": {}, "uid-ab/1_y": { uid: "uid-ab" } });
    await deleteUserEvents(store, "uid-a");
    expect([...store.data.keys()]).toEqual(["uid-ab/1_y"]);
  });
});
