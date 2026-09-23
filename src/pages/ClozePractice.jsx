import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { getDailySentences, categories, categoryMeta, sentences as allSentences } from "../data/sentences";

// Short/function words make poor blanks (too easy, or ambiguous without
// context) — only pull content words long enough to actually test recall.
const STOPWORDS = new Set([
  "i", "you", "he", "she", "it", "we", "they", "the", "a", "an", "to", "of", "in", "on", "at",
  "is", "are", "was", "were", "am", "be", "been", "being", "and", "but", "or", "for", "with",
  "my", "your", "his", "her", "its", "our", "their", "this", "that", "these", "those", "do",
  "does", "did", "will", "would", "can", "could", "should", "may", "might", "have", "has",
  "had", "not", "so", "if", "as", "by", "from", "into", "up", "out", "just", "me", "him", "us",
  "them", "some", "any", "all",
]);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractContentWords(text) {
  return (text.match(/[A-Za-z']+/g) || []).filter(
    (w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase())
  );
}

let distractorPoolCache = null;
function getDistractorPool() {
  if (distractorPoolCache) return distractorPoolCache;
  const set = new Set();
  for (const s of allSentences) {
    for (const w of extractContentWords(s.text)) set.add(w);
  }
  distractorPoolCache = [...set];
  return distractorPoolCache;
}

function buildClozeItem(sentence) {
  const candidates = extractContentWords(sentence.text);
  if (!candidates.length) return null;
  const answer = candidates[Math.floor(Math.random() * candidates.length)];
  const re = new RegExp(`\\b${escapeRegExp(answer)}\\b`, "i");
  const blanked = sentence.text.replace(re, "_____");
  if (blanked === sentence.text) return null;

  const pool = getDistractorPool().filter(
    (w) => w.toLowerCase() !== answer.toLowerCase() && Math.abs(w.length - answer.length) <= 3
  );
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
  const seen = new Set([answer.toLowerCase()]);
  const distractors = [];
  for (const w of shuffledPool) {
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(w);
    if (distractors.length === 3) break;
  }

  const options = [...distractors, answer].sort(() => Math.random() - 0.5);
  return {
    id: sentence.id,
    blanked,
    fullText: sentence.text,
    translation: sentence.translation,
    category: sentence.category,
    answer,
    options,
  };
}

function CategoryPicker({ onPick, onBack }) {
  const options = [{ id: "all", ...categoryMeta.all }, ...categories.map((c) => ({ id: c, ...categoryMeta[c] }))];
  return (
    <div className="page-enter" style={{ padding: "20px 0" }}>
      <div className="container desktop-center">
        <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>← חזרה</button>
        <h2 style={{ marginBottom: 4 }}>✍️ השלמת משפטים</h2>
        <p className="text-muted mb-4" style={{ fontSize: 14 }}>
          בחר קטגוריה — נחסר מילה ממשפט ואתה בוחר מה חסר
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onPick(opt.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "14px 16px",
                borderRadius: 14,
                border: "1.5px solid #EEF0FF",
                background: "#fff",
                cursor: "pointer",
                textAlign: "right",
                width: "100%",
              }}
            >
              <span style={{ fontSize: 28 }}>{opt.emoji}</span>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text)" }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ClozePractice() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { settings } = state;

  const [screen, setScreen] = useState("setup"); // setup | playing | empty | done
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [results, setResults] = useState([]);

  const startSession = (category) => {
    const raw = getDailySentences({
      difficulty: settings.difficulty,
      count: settings.dailyGoal + 6,
      category,
    });
    const built = raw.map(buildClozeItem).filter(Boolean).slice(0, settings.dailyGoal);
    setItems(built);
    setIdx(0);
    setChosen(null);
    setResults([]);
    setScreen(built.length ? "playing" : "empty");
  };

  const current = items[idx];

  const handleChoose = (option) => {
    if (chosen || !current) return;
    setChosen(option);
    const correct = option.toLowerCase() === current.answer.toLowerCase();
    const entry = {
      sentenceId: current.id,
      text: current.fullText,
      translation: current.translation,
      category: current.category,
      score: correct ? 100 : 0,
      attempts: 1,
    };
    dispatch({ type: "SAVE_SESSION_RESULT", payload: entry });
    setResults((r) => [...r, entry]);
  };

  const handleNext = () => {
    if (idx + 1 >= items.length) {
      setScreen("done");
    } else {
      setIdx((i) => i + 1);
      setChosen(null);
    }
  };

  const avg = useMemo(
    () => (results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0),
    [results]
  );
  const correctCount = results.filter((r) => r.score === 100).length;

  if (screen === "setup") {
    return <CategoryPicker onPick={startSession} onBack={() => navigate("/practice")} />;
  }

  if (screen === "empty") {
    return (
      <div className="page-enter" style={{ padding: "20px 0" }}>
        <div className="container desktop-center" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🤔</div>
          <h3>אין מספיק משפטים מתאימים</h3>
          <p className="text-muted mb-4">נסה קטגוריה אחרת</p>
          <button className="btn btn-primary" onClick={() => setScreen("setup")}>נסה שוב</button>
        </div>
      </div>
    );
  }

  if (screen === "done") {
    return (
      <div className="page-enter" style={{ padding: "20px 0" }}>
        <div className="container desktop-center" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>{avg >= 70 ? "🎉" : "💪"}</div>
          <h2 style={{ marginBottom: 4 }}>סיימת!</h2>
          <p className="text-muted mb-4">{correctCount} מתוך {results.length} נכונות · ציון ממוצע {avg}%</p>
          <div style={{ display: "grid", gap: 10 }}>
            <button className="btn btn-primary btn-block" onClick={() => setScreen("setup")}>
              🔁 תרגל שוב
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => navigate("/")}>
              חזרה לדף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div className="page-enter" style={{ padding: "20px 0" }}>
      <div className="container desktop-center">
        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
          {categoryMeta[current.category]?.emoji || "✍️"} משפט {idx + 1} מתוך {items.length}
        </p>

        <div className="card" style={{ marginBottom: 20, textAlign: "center" }}>
          <p dir="ltr" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.6 }}>{current.blanked}</p>
          {settings.showTranslation && (
            <p className="text-muted" style={{ marginTop: 10, direction: "rtl" }}>{current.translation}</p>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          {current.options.map((option) => {
            const isAnswer = option.toLowerCase() === current.answer.toLowerCase();
            const isChosen = chosen === option;
            let border = "1.5px solid #EEF0FF";
            let bg = "#fff";
            if (chosen) {
              if (isAnswer) { border = "2px solid var(--color-success)"; bg = "var(--color-success-light)"; }
              else if (isChosen) { border = "2px solid var(--color-error)"; bg = "var(--color-error-light)"; }
            }
            return (
              <button
                key={option}
                type="button"
                disabled={!!chosen}
                onClick={() => handleChoose(option)}
                dir="ltr"
                style={{
                  padding: "14px 10px",
                  borderRadius: 14,
                  border,
                  background: bg,
                  cursor: chosen ? "default" : "pointer",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--color-text)",
                }}
              >
                {option}
              </button>
            );
          })}
        </div>

        {chosen && (
          <button className="btn btn-primary btn-block" onClick={handleNext}>
            {idx + 1 >= items.length ? "סיים 🎉" : "הבא ▶"}
          </button>
        )}
      </div>
    </div>
  );
}
