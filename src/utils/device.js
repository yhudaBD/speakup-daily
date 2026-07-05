export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid() {
  return /Android/i.test(navigator.userAgent);
}

export function isMobile() {
  return isIOS() || isAndroid();
}

export function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

/** Mobile browsers: MediaRecorder + Whisper is far more reliable than Web Speech API */
export function shouldUseAudioRecorder() {
  if (typeof MediaRecorder === "undefined") return false;
  if (!getSupportedAudioMimeType()) return false;
  return isMobile();
}
