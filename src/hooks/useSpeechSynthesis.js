import { useCallback, useEffect, useRef } from "react";
import { preloadVoices, speakNaturally } from "../utils/speechVoice";

export function useSpeechSynthesis() {
  const speakingRef = useRef(false);

  useEffect(() => {
    preloadVoices();
  }, []);

  const speak = useCallback((text, { rate = 0.92, onEnd, onStart } = {}) => {
    speakingRef.current = true;
    return speakNaturally(text, {
      rate,
      onStart,
      onEnd: () => {
        speakingRef.current = false;
        onEnd?.();
      },
    });
  }, []);

  const cancel = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    speakingRef.current = false;
  }, []);

  return { speak, cancel };
}
