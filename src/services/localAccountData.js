// Everything personal this device holds for an account, removed on "delete
// account" (AppContext.deleteAccountData): the saved app data and the
// account's "day 1" recordings (T5). A recording that can't be deleted is
// logged, not thrown: the cloud copy and the Auth record are already gone
// by then, and the reload must still happen.
import { clearBaseline } from "../cloud/localBaseline";
import { STORAGE_KEY } from "../context/appState";
import { deleteBaselineRecordings } from "./baselineRecordings";

export async function clearLocalAccountData(uid) {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: nothing we can clear anyway.
  }
  clearBaseline(uid); // what the cloud held (schema 3), kept between opens
  try {
    await deleteBaselineRecordings(uid);
  } catch (err) {
    console.warn("Could not delete the day-1 recordings:", err);
  }
}
