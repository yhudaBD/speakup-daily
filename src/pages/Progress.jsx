import { useState } from "react";
import { useApp } from "../context/AppContext";
import { getTodayString, getLastNDays, formatDate } from "../utils/dateHelpers";
import { getWeakSentenceStats } from "../utils/practiceHistory";

const ACHIEVEMENTS = [
  { id: "on-fire", icon: "🔥", title: "On Fire", desc: "7 days in a row", check: (state) => state.streak.current >= 7 },
  { id: "perfect-day", icon: "⭐", title: "Perfect Day", desc: "100% on all sentences", check: (state) => {
    const today = getTodayString();
    const s = state.sessions[today];
    return s && s.sentences.every(x => x.score === 100);
  }},
  { id: "sharp-tongue", icon: "🎯", title: "Sharp Tongue", desc: "10 sentences above 90%", check: (state) => state.lifetimeStats.sentencesAbove90 >= 10 },
  { id: "month-strong", icon: "📅", title: "Month Strong", desc: "30 days in a row", check: (state) => state.streak.longest >= 30 },
  { id: "getting-started", icon: "🚀", title: "First Step", desc: "Complete your first practice", check: (state) => state.lifetimeStats.daysActive >= 1 },
  { id: "consistent", icon: "💪", title: "Consistent", desc: "Practice 5 different days", check: (state) => state.lifetimeStats.daysActive >= 5 },
  { id: "century", icon: "💯", title: "Century Club", desc: "100 sentences practiced", check: (state) => state.lifetimeStats.totalSentences >= 100 },
  { id: "chatterbox", icon: "💬", title: "Chatterbox", desc: "10 conversations completed", check: (state) => state.lifetimeStats.totalChats >= 10 },
  { id: "explorer", icon: "🗺️", title: "Category Explorer", desc: "Practiced 5+ different topics", check: (state) => {
    const cats = new Set(
      Object.values(state.sessions).flatMap(s => s.sentences || []).map(x => x.category).filter(Boolean)
    );
    return cats.size >= 5;
  }},
  { id: "wordsmith", icon: "📖", title: "Wordsmith", desc: "50 words saved for review", check: (state) => (state.practice?.wordBank?.length || 0) >= 50 },
  { id: "night-owl", icon: "🦉", title: "Night Owl", desc: "Practiced after 10pm", check: (state) =>
    Object.values(state.sessions).some(s => s.completedAt && new Date(s.completedAt).getHours() >= 22)
  },
];

function computeLevel(state) {
  const xp = state.lifetimeStats.totalSentences * 10
    + state.lifetimeStats.totalChats * 25
    + state.streak.longest * 5;
  const xpPerLevel = 200;
  const level = Math.floor(xp / xpPerLevel) + 1;
  const xpIntoLevel = xp % xpPerLevel;
  return { xp, level, xpIntoLevel, xpPerLevel };
}

function TabButton({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 8px",
        border: "none",
        background: active ? "var(--color-primary)" : "transparent",
        color: active ? "#fff" : "var(--color-text-muted)",
        borderRadius: "var(--radius-sm)",
        fontWeight: 700,
        cursor: "pointer",
        fontSize: 13,
        transition: "all 0.2s",
        fontFamily: "var(--font-body)",
      }}
    >
      {label}
    </button>
  );
}

export default function Progress() {
  const { state } = useApp();
  const [tab, setTab] = useState("weekly");
  const { sessions, streak } = state;

  const allSentences = Object.values(sessions).flatMap(s => s.sentences || []);
  const allChats = Object.values(sessions).flatMap(s => s.chats || []);
  const totalAvg = allSentences.length
    ? Math.round(allSentences.reduce((s, x) => s + x.score, 0) / allSentences.length)
    : 0;

  const weakSentences = getWeakSentenceStats(sessions);
  const { level, xpIntoLevel, xpPerLevel } = computeLevel(state);

  const days = getLastNDays(7);

  return (
    <div className="page-enter" style={{ padding: "20px 0 8px" }}>
      <div className="container">
        <h2 style={{ marginBottom: 16 }}>📈 Your Progress</h2>

        {/* Tabs */}
        <div style={{
          display: "flex",
          background: "var(--color-surface-2)",
          borderRadius: "var(--radius-md)",
          padding: 4,
          marginBottom: 20,
          gap: 4
        }}>
          <TabButton label="📆 Weekly" active={tab === "weekly"} onClick={() => setTab("weekly")} />
          <TabButton label="🏆 All Time" active={tab === "alltime"} onClick={() => setTab("alltime")} />
          <TabButton label="🔁 Review" active={tab === "review"} onClick={() => setTab("review")} />
        </div>

        {/* WEEKLY TAB */}
        {tab === "weekly" && (
          <div>
            <div style={{ display: "grid", gap: 12 }}>
              {days.map(day => {
                const session = sessions[day];
                const isToday = day === getTodayString();
                return (
                  <div key={day} className="card" style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderLeft: isToday ? "4px solid var(--color-primary)" : "4px solid transparent"
                  }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>
                        {formatDate(day)} {isToday && <span style={{ color: "var(--color-primary)", fontSize: 12 }}>· Today</span>}
                      </p>
                      {session ? (
                        <p className="text-muted">
                          {session.sentences?.length || 0} sentences
                          {(session.chats?.length || 0) > 0 && ` · ${session.chats.length} chat${session.chats.length > 1 ? 's' : ''}`}
                        </p>
                      ) : (
                        <p className="text-muted">No practice</p>
                      )}
                    </div>
                    {session ? (
                      <div style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: 900,
                        fontSize: "1.4rem",
                        color: session.averageScore >= 70 ? "var(--color-success)" : "var(--color-warning)"
                      }}>
                        {session.averageScore}%
                      </div>
                    ) : (
                      <span style={{ fontSize: 20 }}>—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ALL TIME TAB */}
        {tab === "alltime" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="card" style={{ background: "var(--color-primary-light)" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 style={{ fontSize: 15, color: "var(--color-primary)" }}>⭐ Level {level}</h3>
                <span className="text-muted" style={{ fontSize: 12 }}>{xpIntoLevel} / {xpPerLevel} XP</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${(xpIntoLevel / xpPerLevel) * 100}%` }} />
              </div>
            </div>

            <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--color-primary)" }}>
                  {allSentences.length}
                </div>
                <div className="text-muted">Sentences Practiced</div>
              </div>
              <div className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", fontFamily: "var(--font-display)", fontWeight: 900, color: "#6C63FF" }}>
                  {allChats.length}
                </div>
                <div className="text-muted">Chats Completed 💬</div>
              </div>
              <div className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--color-success)" }}>
                  {totalAvg}%
                </div>
                <div className="text-muted">Overall Average</div>
              </div>
              <div className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--color-error)" }}>
                  🔥 {streak.current}
                </div>
                <div className="text-muted">Current Streak</div>
              </div>
              <div className="card" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "2.2rem", fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--color-warning)" }}>
                  🏆 {streak.longest}
                </div>
                <div className="text-muted">Best Streak</div>
              </div>
            </div>

            <h3 style={{ marginTop: 8 }}>🏅 Achievements</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {ACHIEVEMENTS.map(a => {
                const earned = a.check(state);
                return (
                  <div key={a.id} className="achievement" style={{
                    opacity: earned ? 1 : 0.45,
                    filter: earned ? "none" : "grayscale(1)"
                  }}>
                    <span className="achievement-icon">{a.icon}</span>
                    <div className="achievement-info">
                      <h4>{a.title} {earned && "✅"}</h4>
                      <p>{a.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* REVIEW TAB */}
        {tab === "review" && (
          <div>
            {Object.keys(weakSentences).length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <h3>All clear!</h3>
                <p className="text-muted">No sentences scored below 70% yet. Keep practicing!</p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {Object.values(weakSentences)
                  .sort((a, b) => a.bestScore - b.bestScore)
                  .map(s => (
                    <div key={s.sentenceId} className="card" style={{
                      borderLeft: "4px solid var(--color-error)"
                    }}>
                      <p style={{ fontWeight: 700, marginBottom: 4 }}>{s.text}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Practiced {s.count}x</span>
                        <span style={{
                          fontWeight: 800,
                          color: s.bestScore >= 70 ? "var(--color-warning)" : "var(--color-error)"
                        }}>
                          Best: {s.bestScore}%
                        </span>
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
