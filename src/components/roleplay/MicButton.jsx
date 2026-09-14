import { useState, useEffect, useCallback } from 'react';
import { useVoiceInput } from '../../hooks/useVoiceInput';

export function MicButton({ phase, onSpoke, insertText, onInsertConsumed }) {
  const [textInput, setTextInput] = useState('');
  const isActive = phase === 'USER_TURN';

  useEffect(() => {
    if (insertText) {
      setTextInput(insertText);
      onInsertConsumed?.();
    }
  }, [insertText, onInsertConsumed]);

  const handleVoiceResult = useCallback((text) => {
    setTextInput(text);
  }, []);

  const {
    isRecording,
    isTranscribing,
    liveTranscript,
    error,
    speechSupported,
    startRecording,
    stopRecording,
    clearError,
  } = useVoiceInput({ onResult: handleVoiceResult, enabled: isActive });

  const displayValue = isRecording
    ? liveTranscript
    : isTranscribing
      ? (liveTranscript || textInput)
      : textInput;
  const micBusy = isRecording || isTranscribing;
  const canSend = !micBusy && displayValue.trim();

  const handleSend = () => {
    if (!canSend) return;
    onSpoke(displayValue.trim());
    setTextInput('');
  };

  return (
    <div className="mic-bar">
      {error && (
        <p style={{
          fontSize: 12, color: '#EF4444', textAlign: 'center', margin: '0 0 6px',
          padding: '8px 12px', background: '#FFF5F5', borderRadius: 8
        }}>
          {error}
          <button
            type="button"
            onClick={clearError}
            style={{ marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#6B7280', padding: '6px 8px' }}
          >
            ✕
          </button>
        </p>
      )}
      <div className="mic-bar-row">
        <input
          dir="ltr"
          value={displayValue}
          onChange={e => { if (!micBusy) setTextInput(e.target.value); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && canSend) {
              handleSend();
            }
          }}
          placeholder={
            isTranscribing ? 'מתמלל...' :
            isRecording ? 'מדבר...' :
            'הקלד או השתמש במיקרופון...'
          }
          disabled={!isActive || isTranscribing}
          className={`mic-bar-input${isRecording ? ' recording' : ''}`}
        />
        {speechSupported && (
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!isActive || isTranscribing}
            className={`mic-bar-btn mic${isRecording ? ' recording' : ''}`}
            aria-label={isRecording ? 'עצור הקלטה' : 'התחל הקלטה'}
            style={!isActive ? { opacity: 0.5 } : undefined}
          >
            {isRecording ? '⏹️' : '🎤'}
          </button>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={!isActive || !canSend}
          className="mic-bar-btn send"
          aria-label="שלח"
        >
          <span className="mic-send-label">שלח</span>
          <span className="mic-send-icon" aria-hidden="true">➤</span>
        </button>
      </div>
      {isRecording && (
        <p style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', margin: 0 }}>
          🎤 מדבר... הטקסט מופיע בזמן אמת · לחץ ⏹️ לסיום
        </p>
      )}
      {isTranscribing && (
        <p style={{ fontSize: 12, color: '#6C63FF', textAlign: 'center', margin: 0 }}>
          ⏳ מסיים תמלול...
        </p>
      )}
    </div>
  );
}
