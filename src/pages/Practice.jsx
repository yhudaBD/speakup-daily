import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { scorePronunciation } from "../utils/pronunciationScorer";
import {
  getDailySentences,
  sentencesFromWordBank,
  countSentencesByCategory,
  categories,
  categoryMeta,
} from "../data/sentences";
import { aiService } from "../services/ai.service";

function WaveAnimation() {
  return (
    <div className="wave-container">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

function WordHighlight({ wordResults }) {
  if (!wordResults?.length) return null;
  return (
    <div style={{ textAlign: "center", margin: "16px 0", lineHeight: 2 }}>
      {wordResults.map(({ word, status }, i) => (
        <span
          key={i}
          className={`word-chip word-${status === "correct" ? "correct" : status === "partial" ? "partial" : "incorrect"}`}
        >
          {word}
        </span>
      ))}
    </div>
  );
}

function ScoreDisplay({ score, wordResults }) {
  let colorClass = "score-poor";
  let label = "Try Again! 💪";
  let bg = "var(--color-error)";
  if (score >= 90) { colorClass = "score-excellent"; label = "Excellent! 🌟"; bg = "var(--color-success)"; }
  else if (score >= 70) { colorClass = "score-good"; label = "Good job! 👏"; bg = "var(--color-warning)"; }
  else if (score >= 50) { colorClass = "score-ok"; label = "Keep going! 🔵"; bg = "var(--color-info)"; }

  return (
    <div style={{ textAlign: "center" }}>
      <div
        className="score-ring"
        style={{ "--score-color": bg, "--score-pct": `${score * 3.6}deg` }}
      >
        <span className={`score-number ${colorClass}`}>{score}</span>
        <span className="score-label" style={{ color: "var(--color-text-muted)" }}>/ 100</span>
      </div>
      <p style={{ fontSize: "1.2rem", fontWeight: 800, marginTop: 12, fontFamily: "var(--font-display)" }}>
        {label}
      </p>
      <WordHighlight wordResults={wordResults} />
    </div>
  );
}

function AITopicPanel({ difficulty, dailyGoal, onStart, onBack }) {
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const suggestions = [
    { he: "בשדה התעופה", emoji: "✈️" },
    { he: "במסעדה", emoji: "🍽️" },
    { he: "ראיון עבודה", emoji: "💼" },
    { he: "אצל הרופא", emoji: "👨‍⚕️" },
    { he: "קניות בסופרמרקט", emoji: "🛒" },
    { he: "נסיעה ברכבת העיר", emoji: "🚇" },
    { he: "שיחה עם חבר חדש", emoji: "🤝" },
    { he: "הזמנת מלון", emoji: "🏨" },
  ];

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setError("");
    setIsGenerating(true);
    try {
      await onStart(topic.trim());
    } catch (err) {
      setError("אירעה שגיאה ביצירת המשפטים. נסה שוב.");
      setIsGenerating(false);
    }
  };

  if (isGenerating) {
    return (
      <div className="page-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16, padding: "20px 0" }}>
        <div className="container desktop-center" style={{ textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🤖</div>
          <p style={{ fontWeight: 700, fontSize: 16, color: "var(--color-primary)", marginBottom: 4 }}>ה-AI יוצר משפטים לנושא:</p>
          <p style={{ fontWeight: 800, fontSize: 20, color: "var(--color-text)", direction: "rtl", marginBottom: 20 }}>"{topic}"</p>
          <div className="spinner" style={{ width: 36, height: 36, margin: "0 auto 12px" }} />
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>זה ייקח כמה שניות...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter" style={{ padding: "20px 0" }}>
      <div className="container desktop-center">
        <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>← חזרה</button>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
          <h2 style={{ marginBottom: 4 }}>טרוף AI אישי</h2>
          <p className="text-muted" style={{ fontSize: 14 }}>
            כתוב נושא וה-AI ייצור משפטים ברמת {difficulty === "easy" ? "קל" : difficulty === "medium" ? "בינוני" : "מתקדם"}
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#F8F9FF",
            border: "2px solid var(--color-primary)",
            borderRadius: 16,
            padding: "4px 4px 4px 16px",
          }}>
            <span style={{ fontSize: 20 }}>💬</span>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && topic.trim() && handleGenerate()}
              placeholder="למשל: בשדה התעופה, ראיון עבודה..."
              dir="rtl"
              autoFocus
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                fontSize: 16,
                color: "var(--color-text)",
                outline: "none",
                padding: "10px 0",
                fontFamily: "var(--font-body)",
              }}
            />
            <button
              className="btn btn-primary"
              style={{ borderRadius: 12, padding: "10px 18px", fontSize: 14 }}
              disabled={!topic.trim()}
              onClick={handleGenerate}
            >
              צור ✨
            </button>
          </div>
          {error && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8, direction: "rtl" }}>⚠️ {error}</p>}
        </div>

        <div>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 10, direction: "rtl" }}>💡 רעיונות לדוגמא:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map((s) => (
              <button
                key={s.he}
                type="button"
                onClick={() => setTopic(s.he)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 20,
                  border: topic === s.he ? "2px solid var(--color-primary)" : "1.5px solid #EEF0FF",
                  background: topic === s.he ? "var(--color-primary-light)" : "#fff",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  color: "var(--color-text)",
                  direction: "rtl",
                  transition: "all 0.15s",
                }}
              >
                {s.emoji} {s.he}
              </button>
            ))}
          </div>
        </div>

        <p style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", marginTop: 20, direction: "rtl" }}>
          ✨ {dailyGoal} משפטים ייוצרו באנגלית לפי הנושא שבחרת
        </p>
      </div>
    </div>
  );
}

function TopicSetup({ difficulty, dailyGoal, wordBank, onStart, onStartAI, onBack }) {
  const [selected, setSelected] = useState("all");
  const [showAIPanel, setShowAIPanel] = useState(false);
  const excludeIds = [];
  const counts = countSentencesByCategory(difficulty, excludeIds);
  const wordBankCount = wordBank.length;

  const topicOptions = [
    { id: "all", ...categoryMeta.all, count: counts.all },
    ...categories.map((cat) => ({
      id: cat,
      ...categoryMeta[cat],
      count: counts[cat],
    })),
    ...(wordBankCount > 0 ? [{
      id: "wordbank",
      ...categoryMeta.wordbank,
      count: wordBankCount,
    }] : []),
  ];

  const canStart = selected === "wordbank"
    ? wordBankCount > 0
    : (counts[selected] || 0) > 0;

  if (showAIPanel) {
    return (
      <AITopicPanel
        difficulty={difficulty}
        dailyGoal={dailyGoal}
        onStart={onStartAI}
        onBack={() => setShowAIPanel(false)}
      />
    );
  }

  return (
    <div className="page-enter" style={{ padding: "20px 0" }}>
      <div className="container desktop-center">
        <button className="btn btn-ghost btn-sm mb-3" onClick={onBack}>← חזרה</button>
        <h2 style={{ marginBottom: 4 }}>בחר נושא לתרגול</h2>
        <p className="text-muted mb-4" style={{ fontSize: 14 }}>
          {dailyGoal} משפטים · רמת {difficulty === "easy" ? "קל" : difficulty === "medium" ? "בינוני" : "מתקדם"}
        </p>

        {/* AI Free Topic Button */}
        <button
          type="button"
          onClick={() => setShowAIPanel(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "16px",
            borderRadius: 16,
            border: "2px solid var(--color-primary)",
            background: "linear-gradient(135deg, var(--color-primary-light) 0%, #EEF0FF 100%)",
            cursor: "pointer",
            textAlign: "right",
            width: "100%",
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 28 }}>🤖</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-primary)" }}>נושא חופשי עם AI ✨</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>כתוב כל נושא וה-AI יייצר משפטים בהתאם</div>
          </div>
          <span style={{ color: "var(--color-primary)", fontSize: 18 }}>➨</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: "#EEF0FF" }} />
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>או בחר קטגוריה קבועה</span>
          <div style={{ flex: 1, height: 1, background: "#EEF0FF" }} />
        </div>

        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          {topicOptions.map((opt) => {
            const isSelected = selected === opt.id;
            const disabled = opt.count === 0;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => setSelected(opt.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: isSelected ? "2px solid var(--color-primary)" : "1.5px solid #EEF0FF",
                  background: isSelected ? "var(--color-primary-light)" : "#fff",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.45 : 1,
                  textAlign: "right",
                  width: "100%",
                }}
              >
                <span style={{ fontSize: 28 }}>{opt.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-text)" }}>{opt.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {opt.id === "wordbank"
                      ? `${opt.count} מילים שמורות`
                      : `${opt.count} משפטים זמינים`}
                  </div>
                </div>
                {isSelected && <span style={{ color: "var(--color-primary)", fontWeight: 700 }}>✓</span>}
              </button>
            );
          })}
        </div>

        <button
          className="btn btn-primary btn-block btn-lg"
          disabled={!canStart}
          onClick={() => onStart(selected)}
        >
          🎙️ התחל תרגול
        </button>
      </div>
    </div>
  );
}

function SessionSummary({ avg, sessionResults, summary, categoryLabel, onHome, onPracticeWords, onPracticeAgain }) {
  return (
    <div className="page-enter" style={{ padding: "24px 0" }}>
      <div className="container desktop-center">
        <div className="card" style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🎉</div>
          <h2 style={{ marginBottom: 4 }}>סיימת את הסשן!</h2>
          <p className="text-muted mb-2">{sessionResults.length} משפטים · {categoryLabel}</p>
          <div style={{
            fontSize: "3.5rem",
            fontFamily: "var(--font-display)",
            fontWeight: 900,
            color: avg >= 70 ? "var(--color-success)" : "var(--color-warning)",
            marginBottom: 4,
          }}>{avg}%</div>
          <p className="text-muted">ממוצע הגייה</p>
        </div>

        {summary && (
          <>
            {summary.summary_he && (
              <div className="card mb-3" style={{ textAlign: "right", direction: "rtl" }}>
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>📝 סיכום</h3>
                <p style={{ fontSize: 14, color: "var(--color-text-muted)", lineHeight: 1.6, margin: 0 }}>
                  {summary.summary_he}
                </p>
              </div>
            )}

            {summary.speaking_tips?.length > 0 && (
              <div className="card mb-3" style={{ background: "var(--color-primary-light)", textAlign: "right", direction: "rtl" }}>
                <h3 style={{ fontSize: 15, marginBottom: 8, color: "var(--color-primary)" }}>🗣️ טיפים לדיבור טבעי</h3>
                {summary.speaking_tips.map((tip, i) => (
                  <p key={i} style={{ fontSize: 13, color: "var(--color-text)", margin: "6px 0", lineHeight: 1.5 }}>
                    • {tip}
                  </p>
                ))}
              </div>
            )}

            {summary.vocabulary?.length > 0 && (
              <div className="card mb-3" style={{ textAlign: "right" }}>
                <h3 style={{ fontSize: 15, marginBottom: 12 }}>📚 מילים חדשות — נשמרו לחזרה</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {summary.vocabulary.map((v, i) => (
                    <div key={i} style={{
                      padding: "12px 14px",
                      background: "#F8F9FF",
                      borderRadius: 12,
                      border: "1px solid #EEF0FF",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <strong style={{ fontSize: 16, color: "var(--color-primary)" }}>{v.word}</strong>
                        <span style={{ fontSize: 13, color: "var(--color-text-muted)", direction: "rtl" }}>{v.meaning_he}</span>
                      </div>
                      {v.usage_tip_he && (
                        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "6px 0 0", direction: "rtl", lineHeight: 1.5 }}>
                          💡 {v.usage_tip_he}
                        </p>
                      )}
                      {v.example && (
                        <p style={{ fontSize: 13, fontStyle: "italic", margin: "6px 0 0", color: "var(--color-text)" }}>
                          "{v.example}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {summary?.vocabulary?.length > 0 && (
          <button className="btn btn-primary btn-block mb-2" onClick={onPracticeWords}>
            📚 תרגל את המילים האלה
          </button>
        )}
        <button className="btn btn-ghost btn-block mb-2" onClick={onPracticeAgain}>
          🔄 תרגול נוסף
        </button>
        <button className="btn btn-ghost btn-block" onClick={onHome}>
          חזרה לדף הבית 🏠
        </button>
      </div>
    </div>
  );
}

export default function Practice() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();
  const { settings, todayProgress, practice } = state;
  const wordBank = practice?.wordBank || [];

  const [practiceState, setPracticeState] = useState("SETUP");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [aiTopicLabel, setAiTopicLabel] = useState("");
  const [sentences, setSentences] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [result, setResult] = useState(null);
  const [sessionResults, setSessionResults] = useState([]);
  const [showTranslation, setShowTranslation] = useState(settings.showTranslation);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const { transcript, liveTranscript, isListening, isTranscribing, error, isSupported, start, stop } = useSpeechRecognition();
  const { speak } = useSpeechSynthesis();

  const categoryLabel = selectedCategory === "ai"
    ? (aiTopicLabel || "נושא AI")
    : (categoryMeta[selectedCategory]?.label || "מעורב");

  const loadSentences = useCallback((category) => {
    const excludeIds = todayProgress.map((p) => p.sentenceId);
    const bank = practice?.wordBank || [];
    let loaded;

    if (category === "wordbank") {
      loaded = sentencesFromWordBank(bank, settings.dailyGoal);
    } else {
      loaded = getDailySentences({
        difficulty: settings.difficulty,
        count: settings.dailyGoal,
        excludeIds,
        category,
      });
      if (loaded.length < settings.dailyGoal) {
        loaded = getDailySentences({
          difficulty: settings.difficulty,
          count: settings.dailyGoal,
          category,
        });
      }
    }

    setSentences(loaded);
    setCurrentIdx(0);
    setResult(null);
    setSessionResults([]);
    setSessionSummary(null);
    setPracticeState(loaded.length > 0 ? "IDLE" : "SETUP");
  }, [settings.difficulty, settings.dailyGoal, todayProgress, practice?.wordBank]);

  const handleStartTopic = (category) => {
    setSelectedCategory(category);
    loadSentences(category);
  };

  const handleStartAITopic = async (topic) => {
    setSelectedCategory("ai");
    setAiTopicLabel(topic);
    setCurrentIdx(0);
    setResult(null);
    setSessionResults([]);
    setSessionSummary(null);
    const { sentences: aiSentences, topicEn } = await aiService.generatePracticeSentences({
      topic,
      difficulty: settings.difficulty,
      count: settings.dailyGoal,
    });
    setAiTopicLabel(topicEn || topic);
    setSentences(aiSentences);
    setPracticeState(aiSentences.length > 0 ? "IDLE" : "SETUP");
  };

  const currentSentence = sentences[currentIdx];

  useEffect(() => {
    if (practiceState === "RECORDING" && transcript && currentSentence) {
      setPracticeState("ANALYZING");
      setTimeout(() => {
        const res = scorePronunciation(currentSentence.text, transcript);
        setResult({ ...res, spoken: transcript });
        setPracticeState("RESULT");
      }, 500);
    }
  }, [transcript, practiceState, currentSentence]);

  const handleListen = useCallback(() => {
    setPracticeState("LISTENING_EXAMPLE");
    speak(currentSentence?.text, {
      rate: settings.ttsSpeed,
      onEnd: () => setPracticeState("READY_TO_RECORD"),
    });
  }, [currentSentence, settings.ttsSpeed, speak]);

  const handleStartRecord = useCallback(() => {
    if (!isSupported) {
      alert("המיקרופון לא נתמך בדפדפן הזה. נסה Chrome או Safari מעודכן.");
      return;
    }
    setPracticeState("RECORDING");
    start();
  }, [isSupported, start]);

  const handleStopRecord = useCallback(() => stop(), [stop]);

  useEffect(() => {
    if (error && practiceState === "RECORDING" && !isListening) {
      setPracticeState("READY_TO_RECORD");
    }
  }, [error, practiceState, isListening]);

  const fetchSummary = useCallback(async (results, category, catLabel) => {
    setSummaryLoading(true);
    try {
      const avg = results.length
        ? Math.round(results.reduce((s, x) => s + x.score, 0) / results.length)
        : 0;
      const summary = await aiService.analyzePracticeSession({
        sentences: results.map((r) => ({ text: r.text, translation: r.translation })),
        categoryLabel: catLabel,
        difficulty: settings.difficulty,
        averageScore: avg,
      });
      setSessionSummary(summary);
      if (summary.vocabulary?.length) {
        dispatch({
          type: "ADD_PRACTICE_WORDS",
          payload: summary.vocabulary.map((v) => ({
            ...v,
            category,
            learnedAt: new Date().toISOString(),
          })),
        });
      }
    } catch (err) {
      console.error("Practice summary failed:", err);
    } finally {
      setSummaryLoading(false);
    }
  }, [settings.difficulty, dispatch]);

  const handleSaveAndNext = useCallback(() => {
    if (!result || !currentSentence) return;
    const entry = {
      sentenceId: currentSentence.id,
      text: currentSentence.text,
      translation: currentSentence.translation,
      score: result.score,
      attempts: 1,
      wordResults: result.wordResults,
    };
    dispatch({ type: "SAVE_SESSION_RESULT", payload: entry });
    const newResults = [...sessionResults, entry];
    setSessionResults(newResults);

    if (currentIdx + 1 >= sentences.length) {
      setPracticeState("DONE");
      fetchSummary(newResults, selectedCategory, categoryLabel);
    } else {
      setCurrentIdx((i) => i + 1);
      setResult(null);
      setPracticeState("IDLE");
    }
  }, [result, currentSentence, currentIdx, sentences.length, sessionResults, dispatch, fetchSummary, selectedCategory, categoryLabel]);

  const handleTryAgain = () => {
    setResult(null);
    setPracticeState("READY_TO_RECORD");
  };

  if (practiceState === "SETUP") {
    return (
      <TopicSetup
        difficulty={settings.difficulty}
        dailyGoal={settings.dailyGoal}
        wordBank={wordBank}
        onStart={handleStartTopic}
        onStartAI={handleStartAITopic}
        onBack={() => navigate("/")}
      />
    );
  }

  if (practiceState === "DONE") {
    const avg = sessionResults.length
      ? Math.round(sessionResults.reduce((s, x) => s + x.score, 0) / sessionResults.length)
      : 0;

    if (summaryLoading) {
      return (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div className="spinner" style={{ margin: "0 auto 16px" }} />
          <p style={{ fontWeight: 600 }}>מכין סיכום ומילים חדשות...</p>
        </div>
      );
    }

    return (
      <SessionSummary
        avg={avg}
        sessionResults={sessionResults}
        summary={sessionSummary}
        categoryLabel={categoryLabel}
        onHome={() => navigate("/")}
        onPracticeWords={() => {
          setSelectedCategory("wordbank");
          loadSentences("wordbank");
        }}
        onPracticeAgain={() => setPracticeState("SETUP")}
      />
    );
  }

  if (!currentSentence) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <div className="spinner" style={{ margin: "0 auto 16px" }} />
        <p>טוען משפטים…</p>
      </div>
    );
  }

  const progress = Math.round(((currentIdx + (practiceState === "RESULT" ? 1 : 0)) / sentences.length) * 100);

  return (
    <div className="page-enter" style={{ padding: "20px 0 8px" }}>
      <div className="container desktop-center">
        <div style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-muted" style={{ fontSize: 13 }}>
              {selectedCategory === "ai" ? "🤖" : categoryMeta[selectedCategory]?.emoji} משפט {currentIdx + 1} מתוך {sentences.length}
            </span>
            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--color-primary)" }}>{progress}%</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.08em", color: "var(--color-primary)",
              background: "var(--color-primary-light)",
              padding: "3px 10px", borderRadius: 99,
            }}>
              {currentSentence.category === "ai" ? `🤖 ${aiTopicLabel}` : (categoryMeta[currentSentence.category]?.label || currentSentence.category)} · {currentSentence.difficulty}
            </span>
            <button className="btn btn-sm btn-ghost" onClick={() => setShowTranslation((v) => !v)}>
              {showTranslation ? "הסתר 🙈" : "תרגום 👁"}
            </button>
          </div>

          <p style={{
            fontSize: "clamp(1.2rem, 4vw, 1.6rem)",
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            lineHeight: 1.5,
            marginBottom: 12,
            color: "var(--color-text)",
          }}>
            {currentSentence.text}
          </p>

          {showTranslation && currentSentence.translation && (
            <p style={{ fontSize: 15, color: "var(--color-text-muted)", fontStyle: "italic", direction: "rtl" }}>
              {currentSentence.translation}
            </p>
          )}

          {currentSentence.phonetic_tips && (
            <div style={{
              marginTop: 12,
              padding: "8px 12px",
              background: "var(--color-primary-light)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              color: "var(--color-primary)",
              fontWeight: 600,
            }}>
              {currentSentence.phonetic_tips}
            </div>
          )}
        </div>

        <div className="card" style={{ textAlign: "center", minHeight: 280, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
          {practiceState === "IDLE" && (
            <>
              <div style={{ fontSize: 48 }}>🎧</div>
              <p style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>הקשיב קודם, ואז דבר</p>
              <button className="btn btn-primary btn-lg" onClick={handleListen} id="listen-btn">
                🔊 האזן
              </button>
            </>
          )}

          {practiceState === "LISTENING_EXAMPLE" && (
            <>
              <WaveAnimation />
              <p style={{ fontWeight: 700, color: "var(--color-primary)" }}>מנגן דוגמה…</p>
            </>
          )}

          {practiceState === "READY_TO_RECORD" && (
            <>
              <p style={{ fontWeight: 600, color: "var(--color-text-muted)" }}>עכשיו תורך — לחץ ודבר</p>
              <button className="mic-btn" onClick={handleStartRecord} id="record-btn" aria-label="Start recording">
                🎙️
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleListen}>
                🔊 שמע שוב
              </button>
            </>
          )}

          {practiceState === "RECORDING" && isTranscribing && (
            <>
              <div className="spinner" />
              <p style={{ fontWeight: 700, color: "var(--color-primary)" }}>מתמלל את מה שאמרת…</p>
            </>
          )}

          {practiceState === "RECORDING" && isListening && !isTranscribing && (
            <>
              <p style={{ fontWeight: 700, color: "var(--color-error)" }}>מקשיב… נעצר אוטומטית כשאתה מפסיק</p>
              {liveTranscript && (
                <p style={{ fontSize: "1rem", fontStyle: "italic", color: "var(--color-text-muted)", padding: "0 12px", lineHeight: 1.5 }}>
                  "{liveTranscript}"
                </p>
              )}
              <button className="mic-btn recording" onClick={handleStopRecord} aria-label="Stop recording">
                ⏹️
              </button>
            </>
          )}

          {practiceState === "ANALYZING" && (
            <>
              <div className="spinner" />
              <p style={{ fontWeight: 600 }}>מנתח את ההגייה שלך…</p>
            </>
          )}

          {practiceState === "RESULT" && result && (
            <>
              <ScoreDisplay score={result.score} wordResults={result.wordResults} />
              {result.spoken && (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  שמע: "<em>{result.spoken}</em>"
                </p>
              )}
              <div className="flex gap-3" style={{ width: "100%" }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleTryAgain} id="try-again-btn">
                  🔁 נסה שוב
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveAndNext} id="next-btn">
                  {currentIdx + 1 >= sentences.length ? "סיים 🎉" : "הבא ▶"}
                </button>
              </div>
            </>
          )}

          {error && (
            <div style={{ color: "var(--color-error)", fontSize: 14, fontWeight: 600, padding: "0 8px" }}>
              ⚠️ {typeof error === "string" ? error : "שגיאה במיקרופון"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
