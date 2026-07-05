export function SuggestedReplies({ replies, onSelect, disabled, showTranslation }) {
  if (!replies || replies.length === 0) return null;

  return (
    <div className="suggested-replies-panel" style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ fontSize: '12px', color: '#6B7280', margin: '0 0 4px 0', fontWeight: '600' }}>
        הצעות לתשובה (לחץ לשליחה):
      </p>
      {replies.map((reply, idx) => {
        const textEn = typeof reply === 'string' ? reply : reply.en;
        const textHe = typeof reply === 'string' ? '' : reply.he;

        return (
          <button
            key={idx}
            disabled={disabled}
            onClick={() => onSelect(textEn)}
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              backgroundColor: '#fff',
              border: '1.5px solid #EEF0FF',
              borderRadius: '12px',
              color: '#1E1B4B',
              fontSize: '14px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(108,99,255,0.05)',
              opacity: disabled ? 0.6 : 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              width: '100%',
            }}
          >
            <span style={{ wordBreak: 'break-word' }}>
              {textEn}
            </span>
            {showTranslation && textHe && (
              <span style={{ fontSize: '12px', color: '#6B7280', direction: 'rtl', textAlign: 'right' }}>
                {textHe}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
