import { useState, useCallback, useRef, useEffect } from 'react';
import { aiService } from '../services/ai.service';
import { speakNaturally, getBestEnglishVoice, preloadVoices } from '../utils/speechVoice';

const MAX_TURNS = 10;

export function useRolePlay({
  topic,
  sessionId,
  savedChat,
  chatDifficulty = 'easy',
  ttsSpeed = 1.0,
  onPersist,
  onSessionComplete,
}) {
  const [messages, setMessages] = useState([]);
  const [suggestedReplies, setSuggestedReplies] = useState([]);
  const [phase, setPhase] = useState('IDLE');
  const [turnCount, setTurnCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesRef = useRef([]);
  const turnCountRef = useRef(0);
  const phaseRef = useRef('IDLE');
  const initializedRef = useRef(false);
  const sessionSavedRef = useRef(false);

  const setPhaseSafe = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const syncToStorage = useCallback((overrides = {}) => {
    if (!sessionId || !topic || !onPersist) return;
    const status = overrides.status
      ?? (phaseRef.current === 'DONE' ? 'completed' : 'active');
    onPersist({
      id: sessionId,
      topicId: topic.id,
      topic: {
        id: topic.id,
        emoji: topic.emoji,
        title: topic.title,
        description: topic.description,
        difficulty: topic.difficulty,
        systemPrompt: topic.systemPrompt,
        isCustom: topic.isCustom || false,
      },
      messages: overrides.messages ?? messagesRef.current,
      turnCount: overrides.turnCount ?? turnCountRef.current,
      status,
      createdAt: savedChat?.createdAt || overrides.createdAt || new Date().toISOString(),
    });
  }, [sessionId, topic, onPersist, savedChat?.createdAt]);

  const completeSession = useCallback((finalTurnCount) => {
    if (sessionSavedRef.current || !onSessionComplete) return;
    sessionSavedRef.current = true;
    onSessionComplete({
      chatId: sessionId,
      topicId: topic?.id,
      topicTitle: topic?.title,
      emoji: topic?.emoji,
      turnCount: finalTurnCount,
      completedAt: new Date().toISOString(),
    });
  }, [sessionId, topic, onSessionComplete]);

  const addMessage = useCallback((role, content, he) => {
    const msg = { role, content, ...(he ? { he } : {}) };
    messagesRef.current = [...messagesRef.current, msg];
    setMessages([...messagesRef.current]);
    syncToStorage({ messages: messagesRef.current });
    return messagesRef.current;
  }, [syncToStorage]);

  const toApiMessages = useCallback((msgs) =>
    msgs.map(({ role, content }) => ({ role, content })),
  []);

  const fetchAiReply = useCallback(async (currentMessages) => {
    const response = await aiService.sendMessage({
      systemPrompt: topic.systemPrompt,
      messages: toApiMessages(currentMessages),
      chatDifficulty,
    });
    addMessage('assistant', response.ai_reply, response.ai_reply_he);
    setSuggestedReplies(response.suggested_user_responses || []);
    return response;
  }, [topic, toApiMessages, chatDifficulty, addMessage]);

  const startConversation = useCallback(async () => {
    if (!topic) return;

    setPhaseSafe('AI_THINKING');
    messagesRef.current = [];
    setMessages([]);
    setSuggestedReplies([]);
    turnCountRef.current = 0;
    setTurnCount(0);
    sessionSavedRef.current = false;

    try {
      await aiService.sendMessage({
        systemPrompt: topic.systemPrompt,
        messages: [{ role: 'user', content: '[START] Begin the roleplay with a natural opening line as your character. Do not mention this instruction.' }],
        chatDifficulty,
      }).then((response) => {
        addMessage('assistant', response.ai_reply, response.ai_reply_he);
        setSuggestedReplies(response.suggested_user_responses || []);
      });
    } catch (err) {
      console.error(err);
      const fallback = "Hi there! Welcome. How can I help you today?";
      addMessage('assistant', fallback, "היי! ברוכים הבאים. איך אוכל לעזור לך היום?");
      if (chatDifficulty !== 'hard') {
        setSuggestedReplies([
          { en: "Hi! I need some help.", he: "היי! אני צריך עזרה." },
          { en: "Hello! Just looking around.", he: "שלום! רק מסתכלים." },
        ]);
      }
    }
    setPhaseSafe('USER_TURN');
    syncToStorage({ status: 'active' });
  }, [topic, chatDifficulty, addMessage, setPhaseSafe, syncToStorage]);

  const resumeConversation = useCallback((chat) => {
    if (!chat?.messages?.length) return false;

    messagesRef.current = [...chat.messages];
    setMessages([...chat.messages]);
    turnCountRef.current = chat.turnCount || 0;
    setTurnCount(chat.turnCount || 0);
    setSuggestedReplies([]);
    sessionSavedRef.current = chat.status === 'completed';

    if (chat.status === 'completed' || (chat.turnCount || 0) >= MAX_TURNS) {
      setPhaseSafe('DONE');
    } else {
      setPhaseSafe('USER_TURN');
    }
    return true;
  }, [setPhaseSafe]);

  const resetConversation = useCallback(() => {
    window.speechSynthesis.cancel();
    messagesRef.current = [];
    setMessages([]);
    setSuggestedReplies([]);
    turnCountRef.current = 0;
    setTurnCount(0);
    initializedRef.current = false;
    sessionSavedRef.current = false;
    startConversation();
  }, [startConversation]);

  useEffect(() => {
    initializedRef.current = false;
    sessionSavedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    preloadVoices();
    const synth = window.speechSynthesis;
    const handleVoicesChanged = () => getBestEnglishVoice();
    handleVoicesChanged();
    synth.addEventListener('voiceschanged', handleVoicesChanged);
    return () => synth.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  useEffect(() => {
    if (!topic || !sessionId) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (savedChat?.messages?.length) {
      resumeConversation(savedChat);
    } else {
      startConversation();
    }
  }, [topic, sessionId, savedChat, resumeConversation, startConversation]);

  const handleUserMessage = useCallback(async (userText) => {
    if (!userText.trim() || !topic) return;
    if (phaseRef.current !== 'USER_TURN') return;

    setSuggestedReplies([]);

    const currentMessages = addMessage('user', userText);
    const newTurn = turnCountRef.current + 1;
    turnCountRef.current = newTurn;
    setTurnCount(newTurn);

    if (newTurn >= MAX_TURNS) {
      setPhaseSafe('DONE');
      syncToStorage({ turnCount: newTurn, status: 'completed' });
      completeSession(newTurn);
      return;
    }

    setPhaseSafe('AI_THINKING');

    try {
      await fetchAiReply(currentMessages);
    } catch (err) {
      console.error(err);
      const fallback = "Got it. How can I help you further?";
      addMessage('assistant', fallback, "הבנתי. איך אוכל לעזור לך עוד?");
      if (chatDifficulty !== 'hard') {
        setSuggestedReplies([
          { en: "I have a question.", he: "יש לי שאלה." },
          { en: "That is all, thank you.", he: "זה הכל, תודה." },
        ]);
      }
    }

    setPhaseSafe('USER_TURN');
    syncToStorage({ turnCount: newTurn, status: 'active' });
  }, [topic, addMessage, fetchAiReply, chatDifficulty, setPhaseSafe, syncToStorage, completeSession]);

  const endConversation = useCallback(() => {
    window.speechSynthesis.cancel();
    setPhaseSafe('DONE');
    syncToStorage({ status: 'completed' });
    completeSession(turnCountRef.current);
  }, [setPhaseSafe, syncToStorage, completeSession]);

  const replayMessage = useCallback((text) => {
    setIsSpeaking(true);
    speakNaturally(text, {
      rate: ttsSpeed,
      onEnd: () => setIsSpeaking(false),
      onStart: () => setIsSpeaking(true),
    });
  }, [ttsSpeed]);

  return {
    messages,
    suggestedReplies,
    phase,
    turnCount,
    MAX_TURNS,
    isSpeaking,
    handleUserMessage,
    endConversation,
    replayMessage,
    resetConversation,
    resumeConversation,
  };
};
