import { useState, useCallback } from "react";
import { useVoiceInput } from "./useVoiceInput";

/**
 * Practice page API — wraps useVoiceInput for record-then-transcribe flow.
 * On mobile: MediaRecorder + Groq Whisper (reliable).
 * On desktop: Web Speech API with mic warmup.
 */
export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");

  const handleResult = useCallback((text) => {
    setTranscript(text);
  }, []);

  const {
    isRecording,
    isTranscribing,
    liveTranscript,
    error,
    speechSupported: isSupported,
    startRecording,
    stopRecording,
  } = useVoiceInput({
    onResult: handleResult,
    enabled: true,
    silenceAutoStop: true,
  });

  const isListening = isRecording || isTranscribing;

  const start = useCallback(() => {
    setTranscript("");
    startRecording();
  }, [startRecording]);

  const stop = useCallback(() => {
    stopRecording();
  }, [stopRecording]);

  return {
    transcript,
    liveTranscript,
    isListening,
    isRecording,
    isTranscribing,
    error,
    isSupported,
    start,
    stop,
  };
}
