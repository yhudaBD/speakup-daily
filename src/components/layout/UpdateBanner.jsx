import { useRegisterSW } from "virtual:pwa-register/react";

// registerType is 'prompt' (see vite.config.js) so a new build sits waiting
// instead of silently taking over an open tab — this banner is the only way
// the user finds out it's there and the only thing that activates it.
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Service worker registration failed", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        bottom: "calc(var(--nav-height) + var(--safe-bottom) + 16px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--color-text)",
        color: "var(--color-bg)",
        fontSize: 13,
        fontWeight: 700,
        padding: "10px 10px 10px 16px",
        borderRadius: 99,
        boxShadow: "var(--shadow-lg)",
        maxWidth: "calc(100vw - 32px)",
        direction: "rtl",
      }}
    >
      <span>🔄 יש גרסה חדשה</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "var(--color-primary)",
          color: "#fff",
          border: "none",
          borderRadius: 99,
          padding: "6px 14px",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        רענן עכשיו
      </button>
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
    </div>
  );
}
