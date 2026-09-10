// Ordered best-first. These are free, built-in voices exposed by the browser/OS
// via the Web Speech API — no API key or cost involved. Edge on Windows and
// Safari on Apple devices expose the highest-quality ones; Chrome/Android
// generally have fewer great options, which the scoring below accounts for.
const VOICE_PREFERENCES = [
  // Microsoft Edge "Online (Natural)" neural voices — best available for free
  "Ava Online (Natural)",
  "Andrew Online (Natural)",
  "Emma Online (Natural)",
  "Jenny Online (Natural)",
  "Aria Online (Natural)",
  "Guy Online (Natural)",
  "Christopher Online (Natural)",
  "Steffan Online (Natural)",
  "Michelle Online (Natural)",
  // Apple "Enhanced"/"Premium" voices (Safari on macOS/iOS)
  "Ava (Enhanced)",
  "Ava (Premium)",
  "Samantha (Enhanced)",
  "Samantha (Premium)",
  "Nicky (Enhanced)",
  "Allison (Enhanced)",
  "Susan (Enhanced)",
  "Tom (Enhanced)",
  "Evan (Enhanced)",
  // Plain fallbacks, roughly best to worst
  "Microsoft Jenny",
  "Microsoft Aria",
  "Google US English",
  "Samantha",
  "Karen",
  "Daniel",
  "Alex",
  "Microsoft Zira",
  "Microsoft David",
];

const AVOID_VOICE_PATTERNS = [
  /eSpeak/i,
  /Compact/i,
  /Bad News/i,
  /Bells/i,
  /Cellos/i,
];

function scoreVoice(voice) {
  let score = 0;
  const name = voice.name || "";
  const lang = (voice.lang || "").toLowerCase();

  if (!lang.startsWith("en")) return -100;

  VOICE_PREFERENCES.forEach((pref, i) => {
    if (name.includes(pref)) score += 100 - i * 3;
  });

  if (/natural|neural|online/i.test(name)) score += 40;
  if (/enhanced|premium/i.test(name)) score += 35;
  if (voice.localService === false) score += 15;
  if (/en-us/i.test(lang)) score += 10;
  if (AVOID_VOICE_PATTERNS.some((p) => p.test(name))) score -= 80;

  return score;
}

export function getEnglishVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return [];
  return (window.speechSynthesis.getVoices() || []).filter((v) =>
    (v.lang || "").toLowerCase().startsWith("en")
  );
}

export function getBestEnglishVoice() {
  const voices = getEnglishVoices();
  if (!voices.length) return null;

  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return ranked[0];
}

/**
 * Cleans text before speaking — removes stage directions, emojis, and junk punctuation.
 */
function cleanTextForSpeech(text) {
  return (text || "")
    // Remove *stage directions* like *smiling* or *nods*
    .replace(/\*[^*]*\*/g, "")
    // Remove emojis (broad unicode range)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    // Remove multiple punctuation like "!!!" or "..."
    .replace(/([!?.]){2,}/g, "$1")
    // Remove double spaces
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Returns a small random jitter in [-range, +range].
 */
function jitter(range) {
  return (Math.random() * 2 - 1) * range;
}

/**
 * Splits text into segments with associated pause durations and pitch hints.
 * This gives each clause its own prosody, making speech sound more natural.
 */
export function splitSpeechText(text) {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return [];

  // Split on sentence-ending punctuation AND on commas/colons/dashes (clause boundaries)
  const segments = [];
  // Regex: split AFTER . ! ? , ; : — but keep the delimiter attached to the preceding chunk
  const parts = cleaned.split(/(?<=[.!?,;:\u2014])\s+/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const lastChar = trimmed.slice(-1);
    let pauseMs = 0;
    let pitchHint = "neutral"; // neutral | question | exclamation | clause

    if (lastChar === "?" ) { pauseMs = 280; pitchHint = "question"; }
    else if (lastChar === "!") { pauseMs = 260; pitchHint = "exclamation"; }
    else if (lastChar === ".") { pauseMs = 240; pitchHint = "neutral"; }
    else if (lastChar === ",") { pauseMs = 100; pitchHint = "clause"; }
    else if (lastChar === ";") { pauseMs = 140; pitchHint = "clause"; }
    else if (lastChar === ":") { pauseMs = 160; pitchHint = "clause"; }
    else if (lastChar === "\u2014") { pauseMs = 150; pitchHint = "clause"; } // em-dash

    segments.push({ text: trimmed, pauseMs, pitchHint });
  }

  return segments;
}

/**
 * Maps a pitchHint to a SpeechSynthesisUtterance pitch value with natural variation.
 */
function getPitch(pitchHint) {
  const base = {
    question:     1.10,
    exclamation:  1.05,
    clause:       0.97,
    neutral:      1.00,
  }[pitchHint] ?? 1.0;

  // Add subtle randomness so consecutive segments don't sound identical
  return Math.min(1.2, Math.max(0.8, base + jitter(0.04)));
}

/**
 * Maps a pitchHint to a speaking rate with slight variation.
 */
function getRate(baseRate, pitchHint) {
  // Clause-ending commas/colons are spoken slightly slower (more deliberate)
  const modifier = {
    question:     0.0,
    exclamation:  0.02,
    clause:      -0.03,
    neutral:      0.0,
  }[pitchHint] ?? 0;

  return Math.min(1.05, Math.max(0.82, baseRate + modifier + jitter(0.02)));
}

/**
 * Speaks text naturally with human-like prosody:
 * - pauses between clauses
 * - varied pitch per segment
 * - slight rate variation
 */
export function speakNaturally(text, { rate = 0.92, onEnd, onStart } = {}) {
  return new Promise((resolve) => {
    if (!text?.trim() || typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const segments = splitSpeechText(text);
    if (!segments.length) {
      onEnd?.();
      resolve();
      return;
    }

    const voice = getBestEnglishVoice();
    let idx = 0;
    let cancelled = false;

    const speakNext = () => {
      if (cancelled || idx >= segments.length) {
        if (!cancelled) {
          onEnd?.();
          resolve();
        }
        return;
      }

      const { text: segText, pauseMs, pitchHint } = segments[idx];
      idx += 1;

      const utter = new SpeechSynthesisUtterance(segText);
      utter.lang   = "en-US";
      if (voice) utter.voice = voice;
      utter.rate   = getRate(rate, pitchHint);
      utter.pitch  = getPitch(pitchHint);
      utter.volume = 1;

      if (idx === 1) utter.onstart = () => onStart?.();

      utter.onend = () => {
        if (pauseMs > 0) {
          // Real silence between clauses — this is what makes speech sound human
          setTimeout(speakNext, pauseMs);
        } else {
          speakNext();
        }
      };

      utter.onerror = (e) => {
        // 'interrupted' is expected when cancel() is called — don't log it as an error
        if (e.error !== "interrupted" && e.error !== "canceled") {
          console.warn("TTS error:", e.error);
        }
        cancelled = true;
        resolve();
      };

      window.speechSynthesis.speak(utter);
    };

    speakNext();
  });
}

export function preloadVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  getBestEnglishVoice();
  window.speechSynthesis.addEventListener("voiceschanged", getBestEnglishVoice, { once: true });
}
