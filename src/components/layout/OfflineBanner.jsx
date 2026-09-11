import { useEffect, useState } from "react";

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" && !navigator.onLine
  );

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "calc(var(--safe-top) + 8px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 300,
        background: "var(--color-warning)",
        color: "#1E1B4B",
        fontSize: 13,
        fontWeight: 700,
        padding: "8px 16px",
        borderRadius: 99,
        boxShadow: "var(--shadow-md)",
        whiteSpace: "nowrap",
        maxWidth: "calc(100vw - 32px)",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      📡 אין חיבור לאינטרנט — אפשר להמשיך לתרגל, אבל שיחות AI וניתוח לא יעבדו
    </div>
  );
}
