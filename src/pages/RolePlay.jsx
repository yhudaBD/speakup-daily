import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getAllTopics, getTopicById, createCustomTopic } from '../data/rolePlayTopics';
import { useRolePlay } from '../hooks/useRolePlay';
import { useApp } from '../context/AppContext';
import { aiService } from '../services/ai.service';
import { ConversationBubble } from '../components/roleplay/ConversationBubble';
import { ThinkingBubble } from '../components/roleplay/ThinkingBubble';
import { ReplyFailedBubble } from '../components/roleplay/ReplyFailedBubble';
import { SuggestedReplies } from '../components/roleplay/SuggestedReplies';
import { MicButton } from '../components/roleplay/MicButton';

function createSessionId() {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function formatChatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

const difficultyStyle = (difficulty) => ({
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 99,
  backgroundColor: difficulty === 'easy' ? '#DCFCE7' : difficulty === 'medium' ? '#FEF3C7' : '#EEF0FF',
  color: difficulty === 'easy' ? '#16A34A' : difficulty === 'medium' ? '#D97706' : '#6C63FF',
});

// ── Custom Topic Form ─────────────────────────────────────────────────────────
// ── "How do you say...?" helper ─────────────────────────────────────────────
function HowDoYouSay({ onTranslated, disabled }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    const result = await aiService.translateToEnglish(text.trim());
    setLoading(false);
    if (result) {
      onTranslated(result);
      setText('');
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        style={{
          background: 'none', border: 'none', color: '#6C63FF', fontSize: 12,
          fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', padding: '6px 12px 0',
          opacity: disabled ? 0.5 : 1, width: '100%', textAlign: 'center',
        }}
      >
        🗣️ איך אומרים...?
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, padding: '0 12px 8px' }}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleTranslate()}
        placeholder="כתוב בעברית..."
        autoFocus
        disabled={loading}
        className="mic-bar-input"
      />
      <button
        type="button"
        onClick={handleTranslate}
        disabled={loading || !text.trim()}
        style={{ background: '#6C63FF', color: '#fff', border: 'none', borderRadius: 99, padding: '0 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
      >
        {loading ? '…' : 'תרגם'}
      </button>
      <button
        type="button"
        onClick={() => { setOpen(false); setText(''); }}
        style={{ background: 'none', border: 'none', color: '#6B7280', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}
      >
        ✕
      </button>
    </div>
  );
}

function AddTopicForm({ onAdd, onCancel }) {
  const [emoji, setEmoji] = useState('💬');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [scenario, setScenario] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || !scenario.trim()) return;
    onAdd(createCustomTopic({
      emoji: emoji.trim() || '💬',
      title: title.trim(),
      description: description.trim() || title.trim(),
      difficulty,
      scenario: scenario.trim(),
    }));
  };

  return (
    <form onSubmit={handleSubmit} style={{
      background: '#fff', border: '1.5px solid #EEF0FF', borderRadius: 16,
      padding: 16, marginBottom: 16
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1E1B4B', marginBottom: 12 }}>
        ➕ נושא שיחה חדש
      </h3>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            placeholder="😀"
            maxLength={4}
            style={{ width: 52, textAlign: 'center', padding: 10, borderRadius: 8, border: '1.5px solid #EEF0FF' }}
          />
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="שם הנושא (למשל: בבית קולנוע)"
            required
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1.5px solid #EEF0FF' }}
          />
        </div>
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="תיאור קצר"
          style={{ padding: 10, borderRadius: 8, border: '1.5px solid #EEF0FF' }}
        />
        <select
          value={difficulty}
          onChange={e => setDifficulty(e.target.value)}
          style={{ padding: 10, borderRadius: 8, border: '1.5px solid #EEF0FF' }}
        >
          <option value="easy">קל</option>
          <option value="medium">בינוני</option>
          <option value="advanced">מתקדם</option>
        </select>
        <textarea
          value={scenario}
          onChange={e => setScenario(e.target.value)}
          placeholder="תאר את התרחיש באנגלית (למשל: You are a cinema ticket seller helping me choose a movie and seat)"
          required
          rows={3}
          style={{ padding: 10, borderRadius: 8, border: '1.5px solid #EEF0FF', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" style={{
            flex: 1, background: '#6C63FF', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 0', fontWeight: 600, cursor: 'pointer'
          }}>
            שמור נושא
          </button>
          <button type="button" onClick={onCancel} style={{
            flex: 1, background: '#EEF0FF', color: '#6C63FF', border: 'none',
            borderRadius: 10, padding: '12px 0', fontWeight: 600, cursor: 'pointer'
          }}>
            ביטול
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Topic & History Home ──────────────────────────────────────────────────────
function RolePlayHome({ topics, chats, onSelectTopic, onResumeChat, onDeleteChat, onAddTopic, onDeleteTopic }) {
  const [tab, setTab] = useState('topics');
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="roleplay-home" style={{ paddingBottom: '80px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1E1B4B', marginBottom: 8 }}>
        שיחות באנגלית
      </h2>
      <p style={{ color: '#6B7280', marginBottom: 16, fontSize: 14 }}>
        בחר תרחיש, המשך שיחה קודמת, או צור נושא משלך
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'topics', label: '🎭 נושאים' },
          { id: 'history', label: `📋 היסטוריה${chats.length ? ` (${chats.length})` : ''}` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', fontWeight: 600,
              cursor: 'pointer', fontSize: 13,
              background: tab === t.id ? '#6C63FF' : '#EEF0FF',
              color: tab === t.id ? '#fff' : '#6C63FF',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'topics' && (
        <>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                width: '100%', marginBottom: 16, padding: '12px 0',
                background: '#F8F9FF', border: '1.5px dashed #6C63FF', borderRadius: 12,
                color: '#6C63FF', fontWeight: 600, cursor: 'pointer', fontSize: 14
              }}
            >
              ➕ הוסף נושא שיחה משלך
            </button>
          ) : (
            <AddTopicForm
              onAdd={(topic) => { onAddTopic(topic); setShowAddForm(false); }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          <div className="topic-grid">
            {topics.map(topic => (
              <div key={topic.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => onSelectTopic(topic)}
                  className="topic-card"
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{topic.emoji}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1E1B4B', marginBottom: 4 }}>
                    {topic.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 8 }}>
                    {topic.description}
                  </div>
                  <span style={difficultyStyle(topic.difficulty)}>
                    {topic.difficulty === 'easy' ? 'קל' : topic.difficulty === 'medium' ? 'בינוני' : 'מתקדם'}
                  </span>
                </button>
                {topic.isCustom && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteTopic(topic.id); }}
                    title="מחק נושא"
                    style={{
                      position: 'absolute', top: 4, right: 4, background: '#FEE2E2',
                      border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 13,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chats.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#6B7280', padding: '32px 0' }}>
              אין שיחות שמורות עדיין.<br />התחל תרחיש חדש מהלשונית "נושאים".
            </p>
          ) : (
            chats.map(chat => {
              const lastMsg = chat.messages?.[chat.messages.length - 1];
              const preview = lastMsg
                ? `${lastMsg.role === 'user' ? 'אתה' : 'AI'}: ${lastMsg.content.slice(0, 60)}${lastMsg.content.length > 60 ? '...' : ''}`
                : 'שיחה ריקה';
              return (
                <div
                  key={chat.id}
                  style={{
                    background: '#fff', border: '1.5px solid #EEF0FF', borderRadius: 14,
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12
                  }}
                >
                  <button
                    onClick={() => onResumeChat(chat)}
                    style={{
                      flex: 1, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 22 }}>{chat.topic?.emoji || '💬'}</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#1E1B4B' }}>
                        {chat.topic?.title || 'שיחה'}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 99,
                        background: chat.status === 'completed' ? '#F3F4F6' : '#DCFCE7',
                        color: chat.status === 'completed' ? '#6B7280' : '#16A34A',
                      }}>
                        {chat.status === 'completed' ? 'הסתיים' : 'פעיל'}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 4px' }}>{preview}</p>
                    <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>
                      {chat.turnCount || 0} תורות · {formatChatDate(chat.updatedAt || chat.createdAt)}
                      {chat.feedback?.overall_score != null && (
                        <span style={{ marginRight: 6, color: '#6C63FF', fontWeight: 600 }}>
                          · 📊 {chat.feedback.overall_score}%
                        </span>
                      )}
                    </p>
                  </button>
                  <button
                    onClick={() => onDeleteChat(chat.id)}
                    style={{
                      background: 'none', border: 'none', color: '#EF4444',
                      cursor: 'pointer', fontSize: 18, padding: 10,
                      minWidth: 40, minHeight: 40, flexShrink: 0
                    }}
                    title="מחק שיחה"
                  >
                    🗑️
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Analysis Screen ───────────────────────────────────────────────────────────
function AnalysisScreen({ feedback, topic, onBack, onHome }) {
  const scoreColor = feedback.overall_score >= 80 ? '#16A34A' : feedback.overall_score >= 60 ? '#D97706' : '#EF4444';

  return (
    <div style={{ padding: '24px 20px 80px', maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1E1B4B', marginBottom: 4, textAlign: 'center' }}>
        📊 ניתוח השיחה
      </h2>
      <p style={{ textAlign: 'center', color: '#6B7280', marginBottom: 20, fontSize: 14 }}>
        {topic.emoji} {topic.title}
      </p>

      <div style={{
        background: '#fff', border: '1.5px solid #EEF0FF', borderRadius: 16,
        padding: 20, marginBottom: 16, textAlign: 'center'
      }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor, fontFamily: 'var(--font-display)' }}>
          {feedback.overall_score}%
        </div>
        <p style={{ color: '#6B7280', fontSize: 14, margin: '8px 0 0', direction: 'rtl' }}>{feedback.summary}</p>
      </div>

      {feedback.strengths?.length > 0 && (
        <div style={{ background: '#F0FDF4', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#16A34A', marginBottom: 8 }}>✅ חוזקות</h3>
          {feedback.strengths.map((s, i) => (
            <p key={i} style={{ fontSize: 13, color: '#166534', margin: '4px 0', direction: 'rtl' }}>• {s}</p>
          ))}
        </div>
      )}

      {feedback.improvements?.length > 0 && (
        <div style={{ background: '#FFFBEB', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#D97706', marginBottom: 8 }}>💡 לשיפור</h3>
          {feedback.improvements.map((s, i) => (
            <p key={i} style={{ fontSize: 13, color: '#92400E', margin: '4px 0', direction: 'rtl' }}>• {s}</p>
          ))}
        </div>
      )}

      {feedback.grammar_notes?.length > 0 && (
        <div style={{ background: '#EEF0FF', borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#6C63FF', marginBottom: 8 }}>📝 דקדוק</h3>
          {feedback.grammar_notes.map((s, i) => (
            <p key={i} style={{ fontSize: 13, color: '#4338CA', margin: '4px 0', direction: 'rtl' }}>• {s}</p>
          ))}
        </div>
      )}

      {feedback.vocabulary_suggestions?.length > 0 && (
        <div style={{ background: '#fff', border: '1.5px solid #EEF0FF', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1E1B4B', marginBottom: 8 }}>📚 ביטויים שימושיים</h3>
          {feedback.vocabulary_suggestions.map((s, i) => (
            <p key={i} style={{ fontSize: 13, color: '#4B5563', margin: '4px 0' }}>• {s}</p>
          ))}
        </div>
      )}

      <button onClick={onBack} style={{
        backgroundColor: '#6C63FF', color: '#fff', border: 'none', borderRadius: 12,
        padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 12
      }}>
        חזרה לתפריט שיחות
      </button>
      <button onClick={onHome} style={{
        backgroundColor: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 12,
        padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%'
      }}>
        חזרה לדף הבית
      </button>
    </div>
  );
}

// ── Done Screen ─────────────────────────────────────────────────────────────
function DoneScreen({ turnCount, topic, messages, chatId, savedFeedback, onNewChat, onBack, onHome, onFeedbackSaved }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [feedback, setFeedback] = useState(savedFeedback || null);
  const [error, setError] = useState(null);
  // Ending a chat before saying anything used to "analyze" it into a 0%
  // score, which ADJUST_LEVEL then counted as a weak result.
  const hasUserMessages = messages.some((m) => m.role === 'user');

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await aiService.analyzeConversation({
        messages,
        topicTitle: topic.title,
      });
      setFeedback(result);
      onFeedbackSaved(chatId, result);
    } catch (err) {
      console.error(err);
      setError('לא הצלחנו לנתח את השיחה. נסה שוב.');
    } finally {
      setAnalyzing(false);
    }
  };

  if (feedback) {
    return (
      <AnalysisScreen
        feedback={feedback}
        topic={topic}
        onBack={onBack}
        onHome={onHome}
      />
    );
  }

  return (
    <div style={{ padding: 32, textAlign: 'center', maxWidth: 400, margin: '0 auto', paddingTop: '64px' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1E1B4B', marginBottom: 8 }}>שיחה מצוינת!</h2>
      <p style={{ color: '#6B7280', marginBottom: 8 }}>
        השלמת <strong>{turnCount} תורות</strong> ב
      </p>
      <p style={{ fontSize: 18, fontWeight: 600, color: '#6C63FF', marginBottom: 24 }}>
        {topic.emoji} {topic.title}
      </p>

      {hasUserMessages ? (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            backgroundColor: '#1E1B4B', color: '#fff', border: 'none', borderRadius: 12,
            padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: analyzing ? 'wait' : 'pointer',
            width: '100%', marginBottom: 12, opacity: analyzing ? 0.7 : 1
          }}
        >
          {analyzing ? '⏳ מנתח את השיחה...' : '🤖 ניתוח השיחה ב-AI'}
        </button>
      ) : (
        <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 12 }}>
          לא נשלחו הודעות בשיחה הזו, אז אין מה לנתח.
        </p>
      )}
      {error && <p role="alert" style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button onClick={onNewChat} style={{
        backgroundColor: '#6C63FF', color: '#fff', border: 'none', borderRadius: 12,
        padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 12
      }}>
        שיחה חדשה באותו נושא
      </button>
      <button onClick={onBack} style={{
        backgroundColor: '#EEF0FF', color: '#6C63FF', border: 'none', borderRadius: 12,
        padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%', marginBottom: 12
      }}>
        בחר נושא אחר
      </button>
      <button onClick={onHome} style={{
        backgroundColor: '#F3F4F6', color: '#6B7280', border: 'none', borderRadius: 12,
        padding: '14px 32px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%'
      }}>
        חזרה לדף הבית
      </button>
    </div>
  );
}

// ── Saved Chat Review ─────────────────────────────────────────────────────────
function SavedChatReview({ messages, topic, savedChat, showTranslation, onReplay, onNewChat, onBack, onHome }) {
  const [showAnalysis, setShowAnalysis] = useState(false);

  if (showAnalysis && savedChat?.feedback) {
    return (
      <AnalysisScreen
        feedback={savedChat.feedback}
        topic={topic}
        onBack={() => setShowAnalysis(false)}
        onHome={onHome}
      />
    );
  }

  return (
    <div className="chat-shell">
      <div className="chat-shell-header">
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
        <span style={{ fontWeight: 600, fontSize: 14, color: '#6B7280' }}>שיחה שמורה</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="chat-shell-messages">
        {messages.map((msg, i) => (
          <ConversationBubble key={i} message={msg} topicEmoji={topic.emoji} onReplay={onReplay} showTranslation={showTranslation} />
        ))}
      </div>
      <div className="chat-shell-footer" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {savedChat?.feedback && (
          <button onClick={() => setShowAnalysis(true)} style={{
            background: '#1E1B4B', color: '#fff', border: 'none', borderRadius: 12,
            padding: '14px 0', fontWeight: 600, cursor: 'pointer'
          }}>
            📊 צפה בניתוח השיחה ({savedChat.feedback.overall_score}%)
          </button>
        )}
        <button onClick={onNewChat} style={{
          background: '#6C63FF', color: '#fff', border: 'none', borderRadius: 12,
          padding: '14px 0', fontWeight: 600, cursor: 'pointer'
        }}>
          שיחה חדשה באותו נושא
        </button>
        <button onClick={onBack} style={{
          background: '#EEF0FF', color: '#6C63FF', border: 'none', borderRadius: 12,
          padding: '14px 0', fontWeight: 600, cursor: 'pointer'
        }}>
          חזרה לרשימה
        </button>
      </div>
    </div>
  );
}

// ── Main RolePlay Page ───────────────────────────────────────────────────────
export default function RolePlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, dispatch } = useApp();
  const { chats, customTopics } = state.rolePlay;
  const { chatDifficulty, showChatTranslation, ttsSpeed } = state.settings;
  const allTopics = getAllTopics(customTopics);

  const [activeSession, setActiveSession] = useState(null);
  const [showTranslation, setShowTranslation] = useState(showChatTranslation);
  const [insertText, setInsertText] = useState('');
  const chatBottomRef = useRef(null);

  useEffect(() => {
    setShowTranslation(showChatTranslation);
  }, [showChatTranslation]);

  // Arriving from a "My Plan" module (Progress.jsx) auto-starts its scenario.
  useEffect(() => {
    const { autoTopic, planModuleIndex } = location.state || {};
    if (autoTopic) {
      setActiveSession({ id: createSessionId(), topic: autoTopic, initialChat: null, planModuleIndex });
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savedChat = activeSession
    ? chats.find((c) => c.id === activeSession.id)
    : null;

  const handlePersist = useCallback((chat) => {
    dispatch({ type: 'UPSERT_ROLEPLAY_CHAT', payload: chat });
  }, [dispatch]);

  const handleSessionComplete = useCallback((record) => {
    dispatch({ type: 'SAVE_ROLEPLAY_SESSION', payload: record });
    if (activeSession?.planModuleIndex != null) {
      dispatch({ type: 'UPDATE_PLAN_PROGRESS', payload: { moduleIndex: activeSession.planModuleIndex } });
    }
  }, [dispatch, activeSession]);

  const handleFeedbackSaved = useCallback((chatId, feedback) => {
    dispatch({ type: 'UPDATE_ROLEPLAY_FEEDBACK', payload: { chatId, feedback } });
    const newGaps = [...(feedback.grammar_notes || []), ...(feedback.improvements || [])];
    if (newGaps.length) {
      dispatch({ type: 'MERGE_PLACEMENT_GAPS', payload: newGaps });
    }
    if (typeof feedback.overall_score === 'number') {
      dispatch({ type: 'ADJUST_LEVEL', payload: { score: feedback.overall_score } });
    }
  }, [dispatch]);

  const {
    messages, suggestedReplies, phase, turnCount, MAX_TURNS,
    isSpeaking, handleUserMessage, retryReply, endConversation, replayMessage, logHelpUsed,
  } = useRolePlay({
    topic: activeSession?.topic,
    sessionId: activeSession?.id,
    savedChat: savedChat || activeSession?.initialChat,
    chatDifficulty,
    ttsSpeed,
    placement: state.placement,
    userId: state.user?.id,
    userName: state.user?.name,
    onPersist: handlePersist,
    onSessionComplete: handleSessionComplete,
  });

  useEffect(() => {
    if (activeSession) {
      document.documentElement.classList.add('immersive-chat');
      return () => document.documentElement.classList.remove('immersive-chat');
    }
  }, [activeSession]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, phase, suggestedReplies]);

  const startNewChat = (topic) => {
    setActiveSession({ id: createSessionId(), topic, initialChat: null });
  };

  const resumeChat = (chat) => {
    const topic = getTopicById(chat.topicId, customTopics) || chat.topic;
    if (!topic) return;
    setActiveSession({ id: chat.id, topic, initialChat: chat, isResume: true });
  };

  const handleNewChatSameTopic = () => {
    if (!activeSession?.topic) return;
    startNewChat(activeSession.topic);
  };

  const handleBack = () => setActiveSession(null);

  const handleDeleteChat = (id) => {
    if (window.confirm('למחוק את השיחה?')) {
      dispatch({ type: 'DELETE_ROLEPLAY_CHAT', payload: id });
      if (activeSession?.id === id) setActiveSession(null);
    }
  };

  if (!activeSession) {
    return (
      <RolePlayHome
        topics={allTopics}
        chats={chats}
        onSelectTopic={startNewChat}
        onResumeChat={resumeChat}
        onDeleteChat={handleDeleteChat}
        onAddTopic={(topic) => dispatch({ type: 'ADD_CUSTOM_TOPIC', payload: topic })}
        onDeleteTopic={(id) => {
          if (window.confirm('למחוק את הנושא ואת כל השיחות שלו?')) {
            dispatch({ type: 'DELETE_CUSTOM_TOPIC', payload: id });
          }
        }}
      />
    );
  }

  const { topic } = activeSession;

  if (phase === 'DONE') {
    const isReview = activeSession.isResume && savedChat?.status === 'completed' && messages.length > 0;
    if (isReview) {
      return (
        <SavedChatReview
          messages={messages}
          topic={topic}
          savedChat={savedChat}
          showTranslation={showTranslation}
          onReplay={replayMessage}
          onNewChat={handleNewChatSameTopic}
          onBack={handleBack}
          onHome={() => navigate('/')}
        />
      );
    }
    return (
      <DoneScreen
        turnCount={turnCount}
        topic={topic}
        messages={messages}
        chatId={activeSession.id}
        savedFeedback={savedChat?.feedback}
        onNewChat={handleNewChatSameTopic}
        onBack={handleBack}
        onHome={() => navigate('/')}
        onFeedbackSaved={handleFeedbackSaved}
      />
    );
  }

  return (
    <div className="chat-shell">
      <div className="chat-shell-header">
        <button onClick={handleBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          ←
        </button>
        <span style={{ fontWeight: 600, color: '#1E1B4B', fontSize: 15, textAlign: 'center', flex: 1, padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {topic.emoji} {topic.title}
        </span>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <button
            onClick={() => setShowTranslation(v => !v)}
            title={showTranslation ? 'הסתר תרגום' : 'הצג תרגום'}
            style={{
              background: showTranslation ? '#EEF0FF' : '#F3F4F6',
              border: 'none', borderRadius: 8,
              color: '#6C63FF', fontSize: 14, padding: '8px', cursor: 'pointer',
              minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            {showTranslation ? '🙈' : '👁️'}
          </button>
          <button
            onClick={() => {
              if (window.confirm('להתחיל שיחה חדשה? השיחה הנוכחית תישמר.')) {
                startNewChat(topic);
              }
            }}
            style={{
              background: '#EEF0FF', border: 'none', borderRadius: 8,
              color: '#6C63FF', fontSize: 11, fontWeight: 600, padding: '8px 10px', cursor: 'pointer',
              minHeight: 36
            }}
          >
            חדש
          </button>
          <button
            onClick={endConversation}
            style={{
              background: 'none', border: '1.5px solid #EF4444', borderRadius: 8,
              color: '#EF4444', fontSize: 11, fontWeight: 600, padding: '8px 10px', cursor: 'pointer',
              minHeight: 36
            }}
          >
            סיים
          </button>
        </div>
      </div>

      <div style={{ padding: '6px 16px', backgroundColor: '#F8F9FF', flexShrink: 0 }}>
        <div style={{ height: 4, backgroundColor: '#EEF0FF', borderRadius: 99 }}>
          <div style={{
            height: '100%', borderRadius: 99, backgroundColor: '#6C63FF',
            width: `${(turnCount / MAX_TURNS) * 100}%`, transition: 'width 0.3s'
          }} />
        </div>
        <p style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', marginTop: 4, marginBottom: 0 }}>
          <span dir="ltr">{turnCount}/{MAX_TURNS}</span> תורות
        </p>
      </div>

      <div className="chat-shell-messages">
        {messages.map((msg, i) => (
          <ConversationBubble
            key={i}
            message={msg}
            topicEmoji={topic.emoji}
            onReplay={(text) => { logHelpUsed(); replayMessage(text); }}
            showTranslation={showTranslation}
            isSpeaking={isSpeaking}
          />
        ))}
        {phase === 'AI_THINKING' && <ThinkingBubble topicEmoji={topic.emoji} />}
        {phase === 'REPLY_FAILED' && <ReplyFailedBubble topicEmoji={topic.emoji} onRetry={retryReply} />}
        <div ref={chatBottomRef} />
      </div>

      {phase === 'USER_TURN' && suggestedReplies.length > 0 && (
        <SuggestedReplies
          replies={suggestedReplies}
          onSelect={(text) => { logHelpUsed(); handleUserMessage(text); }}
          disabled={phase !== 'USER_TURN'}
          showTranslation={showTranslation}
        />
      )}

      <div className="chat-shell-footer">
        <HowDoYouSay
          disabled={phase !== 'USER_TURN'}
          onTranslated={(text) => { logHelpUsed(); setInsertText(text); }}
        />
        <MicButton
          phase={phase}
          onSpoke={handleUserMessage}
          insertText={insertText}
          onInsertConsumed={() => setInsertText('')}
        />
      </div>
    </div>
  );
}
