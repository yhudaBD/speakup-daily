import { useCallback, useEffect, useRef, useState } from "react";
import { aiService } from "../services/ai.service";
import { MIN_OWN_TURNS_FOR_LEVEL, ownTurns } from "../context/selectors";

// The analysis of a conversation that just ended. It runs by itself when the
// user took at least MIN_OWN_TURNS_FOR_LEVEL turns of their own, the same
// conversations that may move the level, so the level no longer depends on
// which conversations the user chose to analyze (CRITICAL_REVIEW.md §14).
// Shorter ones are analyzed only when the user asks.
export function useConversationAnalysis({ chatId, messages, topicTitle, savedFeedback, onSaved }) {
  const [feedback, setFeedback] = useState(savedFeedback || null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const startedRef = useRef(false);

  const analyze = useCallback(async () => {
    startedRef.current = true;
    setAnalyzing(true);
    setError(null);
    try {
      const result = await aiService.analyzeConversation({ messages, topicTitle });
      setFeedback(result);
      onSaved?.(chatId, result);
    } catch (err) {
      console.error(err);
      setError("לא הצלחנו לנתח את השיחה. נסה שוב.");
    } finally {
      setAnalyzing(false);
    }
  }, [chatId, messages, topicTitle, onSaved]);

  const auto = !savedFeedback && ownTurns(messages) >= MIN_OWN_TURNS_FOR_LEVEL;
  useEffect(() => {
    if (auto && !startedRef.current) analyze();
  }, [auto, analyze]);

  return { feedback, analyzing, error, analyze, auto };
}
