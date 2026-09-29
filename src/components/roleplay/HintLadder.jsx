// The hint ladder under the conversation (CRITICAL_REVIEW.md §5): one step
// at a time, an idea in Hebrew, the opening words, and last a full sentence
// to say out loud. State lives in useHintLadder.

const NOTICES = {
  "say-it": "את המשפט המלא צריך לומר בקול 🎙️",
  "not-quite": "כמעט! נסה להגיד את המשפט שוב",
};

const box = {
  padding: '10px 14px', background: '#fff', border: '1.5px solid #EEF0FF',
  borderRadius: 12, fontSize: 14, color: '#1E1B4B',
};

export function HintLadder({ ladder, help, showTranslation, disabled }) {
  const { steps, shown, notice, next } = ladder;
  if (!help || steps.length === 0) return null;
  const revealed = steps.slice(0, shown);
  const nextStep = steps[shown];

  return (
    <div className="hint-ladder" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {revealed.includes('idea') && (
        <div style={{ ...box, direction: 'rtl', textAlign: 'right' }}>💭 {help.hintHe}</div>
      )}
      {revealed.includes('starter') && (
        <div style={{ ...box, direction: 'rtl', textAlign: 'right' }}>
          אפשר להתחיל כך: <span dir="ltr" style={{ fontWeight: 700 }}>{help.starter}…</span>
        </div>
      )}
      {revealed.includes('sentence') && (
        <div style={{ ...box, borderColor: 'var(--color-primary)' }}>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 4px', direction: 'rtl', textAlign: 'right' }}>
            עכשיו תגיד את זה בקול:
          </p>
          <p dir="ltr" style={{ margin: 0, fontWeight: 700, textAlign: 'left' }}>{help.sentence.en}</p>
          {showTranslation && help.sentence.he && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6B7280', direction: 'rtl', textAlign: 'right' }}>
              {help.sentence.he}
            </p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--color-warning)', direction: 'rtl', textAlign: 'right' }}>
          {NOTICES[notice]}
        </p>
      )}
      {nextStep && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          onClick={next}
          style={{ alignSelf: 'flex-start' }}
        >
          {shown === 0 ? '💡 צריך עזרה?' : nextStep === 'sentence' ? 'הראה משפט מלא' : 'עוד רמז'}
        </button>
      )}
    </div>
  );
}
