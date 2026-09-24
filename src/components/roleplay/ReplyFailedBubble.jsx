// Shown in place of the character's reply when it couldn't be fetched
// (offline, timeout, AI service down). Nothing is added to the
// conversation. The user retries, or ends the chat from the header.
export function ReplyFailedBubble({ topicEmoji, onRetry }) {
  return (
    <div className="flex justify-start mb-4">
      <span className="text-2xl mr-2 self-end mb-1" aria-hidden="true">{topicEmoji}</span>
      <div
        role="alert"
        style={{
          background: 'var(--color-surface)',
          border: '1.5px solid var(--color-error)',
          borderRadius: '4px 16px 16px 16px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
          color: 'var(--color-text)',
          fontSize: 14,
        }}
      >
        <span>⚠️ לא הצלחנו לקבל תשובה. בדוק את החיבור לאינטרנט ונסה שוב.</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          🔄 נסה שוב
        </button>
      </div>
    </div>
  );
}
