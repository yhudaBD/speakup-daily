import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { usePlacementTest } from '../hooks/usePlacementTest';
import { ConversationBubble } from '../components/roleplay/ConversationBubble';
import { ThinkingBubble } from '../components/roleplay/ThinkingBubble';
import { MicButton } from '../components/roleplay/MicButton';

const EMOJI = '🧭';

function IntroScreen({ onStart, onSkip }) {
  return (
    <div className="page-enter" style={{ padding: '32px 20px', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>{EMOJI}</div>
      <h2 style={{ marginBottom: 8 }}>בוא נכיר</h2>
      <p style={{ color: '#6B7280', fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
        לפני שמתחילים לתרגל, בוא נדבר קצת באנגלית — סתם שיחה קלילה, לא מבחן.
        זה עוזר לי להתאים את התרגול בדיוק לרמה שלך ולעבודה שלך. לוקח כ-3 דקות.
      </p>
      <button className="btn btn-primary btn-lg btn-block" onClick={onStart} style={{ marginBottom: 12 }}>
        🎙️ בוא נתחיל
      </button>
      <button className="btn btn-ghost btn-block" onClick={onSkip}>
        דלג לעכשיו
      </button>
    </div>
  );
}

function ErrorScreen({ onRetry, onSkip }) {
  return (
    <div style={{ padding: '32px 20px', maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ marginBottom: 8 }}>משהו השתבש</h2>
      <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 24 }}>
        לא הצלחנו להשלים את השיחה כרגע. אפשר לנסות שוב, או להתחיל לתרגל עם רמה כללית ולעדכן אותה מאוחר יותר.
      </p>
      <button className="btn btn-primary btn-block" onClick={onRetry} style={{ marginBottom: 12 }}>
        נסה שוב
      </button>
      <button className="btn btn-ghost btn-block" onClick={onSkip}>
        דלג לעכשיו
      </button>
    </div>
  );
}

function DoneScreen({ result, onContinue }) {
  const plan = result?.learning_plan || [];
  return (
    <div style={{ padding: '32px 20px', maxWidth: 420, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <h2 style={{ marginBottom: 12 }}>מעולה, סיימנו!</h2>
      {result?.summary_he && (
        <div className="card" style={{ textAlign: 'right', direction: 'rtl', marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.6, margin: 0 }}>
            {result.summary_he}
          </p>
        </div>
      )}
      {plan.length > 0 && (
        <div className="card" style={{ textAlign: 'right', direction: 'rtl', marginBottom: 24, border: '1.5px solid var(--color-primary)', background: 'var(--color-primary-light)' }}>
          <h3 style={{ fontSize: 15, marginBottom: 10, color: 'var(--color-primary)' }}>🗺️ בנינו לך תוכנית לימוד אישית</h3>
          {plan.slice(0, 3).map((step, i) => (
            <p key={i} style={{ fontSize: 13, color: 'var(--color-text)', margin: '4px 0' }}>
              {i + 1}. {step.title_he}
            </p>
          ))}
          {plan.length > 3 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
              ועוד {plan.length - 3} שלבים ב"התוכנית שלי"
            </p>
          )}
        </div>
      )}
      <button className="btn btn-primary btn-lg btn-block" onClick={onContinue}>
        {plan.length > 0 ? 'לתוכנית שלי 🗺️' : 'בוא נתחיל לתרגל! 🚀'}
      </button>
    </div>
  );
}

export default function PlacementTest() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const chatBottomRef = useRef(null);

  const skipWithDefault = () => {
    dispatch({
      type: 'SET_PLACEMENT_RESULT',
      payload: {
        comprehension_level: 'A2',
        speaking_level: 'A1',
        overall_level: 'A1',
        job_field: '',
        situations: [],
        gaps: [],
        summary_he: 'התחלת עם רמה כללית — אפשר תמיד לבדוק את הרמה שלך מחדש בהגדרות.',
        skipped: true,
      },
    });
    navigate('/');
  };

  const {
    messages, phase, isSpeaking, result,
    startPlacement, handleUserMessage, retry, replayMessage,
  } = usePlacementTest({
    userId: state.user?.id,
    userName: state.user?.name,
    onComplete: (placementResult) => {
      dispatch({ type: 'SET_PLACEMENT_RESULT', payload: placementResult });
    },
  });

  const handleContinueAfterPlacement = () => {
    if (result?.learning_plan?.length) {
      navigate('/progress', { state: { initialTab: 'plan' } });
    } else {
      navigate('/');
    }
  };

  useEffect(() => {
    if (phase !== 'IDLE') {
      document.documentElement.classList.add('immersive-chat');
      return () => document.documentElement.classList.remove('immersive-chat');
    }
  }, [phase]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase]);

  if (phase === 'IDLE') {
    return <IntroScreen onStart={startPlacement} onSkip={skipWithDefault} />;
  }

  if (phase === 'ERROR') {
    return <ErrorScreen onRetry={retry} onSkip={skipWithDefault} />;
  }

  if (phase === 'DONE') {
    return <DoneScreen result={result} onContinue={handleContinueAfterPlacement} />;
  }

  return (
    <div className="chat-shell">
      <div className="chat-shell-header">
        <span style={{ width: 40 }} />
        <span style={{ fontWeight: 600, color: '#1E1B4B', fontSize: 15 }}>{EMOJI} בוא נכיר</span>
        <span style={{ width: 40 }} />
      </div>

      <div className="chat-shell-messages">
        {messages.map((msg, i) => (
          <ConversationBubble
            key={i}
            message={msg}
            topicEmoji={EMOJI}
            onReplay={replayMessage}
            showTranslation
            isSpeaking={isSpeaking}
          />
        ))}
        {phase === 'AI_THINKING' && <ThinkingBubble topicEmoji={EMOJI} />}
        <div ref={chatBottomRef} />
      </div>

      <div className="chat-shell-footer">
        <MicButton phase={phase} onSpoke={handleUserMessage} />
      </div>
    </div>
  );
}
