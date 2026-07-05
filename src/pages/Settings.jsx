import { useState } from "react";
import { useApp } from "../context/AppContext";

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
  const { settings, user } = state;
  const [name, setName] = useState(user?.name || "");
  const [saved, setSaved] = useState(false);

  const update = (key, value) => {
    dispatch({ type: "UPDATE_SETTINGS", payload: { [key]: value } });
  };

  const handleSaveName = () => {
    dispatch({ type: "SET_USER", payload: { ...(user || {}), name } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
