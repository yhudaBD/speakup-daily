import { useState } from "react";
import { aiService } from "../../services/ai.service";
import { speakNaturally } from "../../utils/speechVoice";

// Help with one word that wasn't clear: what was heard instead, the word
// played slowly, and on request how to say it and what it means in the
// sentence (aiService.explainWord). On failure an error with a retry,
// never made-up help (CLAUDE.md).
export function WordHelp({ word, heard, sentence }) {
  const [help, setHelp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const explain = async () => {
    setLoading(true);
    setError(false);
    try {
      setHelp(await aiService.explainWord({ word, sentence, heard }));
    } catch (err) {
      console.error("Word help failed:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card word-help" style={{ textAlign: "right", margin: "0 0 16px", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <span dir="ltr" style={{ fontSize: "1.3rem", fontWeight: 800, fontFamily: "var(--font-display)" }}>{word}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => speakNaturally(word, { rate: 0.7 })}
        >
          🔊 השמע לאט
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: 13, margin: "0 0 12px" }}>
        {heard
          ? <>שמענו: "<span dir="ltr">{heard}</span>"</>
          : "לא נשמעה מילה במקום הזה"}
      </p>

      {help ? (
        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          {help.say_he && <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700 }}>{help.say_he}</p>}
          <p style={{ margin: 0 }}>{help.tip_he}</p>
          {help.meaning_he && <p className="text-muted" style={{ margin: 0 }}>במשפט הזה: {help.meaning_he}</p>}
        </div>
      ) : error ? (
        <div>
          <p role="alert" style={{ color: "var(--color-error)", fontSize: 13, margin: "0 0 8px" }}>
            לא הצלחנו להביא הסבר כרגע.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={explain} disabled={loading}>
            נסה שוב
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-sm" onClick={explain} disabled={loading}>
          {loading ? "רגע..." : "💡 איך אומרים את זה?"}
        </button>
      )}
    </div>
  );
}
