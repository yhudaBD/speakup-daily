import { categoryMeta } from "../../data/sentences";
import { speakNaturally } from "../../utils/speechVoice";

const BLANK = "_____";
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// One sentence-completion question, in the look of the practice screen:
// the sentence with an empty slot, four answer cards, and after the answer
// the slot filled in, what was right, and the whole sentence to hear.
export function ClozeQuestion({ item, chosen, onChoose, showTranslation, ttsSpeed = 0.92 }) {
  const [before, after = ""] = item.blanked.split(BLANK);
  const right = chosen ? same(chosen, item.answer) : null;
  const category = categoryMeta[item.category];

  const optionClass = (option) => {
    if (!chosen) return "cloze-option";
    if (same(option, item.answer)) return "cloze-option is-correct";
    if (option === chosen) return "cloze-option is-wrong";
    return "cloze-option is-dimmed";
  };

  return (
    <>
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="cloze-tag">
            🧩 השלמת משפט{category ? ` · ${category.label}` : ""}
          </span>
        </div>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 8 }}>בחר את המילה החסרה</p>
        <p dir="ltr" className="cloze-sentence">
          {before}
          <span
            data-testid="cloze-blank"
            className={`cloze-blank${right === true ? " is-correct" : right === false ? " is-wrong" : ""}`}
          >
            {chosen ? item.answer : " "}
          </span>
          {after}
        </p>
        {showTranslation && item.translation && (
          <p style={{ fontSize: 15, color: "var(--color-text-muted)", fontStyle: "italic", direction: "rtl", marginTop: 12 }}>
            {item.translation}
          </p>
        )}
      </div>

      <div className="cloze-options">
        {item.options.map((option) => (
          <button
            key={option}
            type="button"
            dir="ltr"
            className={optionClass(option)}
            disabled={!!chosen}
            onClick={() => onChoose(option)}
          >
            {option}
            {chosen && same(option, item.answer) && <span aria-hidden="true"> ✓</span>}
            {chosen && option === chosen && !right && <span aria-hidden="true"> ✗</span>}
          </button>
        ))}
      </div>

      {chosen && (
        <div className="card mb-4 cloze-feedback" style={{ textAlign: "center" }}>
          <p role="status" style={{ fontWeight: 800, fontSize: "1.1rem", margin: "0 0 10px", color: right ? "var(--color-success)" : "var(--color-error)" }}>
            {right ? "✅ נכון!" : <>התשובה הנכונה: <span dir="ltr">{item.answer}</span></>}
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => speakNaturally(item.fullText, { rate: ttsSpeed })}
          >
            🔊 שמע את המשפט
          </button>
        </div>
      )}
    </>
  );
}
