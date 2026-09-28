import { useEffect, useState } from "react";
import { cloudSync } from "../../services/cloudSync";

// Shown while the latest changes are saved only on this device: the cloud
// write failed, or hasn't landed after 15 seconds (CRITICAL_REVIEW.md §1א).
// Doesn't block anything, and goes away once a write reaches the cloud.
// `tracker` is only overridden by tests.
export default function CloudSyncBanner({ tracker = cloudSync }) {
  const [localOnly, setLocalOnly] = useState(tracker.isLocalOnly);

  useEffect(() => tracker.subscribe(setLocalOnly), [tracker]);

  if (!localOnly) return null;

  return (
    <div
      role="status"
      style={{
        background: "var(--color-surface)",
        color: "var(--color-text)",
        border: "1.5px solid var(--color-warning)",
        fontSize: 13,
        fontWeight: 700,
        padding: "8px 16px",
        borderRadius: 16,
        boxShadow: "var(--shadow-md)",
        maxWidth: "calc(100vw - 32px)",
        textAlign: "center",
      }}
    >
      ☁️ השינויים נשמרים כרגע רק במכשיר הזה
    </div>
  );
}
