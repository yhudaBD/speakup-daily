import { useState } from "react";
import { auth, signInWithGoogle } from "../services/firebase";
import { useApp } from "../context/AppContext";

const LOGO = (
  <svg viewBox="0 0 512 512" fill="none" style={{ width: 88, height: 88 }}>
    <path d="M148 148h216c22 0 40 18 40 40v108c0 22-18 40-40 40H228l-52 44c-8 7-20 1-20-10v-34h-8c-22 0-40-18-40-40V188c0-22 18-40 40-40z" fill="#ffffff" fillOpacity="0.95"/>
    <rect x="220" y="196" width="72" height="108" rx="36" fill="#6C63FF"/>
    <path d="M196 292c0 44 36 72 60 72s60-28 60-72" stroke="#6C63FF" strokeWidth="16" strokeLinecap="round"/>
    <line x1="256" y1="364" x2="256" y2="396" stroke="#6C63FF" strokeWidth="16" strokeLinecap="round"/>
    <line x1="216" y1="396" x2="296" y2="396" stroke="#6C63FF" strokeWidth="16" strokeLinecap="round"/>
    <path d="M132 248c-12 16-12 40 0 56" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" opacity="0.85"/>
    <path d="M96 224c-24 32-24 80 0 112" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" opacity="0.55"/>
    <path d="M380 248c12 16 12 40 0 56" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" opacity="0.85"/>
    <path d="M416 224c24 32 24 80 0 112" stroke="#ffffff" strokeWidth="14" strokeLinecap="round" opacity="0.55"/>
  </svg>
);

function GateScreen({ children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 20, padding: "32px 24px", textAlign: "center",
      background: "linear-gradient(135deg, #6C63FF 0%, #9C8FFF 100%)",
    }}>
      {children}
    </div>
  );
}

export default function AuthGate({ children }) {
  const { dispatch, authReady } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async () => {
    setError("");
    setBusy(true);
    try {
      const profile = await signInWithGoogle();
      dispatch({
        type: "SET_USER",
        payload: { name: profile.displayName, email: profile.email, photoURL: profile.photoURL },
      });
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setError("ההתחברות עם Google נכשלה. נסה שוב.");
    } finally {
      setBusy(false);
    }
  };

  if (!auth) {
    return (
      <GateScreen>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h2 style={{ color: "#fff", margin: 0 }}>שגיאת הגדרה</h2>
        <p style={{ color: "rgba(255,255,255,0.85)", maxWidth: 320 }}>
          ההתחברות אינה זמינה כרגע. נסה שוב מאוחר יותר.
        </p>
      </GateScreen>
    );
  }

  if (authReady === "checking" || authReady === "syncing") {
    return (
      <GateScreen>
        {LOGO}
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>SpeakUp Daily</div>
      </GateScreen>
    );
  }

  if (authReady === "signed-out") {
    return (
      <GateScreen>
        {LOGO}
        <h1 style={{ color: "#fff", fontSize: 24, margin: 0 }}>ברוכים הבאים ל-SpeakUp Daily</h1>
        <p style={{ color: "rgba(255,255,255,0.85)", maxWidth: 320, margin: 0 }}>
          התחברו כדי להתחיל לתרגל ולשמור את ההתקדמות שלכם לתמיד
        </p>
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="btn btn-lg"
          style={{
            background: "#fff", color: "#6C63FF", fontWeight: 700,
            marginTop: 8, opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "מתחבר..." : "התחבר עם Google"}
        </button>
        {error && <p style={{ color: "#fff", background: "rgba(0,0,0,0.2)", padding: "8px 14px", borderRadius: 10, fontSize: 13 }}>{error}</p>}
      </GateScreen>
    );
  }

  return children;
}
