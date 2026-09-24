import { useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// How often an open app asks the server whether a new build exists. The
// browser only checks sw.js on navigation, and an installed PWA left open on a
// phone may go days without one — so without this the banner would never show.
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

// updateServiceWorker(true) reloads once the new worker takes control. If that
// "controlling" event never arrives (seen on some mobile browsers), reload
// anyway so the tap is never a dead end.
const RELOAD_FALLBACK_MS = 3000;

function watchForUpdates(registration) {
  const check = () => {
    // Skip while offline or mid-install: update() would just reject or race.
    if (!navigator.onLine || registration.installing) return;
    registration.update().catch(() => {});
  };
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  // Reopening the app from the background is the moment a phone user expects
  // to see fresh content, so check right then too.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
}

// registerType is 'prompt' (see vite.config.js) so a new build sits waiting
// instead of silently taking over an open tab — this banner is the only way
// the user finds out it's there and the only thing that activates it.
export default function UpdateBanner() {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) watchForUpdates(registration);
    },
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });

  if (!needRefresh) return null;

  const applyUpdate = () => {
    setUpdating(true);
    updateServiceWorker(true);
    setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
  };

  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--color-text)",
        color: "var(--color-bg)",
        fontSize: 13,
        fontWeight: 700,
        padding: "8px 8px 8px 16px",
        borderRadius: 99,
        boxShadow: "var(--shadow-lg)",
        maxWidth: "calc(100vw - 32px)",
        direction: "rtl",
        pointerEvents: "auto",
      }}
    >
      <span>🔄 יש עדכון לאפליקציה</span>
      <button
        type="button"
        onClick={applyUpdate}
        disabled={updating}
        style={{
          background: "var(--color-primary)",
          color: "#fff",
          border: "none",
          borderRadius: 99,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 800,
          cursor: updating ? "default" : "pointer",
          opacity: updating ? 0.8 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {updating ? "מעדכן…" : "עדכן"}
      </button>
      {!updating && (
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="סגור"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-bg)",
            opacity: 0.7,
            cursor: "pointer",
            fontSize: 15,
            padding: "0 4px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
