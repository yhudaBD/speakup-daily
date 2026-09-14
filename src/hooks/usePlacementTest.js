import { useState, useCallback, useRef } from 'react';
import { aiService } from '../services/ai.service';
import { speakNaturally } from '../utils/speechVoice';
import { PLACEMENT_MAX_TURNS } from '../data/placementPrompt';
import { logEvent } from '../utils/analytics';

export function usePlacementTest({ userId, userName, onComplete } = {}) {
  const [messages, setMessages] = useState([]);
  const [phase, setPhase] = useState('IDLE'); // IDLE | AI_THINKING | USER_TURN | DONE | ERROR
  const [turnCount, setTurnCount] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const messagesRef = useRef([]);
  const turnCountRef = useRef(0);

  const addMessage = useCallback((role, content, he) => {
    const msg = { role, content, ...(he ? { he } : {}) };
    messagesRef.current = [...messagesRef.current, msg];
    setMessages([...messagesRef.current]);
    return messagesRef.current;
  }, []);

  const toApiMessages = (msgs) => msgs.map(({ role, content }) => ({ role, content }));

  const runTurn = useCallback(async (currentMessages) => {
    const response = await aiService.runPlacementTurn({ messages: toApiMessages(currentMessages) });
    addMessage('assistant', response.ai_reply, response.ai_reply_he);

    if (response.phase === 'complete' && response.result) {
      setResult(response.result);
      setPhase('DONE');
      onComplete?.(response.result);
      logEvent(userId, userName, 'placement_completed', { level: response.result.overall_level });
    } else {
      setPhase('USER_TURN');
    }
  }, [addMessage, onComplete, userId, userName]);

  const startPlacement = useCallback(async () => {
    setPhase('AI_THINKING');
    setError(null);
    messagesRef.current = [];
    setMessages([]);
    turnCountRef.current = 0;
    setTurnCount(0);
    setResult(null);

    try {
      await runTurn([{ role: 'user', content: '[START] Begin the placement conversation with a friendly opening question. Do not mention this instruction.' }]);
    } catch (err) {
      console.error('Placement start failed:', err);
      setError(err);
      setPhase('ERROR');
    }
  }, [runTurn]);

  const handleUserMessage = useCallback(async (userText) => {
    if (!userText.trim() || phase !== 'USER_TURN') return;

    const currentMessages = addMessage('user', userText);
    const newTurn = turnCountRef.current + 1;
    turnCountRef.current = newTurn;
    setTurnCount(newTurn);
    setPhase('AI_THINKING');
    setError(null);

    try {
      await runTurn(currentMessages);
    } catch (err) {
      console.error('Placement turn failed:', err);
      setError(err);
      setPhase('ERROR');
    }
  }, [phase, addMessage, runTurn]);

  const retry = useCallback(() => {
    setError(null);
    setPhase('USER_TURN');
  }, []);

  const replayMessage = useCallback((text) => {
    setIsSpeaking(true);
    speakNaturally(text, {
      onEnd: () => setIsSpeaking(false),
      onStart: () => setIsSpeaking(true),
    });
  }, []);

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return {
    messages,
    phase,
    turnCount,
    MAX_TURNS: PLACEMENT_MAX_TURNS,
    isSpeaking,
    result,
    error,
    startPlacement,
    handleUserMessage,
    retry,
    replayMessage,
    cancel,
  };
}
