// The sentence's words, colored by how clearly each was heard. Always left
// to right: in the app's right-to-left layout the words used to show in
// reverse. A word that wasn't clear opens its help card (WordHelp).
const CHIP_CLASS = { correct: "word-correct", partial: "word-partial" };

export function WordHighlight({ wordResults, selected, onSelect }) {
  if (!wordResults?.length) return null;
  const hasUnclear = wordResults.some((w) => w.status !== "correct");

  return (
    <div dir="ltr" style={{ textAlign: "center", margin: "16px 0", lineHeight: 2 }}>
      {wordResults.map((result, i) => {
        const className = `word-chip ${CHIP_CLASS[result.status] || "word-incorrect"}`;
        if (result.status === "correct") {
          return <span key={i} className={className}>{result.word}</span>;
        }
        return (
          <button
            key={i}
            type="button"
            className={`${className} word-chip-button`}
            aria-pressed={selected === result}
            onClick={() => onSelect(result)}
          >
            {result.word}
          </button>
        );
      })}
      {hasUnclear && (
        <p dir="rtl" style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>
          לחץ על מילה צבועה כדי לשמוע איך אומרים אותה
        </p>
      )}
    </div>
  );
}
