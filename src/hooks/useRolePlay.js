import { useState, useCallback, useRef, useEffect } from 'react';
import { aiService, isAbortError } from '../services/ai.service';
import { speakNaturally, getBestEnglishVoice, preloadVoices } from '../utils/speechVoice';
import { logEvent } from '../utils/analytics';

const MAX_TURNS = 10;

export function useRolePlay({
  topic,
  sessionId,
  savedChat,
  chatDifficulty = 'easy',
  ttsSpeed = 1.0,
  placement = null,
  userId,
  userName,
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
  const helpUsedCountRef = useRef(0);
  // The in-flight AI request, if any. Starting a new chat (or resetting,
  // ending, leaving) aborts it. Otherwise its late reply landed in whatever
  // conversation was current by then, and was saved under the old chat's id
  // along with the new chat's messages.
  const requestRef = useRef(null);

  const setPhaseSafe = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const beginRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = new AbortController();
    return requestRef.current.signal;
  }, []);

  const cancelRequest = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  useEffect(() => cancelRequest, [cancelRequest]);

  // Called by the UI whenever a help wheel is used (suggested reply, slow
  // replay, "how do you say?") so Progress.jsx can show the trend of fewer
  // taps needed over time — a proxy for growing confidence (brief 5.4).
  const logHelpUsed = useCallback(() => {
    helpUsedCountRef.current += 1;
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
      helpUsedCount: helpUsedCountRef.current,
      completedAt: new Date().toISOString(),
    });
    logEvent(userId, userName, 'session_ended', {
      kind: 'roleplay',
      topicId: topic?.id,
      topicTitle: topic?.title,
      turnCount: finalTurnCount,
      helpUsedCount: helpUsedCountRef.current,
      currentLevel: placement?.overall_level || null,
    });
  }, [sessionId, topic, onSessionComplete, userId, userName, placement]);

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

  const fetchAiReply = useCallback(async (currentMessages, signal) => {
    const response = await aiService.sendMessage({
      systemPrompt: topic.systemPrompt,
      messages: toApiMessages(currentMessages),
      chatDifficulty,
      placement,
      signal,
    });
    if (signal.aborted) return null;
    addMessage('assistant', response.ai_reply, response.ai_reply_he);
    setSuggestedReplies(response.suggested_user_responses || []);
    return response;
  }, [topic, toApiMessages, chatDifficulty, placement, addMessage]);

  // Gets the AI's answer to the conversation so far and hands the turn back
  // to the user. Used after the user speaks, and when resuming a chat whose
  // last message never got an answer. On failure the phase becomes
  // REPLY_FAILED and nothing is added: the UI offers retryReply(). It used
  // to insert a canned "Got it. How can I help you further?" as if the
  // character had said it.
  const requestReply = useCallback(async (currentMessages, turn) => {
    setPhaseSafe('AI_THINKING');
    const signal = beginRequest();

    try {
      await fetchAiReply(currentMessages, signal);
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      console.error('AI reply failed:', err);
      setPhaseSafe('REPLY_FAILED');
      return;
    }
    if (signal.aborted) return;

    setPhaseSafe('USER_TURN');
    syncToStorage({ turnCount: turn, status: 'active' });
  }, [beginRequest, fetchAiReply, setPhaseSafe, syncToStorage]);

  // The character's first line. Same failure handling as requestReply.
  const requestOpening = useCallback(async () => {
    setPhaseSafe('AI_THINKING');
    const signal = beginRequest();

    try {
      const response = await aiService.sendMessage({
        systemPrompt: topic.systemPrompt,
        messages: [{ role: 'user', content: '[START] Begin the roleplay with a natural opening line as your character. Do not mention this instruction.' }],
        chatDifficulty,
        placement,
        signal,
      });
      if (signal.aborted) return;
      addMessage('assistant', response.ai_reply, response.ai_reply_he);
      setSuggestedReplies(response.suggested_user_responses || []);
    } catch (err) {
      if (isAbortError(err) || signal.aborted) return;
      console.error('AI opening line failed:', err);
      setPhaseSafe('REPLY_FAILED');
      return;
    }
    setPhaseSafe('USER_TURN');
    syncToStorage({ status: 'active' });
  }, [topic, chatDifficulty, placement, addMessage, beginRequest, setPhaseSafe, syncToStorage]);

  // After REPLY_FAILED: with no messages yet it was the opening line that
  // failed; otherwise the answer to the user's last message.
  const retryReply = useCallback(() => {
    if (phaseRef.current !== 'REPLY_FAILED') return;
    if (messagesRef.current.length === 0) requestOpening();
    else requestReply(messagesRef.current, turnCountRef.current);
  }, [requestOpening, requestReply]);

  const startConversation = useCallback(async () => {
    if (!topic) return;

    setPhaseSafe('AI_THINKING');
    messagesRef.current = [];
    setMessages([]);
    setSuggestedReplies([]);
    turnCountRef.current = 0;
    setTurnCount(0);
    sessionSavedRef.current = false;
    helpUsedCountRef.current = 0;
    logEvent(userId, userName, 'session_started', {
      kind: 'roleplay',
      topicId: topic.id,
      currentLevel: placement?.overall_level || null,
    });

    await requestOpening();
  }, [topic, placement, setPhaseSafe, userId, userName, requestOpening]);

  const resumeConversation = useCallback((chat) => {
    if (!chat?.messages?.length) return false;

    // The saved turnCount can lag one behind when the chat was left before
    // the AI answered, so count the user's messages as well.
    const userTurns = chat.messages.filter((m) => m.role === 'user').length;
    const turns = Math.max(chat.turnCount || 0, userTurns);
    messagesRef.current = [...chat.messages];
    setMessages([...chat.messages]);
    turnCountRef.current = turns;
    setTurnCount(turns);
    setSuggestedReplies([]);
    sessionSavedRef.current = chat.status === 'completed';

    if (chat.status === 'completed' || turns >= MAX_TURNS) {
      setPhaseSafe('DONE');
    } else if (chat.messages[chat.messages.length - 1].role === 'user') {
      // Left (or the tab closed) while the AI was still answering. Ask again
      // rather than leaving the user facing their own unanswered message.
      requestReply(chat.messages, turns);
    } else {
      setPhaseSafe('USER_TURN');
    }
    return true;
  }, [setPhaseSafe, requestReply]);

  const resetConversation = useCallback(() => {
    window.speechSynthesis.cancel();
    cancelRequest();
    messagesRef.current = [];
    setMessages([]);
    setSuggestedReplies([]);
    turnCountRef.current = 0;
    setTurnCount(0);
    initializedRef.current = false;
    sessionSavedRef.current = false;
    startConversation();
  }, [startConversation, cancelRequest]);

  useEffect(() => {
    initializedRef.current = false;
    sessionSavedRef.current = false;
    cancelRequest();
  }, [sessionId, cancelRequest]);

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

    await requestReply(currentMessages, newTurn);
  }, [topic, addMessage, requestReply, setPhaseSafe, syncToStorage, completeSession]);

  const endConversation = useCallback(() => {
    window.speechSynthesis.cancel();
    cancelRequest();
    setPhaseSafe('DONE');
    syncToStorage({ status: 'completed' });
    completeSession(turnCountRef.current);
  }, [setPhaseSafe, syncToStorage, completeSession, cancelRequest]);

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
    retryReply,
    endConversation,
    replayMessage,
    resetConversation,
    resumeConversation,
    logHelpUsed,
  };
};
