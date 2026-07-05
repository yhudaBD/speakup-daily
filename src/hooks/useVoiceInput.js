import { useState, useRef, useCallback, useEffect } from "react";
import { aiService } from "../services/ai.service";
import {
  getSpeechRecognitionCtor,
  getSupportedAudioMimeType,
  shouldUseAudioRecorder,
  isIOS,
} from "../utils/device";

const SILENCE_AUTO_STOP_MS = 1800;
const MAX_RECORDING_MS = 30000;

function micErrorMessage(err) {
  if (err?.name === "NotAllowedError" || err?.error === "not-allowed") {
    return "צריך לאשר גישה למיקרופון — בדפדפן או בהגדרות האייפון/אנדרואיד";
  }
  if (err?.name === "NotFoundError") {
    return "לא נמצא מיקרופון במכשיר";
  }
  if (err?.error === "network") {
    return "בעיית רשת — בדוק חיבור לאינטרנט";
  }
  return "שגיאה במיקרופון. נסה שוב או הקלד את ההודעה";
}

function stopStream(streamRef) {
  streamRef.current?.getTracks().forEach((t) => t.stop());
  streamRef.current = null;
}

export function useVoiceInput({
  onResult,
  enabled = true,
  silenceAutoStop = true,
  silenceMs = SILENCE_AUTO_STOP_MS,
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [error, setError] = useState(null);

  const useRecorder = shouldUseAudioRecorder();
  const speechSupported = !!getSpeechRecognitionCtor() || useRecorder;

  const recognitionRef = useRef(null);
  const previewRecognitionRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const finalTranscriptRef = useRef("");
  const previewTranscriptRef = useRef("");
  const isRecordingRef = useRef(false);
  const maxDurationTimerRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const mimeTypeRef = useRef("");
  const stopRecordingRef = useRef(() => {});

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const updateLiveDisplay = useCallback((text) => {
    setLiveTranscript(text.trim());
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (!silenceAutoStop || !isRecordingRef.current) return;
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      const hasText = finalTranscriptRef.current.trim() || previewTranscriptRef.current.trim();
      if (isRecordingRef.current && hasText) {
        stopRecordingRef.current();
      }
    }, silenceMs);
  }, [silenceAutoStop, silenceMs, clearSilenceTimer]);

  const abortRecognition = useCallback((ref) => {
    try { ref.current?.abort(); } catch { /* ignore */ }
    ref.current = null;
  }, []);

  const releaseMic = useCallback(() => {
    clearMaxDurationTimer();
    clearSilenceTimer();
    isRecordingRef.current = false;
    setIsRecording(false);
    abortRecognition(recognitionRef);
    abortRecognition(previewRecognitionRef);
    if (recorderRef.current?.state === "recording") {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    stopStream(streamRef);
  }, [clearMaxDurationTimer, clearSilenceTimer, abortRecognition]);

  useEffect(() => () => releaseMic(), [releaseMic]);

  const warmupMic = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getTracks().forEach((t) => t.stop());
  }, []);

  const finishWithText = useCallback((text) => {
    finalTranscriptRef.current = "";
    previewTranscriptRef.current = "";
    setLiveTranscript("");
    if (text?.trim()) onResult?.(text.trim());
  }, [onResult]);

  const applyRecognitionResult = useCallback((e, { previewOnly = false } = {}) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const part = e.results[i][0].transcript;
      if (e.results[i].isFinal) {
        if (previewOnly) {
          previewTranscriptRef.current = `${previewTranscriptRef.current} ${part}`.trim();
        } else {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${part}`.trim();
        }
      } else {
        interim += part;
      }
    }

    const base = previewOnly ? previewTranscriptRef.current : finalTranscriptRef.current;
    const display = `${base}${interim ? ` ${interim}` : ""}`.trim();
    updateLiveDisplay(display);
    resetSilenceTimer();
  }, [updateLiveDisplay, resetSilenceTimer]);

  const createRecognitionHandlers = useCallback((recognition, { previewOnly = false } = {}) => {
    recognition.onresult = (e) => applyRecognitionResult(e, { previewOnly });

    recognition.onerror = (e) => {
      if (e.error === "aborted" || e.error === "no-speech") return;
      if (previewOnly) return;
      console.error("Speech recognition error:", e.error);
      setError(micErrorMessage(e));
      if (isRecordingRef.current) stopRecordingRef.current();
    };

    recognition.onspeechend = () => {
      if (silenceAutoStop && isRecordingRef.current) {
        resetSilenceTimer();
      }
    };

    recognition.onend = () => {
      if (!isRecordingRef.current) return;
      if (previewOnly) {
        setTimeout(() => {
          try { previewRecognitionRef.current?.start(); } catch { /* already running */ }
        }, 200);
        return;
      }
      if (!isIOS()) {
        setTimeout(() => {
          try { recognitionRef.current?.start(); } catch { /* already running */ }
        }, 200);
      }
    };
  }, [applyRecognitionResult, silenceAutoStop, resetSilenceTimer]);

  const startPreviewRecognition = useCallback(async () => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) return;

    try {
      const recognition = new SR();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      previewTranscriptRef.current = "";
      createRecognitionHandlers(recognition, { previewOnly: true });
      previewRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      abortRecognition(previewRecognitionRef);
    }
  }, [createRecognitionHandlers, abortRecognition]);

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    clearMaxDurationTimer();
    clearSilenceTimer();

    if (useRecorder && recorderRef.current?.state === "recording") {
      isRecordingRef.current = false;
      setIsRecording(false);
      abortRecognition(previewRecognitionRef);
      recorderRef.current.stop();
      return;
    }

    isRecordingRef.current = false;
    setIsRecording(false);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    const text = finalTranscriptRef.current.trim();
    finalTranscriptRef.current = "";
    previewTranscriptRef.current = "";
    setLiveTranscript("");
    finishWithText(text);
    abortRecognition(recognitionRef);
    stopStream(streamRef);
  }, [useRecorder, clearMaxDurationTimer, clearSilenceTimer, finishWithText, abortRecognition]);

  stopRecordingRef.current = stopRecording;

  const startMediaRecorder = useCallback(async () => {
    const mimeType = getSupportedAudioMimeType();
    if (!mimeType) {
      setError("הדפדפן לא תומך בהקלטת קול");
      return;
    }

    mimeTypeRef.current = mimeType;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopStream(streamRef);
      const previewText = previewTranscriptRef.current.trim();
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      chunksRef.current = [];

      if (blob.size < 500) {
        if (previewText) {
          finishWithText(previewText);
          return;
        }
        setError("לא נקלט קול. נסה לדבר קרוב יותר למיקרופון");
        return;
      }

      setIsTranscribing(true);
      setError(null);
      try {
        const text = await aiService.transcribeAudio(blob, mimeTypeRef.current);
        if (text) {
          finishWithText(text);
        } else if (previewText) {
          finishWithText(previewText);
        } else {
          setError("לא זוהה דיבור. נסה שוב");
        }
      } catch (err) {
        console.error("Transcription failed:", err);
        if (previewText) {
          finishWithText(previewText);
        } else {
          setError(micErrorMessage(err));
        }
      } finally {
        setIsTranscribing(false);
        previewTranscriptRef.current = "";
      }
    };

    recorder.onerror = () => {
      setError(micErrorMessage({}));
      releaseMic();
    };

    recorderRef.current = recorder;
    recorder.start(250);
    isRecordingRef.current = true;
    setIsRecording(true);
    setLiveTranscript("");
    setError(null);

    await startPreviewRecognition();
    maxDurationTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
  }, [finishWithText, releaseMic, stopRecording, startPreviewRecognition]);

  const startSpeechRecognition = useCallback(async () => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) {
      setError("הדפדפן לא תומך בזיהוי דיבור");
      return;
    }

    try {
      await warmupMic();
    } catch (err) {
      setError(micErrorMessage(err));
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.continuous = !isIOS();
    recognition.interimResults = true;

    finalTranscriptRef.current = "";
    setLiveTranscript("");
    isRecordingRef.current = true;
    createRecognitionHandlers(recognition);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsRecording(true);
      setError(null);
      maxDurationTimerRef.current = setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    } catch (err) {
      setError(micErrorMessage(err));
      isRecordingRef.current = false;
      setIsRecording(false);
    }
  }, [warmupMic, stopRecording, createRecognitionHandlers]);

  const startRecording = useCallback(async () => {
    if (!enabled || isRecordingRef.current || isTranscribing) return;
    setError(null);

    try {
      if (useRecorder) {
        await startMediaRecorder();
      } else {
        await startSpeechRecognition();
      }
    } catch (err) {
      console.error("startRecording failed:", err);
      setError(micErrorMessage(err));
      releaseMic();
    }
  }, [enabled, isTranscribing, useRecorder, startMediaRecorder, startSpeechRecognition, releaseMic]);

  const clearError = useCallback(() => setError(null), []);

  return {
    isRecording,
    isTranscribing,
    liveTranscript,
    error,
    speechSupported,
    useRecorder,
    startRecording,
    stopRecording,
    clearError,
  };
}
