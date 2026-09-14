import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { useApp } from "../context/AppContext";
import { auth, signInWithGoogle, signOutOfGoogle } from "../services/firebase";

function Toggle({ checked, onChange, id }) {
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  );
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div className="radio-group">
      {options.map(opt => (
        <div
          key={opt.value}
          className={`radio-chip${value === opt.value ? " selected" : ""}`}
          onClick={() => onChange(opt.value)}
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={0}
          onKeyDown={e => e.key === "Enter" && onChange(opt.value)}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}

export default function Settings() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { settings, user, placement } = state;
  const [name, setName] = useState(user?.name || "");
  const [saved, setSaved] = useState(false);
  const [googleUser, setGoogleUser] = useState(null);
  const [googleError, setGoogleError] = useState("");
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, setGoogleUser);
  }, []);

  const update = (key, value) => {
    dispatch({ type: "UPDATE_SETTINGS", payload: { [key]: value } });
  };

  const handleSaveName = () => {
    dispatch({ type: "SET_USER", payload: { ...(user || {}), name } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleGoogleSignIn = async () => {
    setGoogleError("");
    setGoogleBusy(true);
    try {
      const profile = await signInWithGoogle();
      dispatch({
        type: "SET_USER",
        payload: { ...(user || {}), name: profile.displayName || name, email: profile.email, photoURL: profile.photoURL },
      });
      setName(profile.displayName || name);
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setGoogleError("ההתחברות עם Google נכשלה. נסה שוב.");
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await signOutOfGoogle();
  };

  return (
    <div className="page-enter" style={{ padding: "20px 0 8px" }}>
      <div className="container">
        <h2 style={{ marginBottom: 20 }}>⚙️ Settings</h2>

        {/* Account */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: 16 }}>👤 Profile</h3>
          <div className="settings-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>Your Name</label>
            <div className="flex gap-2" style={{ width: "100%" }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  border: "1.5px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 15,
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontFamily: "var(--font-body)",
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={handleSaveName} id="save-name-btn">
                {saved ? "✅ Saved" : "Save"}
              </button>
            </div>
          </div>

          <div className="settings-item" style={{ borderBottom: "none" }}>
            {googleUser ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {googleUser.photoURL && (
                    <img
                      src={googleUser.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: 32, height: 32, borderRadius: "50%" }}
                    />
                  )}
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>מחובר עם Google</p>
                    <p className="text-muted" dir="ltr" style={{ fontSize: 12, textAlign: "right" }}>{googleUser.email}</p>
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={handleGoogleSignOut}>
                  התנתק
                </button>
              </>
            ) : (
              <>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>התחברות עם Google</p>
                  <p className="text-muted" style={{ fontSize: 13 }}>
                    {auth ? "לזיהוי מהיר — הנתונים שלך נשארים במכשיר הזה" : (
                      <>טרם הוגדר Firebase (ראה <span dir="ltr">.env.example</span>)</>
                    )}
                  </p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={handleGoogleSignIn} disabled={googleBusy || !auth}>
                  {googleBusy ? "מתחבר..." : "התחבר"}
                </button>
              </>
            )}
          </div>
          {googleError && (
            <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 4 }}>{googleError}</p>
          )}
        </div>

        {/* Level */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: 16 }}>🧭 Level</h3>
          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>
                {placement ? `רמה נוכחית: ${placement.overall_level}` : "עדיין לא נבדקה רמה"}
              </p>
              <p className="text-muted">
                {placement
                  ? "בדוק מחדש כל חודש-חודשיים כדי לראות את ההתקדמות שלך"
                  : "שיחת היכרות קצרה שמתאימה את התרגול בשבילך"}
              </p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/placement")}>
              {placement ? "בדוק מחדש" : "התחל"}
            </button>
          </div>
        </div>

        {/* Practice Settings */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: 16 }}>🎯 Practice</h3>

          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>Daily Goal</p>
              <p className="text-muted">Sentences per day</p>
            </div>
            <RadioGroup
              value={settings.dailyGoal}
              onChange={v => update("dailyGoal", Number(v))}
              options={[
                { label: "3", value: 3 },
                { label: "5", value: 5 },
                { label: "10", value: 10 },
              ]}
            />
          </div>

          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>Difficulty</p>
              <p className="text-muted">Sentence complexity</p>
            </div>
            <RadioGroup
              value={settings.difficulty}
              onChange={v => update("difficulty", v)}
              options={[
                { label: "🟢 Easy", value: "easy" },
                { label: "🟡 Medium", value: "medium" },
                { label: "🔴 Hard", value: "advanced" },
              ]}
            />
          </div>
        </div>

        {/* Audio Settings */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: 16 }}>🔊 Audio</h3>

          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>Playback Speed</p>
              <p className="text-muted">
                {settings.ttsSpeed <= 0.8 ? "Slow 🐢" : settings.ttsSpeed <= 1.05 ? "Normal 🚶" : "Fast 🏃"}
              </p>
            </div>
            <RadioGroup
              value={settings.ttsSpeed}
              onChange={v => update("ttsSpeed", Number(v))}
              options={[
                { label: "Slow", value: 0.75 },
                { label: "Normal", value: 1.0 },
                { label: "Fast", value: 1.25 },
              ]}
            />
          </div>
        </div>

        {/* Display Settings */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: 16 }}>👁️ Display</h3>

          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>Show Translation</p>
              <p className="text-muted">Hebrew translation below each sentence</p>
            </div>
            <Toggle
              id="show-translation"
              checked={settings.showTranslation}
              onChange={v => update("showTranslation", v)}
            />
          </div>
        </div>

        {/* Chat Settings */}
        <div className="card mb-4">
          <h3 style={{ marginBottom: 16 }}>💬 Chat</h3>

          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>Chat Difficulty</p>
              <p className="text-muted">
                {settings.chatDifficulty === "easy" ? "Full answer suggestions" :
                 settings.chatDifficulty === "medium" ? "Hints & sentence starters" :
                 "No help — respond on your own"}
              </p>
            </div>
            <RadioGroup
              value={settings.chatDifficulty}
              onChange={v => update("chatDifficulty", v)}
              options={[
                { label: "🟢 Easy", value: "easy" },
                { label: "🟡 Medium", value: "medium" },
                { label: "🔴 Hard", value: "hard" },
              ]}
            />
          </div>

          <div className="settings-item">
            <div>
              <p style={{ fontWeight: 600, marginBottom: 2 }}>Show Chat Translation</p>
              <p className="text-muted">Hebrew under AI messages & suggestions</p>
            </div>
            <Toggle
              id="show-chat-translation"
              checked={settings.showChatTranslation}
              onChange={v => update("showChatTranslation", v)}
            />
          </div>
        </div>

        {/* Reset */}
        <div className="card mb-4" style={{ borderColor: "var(--color-error)", borderWidth: 1.5 }}>
          <h3 style={{ marginBottom: 8, color: "var(--color-error)" }}>⚠️ Danger Zone</h3>
          <p className="text-muted mb-3" style={{ fontSize: 14 }}>
            This will erase all your progress, streak, and session history.
          </p>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm("Are you sure? All progress will be lost.")) {
                localStorage.clear();
                window.location.reload();
              }
            }}
          >
            Reset All Data 🗑️
          </button>
        </div>

        {/* Info */}
        <div style={{ textAlign: "center", padding: "8px 0 20px" }}>
          <p className="text-muted" style={{ fontSize: 12 }}>
            SpeakUp Daily — Your daily English pronunciation trainer<br/>
            200+ sentences · Daily streaks · Pronunciation scoring
          </p>
        </div>
      </div>
    </div>
  );
}
