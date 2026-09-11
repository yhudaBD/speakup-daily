import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { getGreeting, getTodayString, getLastNDays } from "../utils/dateHelpers";
import { getWeakSentenceStats } from "../utils/practiceHistory";

function WeeklyChart({ sessions }) {
  const days = getLastNDays(7);
  const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>📊 This Week</h3>
      <div className="chart-container">
        {days.map((day) => {
          const session = sessions[day];
          const score = session?.averageScore || 0;
          const isToday = day === getTodayString();
          const date = new Date(day);
          const label = dayLabels[date.getDay()];
          const heightPct = score > 0 ? `${score}%` : "4px";
          return (
            <div key={day} className="chart-bar-wrap">
              <div
                className={`chart-bar${isToday ? " today" : ""}${score === 0 ? " empty" : ""}`}
                style={{ height: heightPct }}
                title={score > 0 ? `${score}%` : "No practice"}
              />
              <span className="chart-label">{label}</span>
              {score > 0 && <span className="chart-score">{score}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const { state } = useApp();
  const navigate = useNavigate();
  const { settings, streak, sessions, todayProgress, user, practice } = state;
  const wordBankCount = practice?.wordBank?.length || 0;
  const today = getTodayString();
  const todaySession = sessions[today];
  const completed = todayProgress.length;
  const goal = settings.dailyGoal;
  const pct = Math.min(100, Math.round((completed / goal) * 100));
  const todayChats = todaySession?.chats?.length || 0;
  const greeting = useMemo(() => getGreeting(user?.name || ""), [user]);
  const weakCount = useMemo(() => Object.keys(getWeakSentenceStats(sessions)).length, [sessions]);

  const difficultyLabel = { easy: "🟢 Easy", medium: "🟡 Medium", advanced: "🔴 Advanced" };

  return (
    <div className="page-enter" style={{ padding: "20px 0 8px" }}>
      <div className="container">

        {/* Hero Card */}
        <div className="hero-gradient mb-4">
          <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 4 }}>
            {difficultyLabel[settings.difficulty]}
          </p>
          <h1 style={{ color: "#fff", marginBottom: 8 }}>{greeting}</h1>
          <div className="streak-badge" style={{ display: "inline-flex" }}>
            🔥 {streak.current} day streak
          </div>
        </div>

        {/* Today's Mission */}
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3>🎯 Today's Mission</h3>
            <span style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: "1.1rem",
              color: pct >= 100 ? "var(--color-success)" : "var(--color-primary)"
            }}>
              {completed} / {goal}
            </span>
          </div>
          <div className="progress-bar-track mb-3">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {pct >= 100 ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
              <p style={{ fontWeight: 700, color: "var(--color-success)", marginBottom: 12 }}>
                Daily goal complete! Average: {todaySession?.averageScore || 0}%
              </p>
              <button className="btn btn-ghost btn-block" onClick={() => navigate("/practice")}>
                Practice More
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary btn-block btn-lg"
              onClick={() => navigate("/practice")}
              id="start-practice-btn"
            >
              🎙️ Start Practice
            </button>
          )}
        </div>

        {weakCount > 0 && (
          <div
            className="card mb-4"
            onClick={() => navigate("/practice", { state: { autoCategory: "weak" } })}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ fontSize: 28 }}>🎯</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>תרגל את הנקודות החלשות שלך</div>
              <div className="text-muted" style={{ fontSize: 13 }}>{weakCount} משפטים שכדאי לחזור עליהם</div>
            </div>
            <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span>
          </div>
        )}

        {wordBankCount > 0 && (
          <div
            className="card mb-4"
            onClick={() => navigate("/practice")}
            style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
          >
            <span style={{ fontSize: 28 }}>📚</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>מילים שמורות לחזרה</div>
              <div className="text-muted" style={{ fontSize: 13 }}>{wordBankCount} מילים מחכות לתרגול</div>
            </div>
            <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>→</span>
          </div>
        )}

        {/* Try a Conversation */}
        <div
          className="chat-cta-card"
          onClick={() => navigate('/roleplay')}
          style={{
            background: 'linear-gradient(135deg, #6C63FF 0%, #9C8FFF 100%)',
            borderRadius: 16, padding: '20px 24px', cursor: 'pointer',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: '0 4px 16px rgba(108,99,255,0.25)'
          }}
        >
          <span style={{ fontSize: 36 }}>💬</span>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 17, marginBottom: 4 }}>
              Try a Conversation!
            </div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>
              {todayChats > 0 ? `${todayChats} chat${todayChats > 1 ? 's' : ''} today` : 'Chat with AI in real English'}
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: '#fff', fontSize: 20 }}>→</span>
        </div>

        {/* Weekly Chart */}
        <div className="card mb-4">
          <WeeklyChart sessions={sessions} />
        </div>

        {/* Stats Row */}
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--color-primary)" }}>
              {streak.longest}
            </div>
            <div className="text-muted">Best Streak 🏆</div>
          </div>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--color-success)" }}>
              {Object.keys(sessions).length}
            </div>
            <div className="text-muted">Days Active 📅</div>
          </div>
        </div>

        {/* Quick tip */}
        <div className="card" style={{ background: "var(--color-primary-light)", border: "1.5px solid rgba(108,99,255,0.25)" }}>
          <p style={{ fontSize: 14, color: "var(--color-primary)", fontWeight: 600 }}>
            💡 <strong>Tip:</strong> Listen to the sentence first, then try to match the rhythm and intonation — not just the words!
          </p>
        </div>

      </div>
    </div>
  );
}
