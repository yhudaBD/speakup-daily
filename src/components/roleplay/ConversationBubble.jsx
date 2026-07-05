export function ConversationBubble({ message, topicEmoji, onReplay, showTranslation, isSpeaking }) {
  const isAI = message.role === 'assistant';

  return (
    <div className={`flex mb-4 ${isAI ? 'justify-start' : 'justify-end'}`}>
      {isAI && (
        <span className="text-2xl mr-2 self-end mb-1 flex-shrink-0">{topicEmoji}</span>
      )}
      <div
        className="chat-bubble"
        style={{
          borderRadius: isAI ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
          backgroundColor: isAI ? '#EEF0FF' : '#6C63FF',
          color: isAI ? '#1E1B4B' : '#ffffff',
        }}
      >
        <div>{message.content}</div>
        {isAI && showTranslation && message.he && (
          <div className="chat-bubble-he">{message.he}</div>
        )}
        {isAI && (
          <button
            type="button"
            onClick={() => onReplay(message.content)}
            style={{
              marginTop: 8,
              background: 'rgba(108,99,255,0.12)',
              border: 'none',
              borderRadius: 8,
              padding: '4px 10px',
              fontSize: 12,
              color: '#6C63FF',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isSpeaking ? '🔊 מדבר...' : '🔊 השמע'}
          </button>
        )}
      </div>
    </div>
  );
}
