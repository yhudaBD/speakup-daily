import { useCallback, useEffect, useRef, useState } from "react";
import { getSupportedAudioMimeType } from "../utils/device";

// Records one audio clip for keeping, not transcribing: the "day 1"
// recording (T5 in ACTION_PLAN.md). useVoiceInput records to transcribe and
// throws the audio away; this keeps it, with its format (iOS records
// audio/mp4, Chrome audio/webm) and duration, and stops by itself at `maxMs`.

function micErrorMessage(err) {
  if (err?.name === "NotAllowedError") {
    return "צריך לאשר גישה למיקרופון — בדפדפן או בהגדרות האייפון/אנדרואיד";
  }
  if (err?.name === "NotFoundError") return "לא נמצא מיקרופון במכשיר";
  if (typeof MediaRecorder === "undefined") return "הדפדפן הזה לא תומך בהקלטה";
  return "לא הצלחנו להתחיל להקליט. נסה שוב";
}

export function useAudioRecorder({ maxMs }) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState(null);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const limitRef = useRef(null);

  const clearTimers = () => {
    clearInterval(tickRef.current);
    clearTimeout(limitRef.current);
  };
  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current?.state === "recording") return;
    setError(null);
    setRecording(null);
    try {
      const mimeType = getSupportedAudioMimeType();
      if (!mimeType) throw new Error("MediaRecorder unsupported");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        clearTimers();
        releaseMic();
        const durationMs = Math.min(maxMs, Date.now() - startedAtRef.current);
        setIsRecording(false);
        setElapsedMs(durationMs);
        setRecording({ blob: new Blob(chunksRef.current, { type: mimeType }), mimeType, durationMs });
        recorderRef.current = null;
      };
      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);
      tickRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      limitRef.current = setTimeout(stop, maxMs);
    } catch (err) {
      clearTimers();
      releaseMic();
      recorderRef.current = null;
      setIsRecording(false);
      setError(micErrorMessage(err));
    }
  }, [maxMs, stop]);

  const reset = useCallback(() => {
    setRecording(null);
    setElapsedMs(0);
    setError(null);
  }, []);

  // Leaving the screen mid-recording releases the mic.
  useEffect(() => () => {
    clearTimers();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    releaseMic();
  }, []);

  return { isRecording, elapsedMs, recording, error, start, stop, reset };
}
