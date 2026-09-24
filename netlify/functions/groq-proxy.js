// Server-side proxy for the Groq API.
// Keeps GROQ_API_KEY out of the client bundle. Set it as a Netlify
// environment variable (Site settings → Environment variables), NOT
// prefixed with VITE_, so Vite never inlines it into shipped JS.
//
// Hiding the key only helps if the proxy isn't a free Groq endpoint for
// anyone who finds its URL. So every call must carry a signed-in user's
// Firebase ID token (requireUser), is capped per account per day
// (consumeDailyQuota), and may only use an allowlisted model with a bounded
// request size and output budget.
//
// v2 function (export default (req) =>), like log-event.js and
// get-dashboard-data.js. Reached via the /api/* → /.netlify/functions/*
// rewrite in netlify.toml.
import { HttpError, errorResponse, readJson, requirePost } from "./_shared/http.js";
import { requireUser } from "./_shared/auth.js";
import { consumeDailyQuota } from "./_shared/quota.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

// The two models src/services/ai.service.js uses. Anything else is refused,
// so a stolen session can't be pointed at a pricier model.
const ALLOWED_MODELS = new Set(["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

// Sized from real traffic: a finished placement conversation is ~30
// messages and the longest system prompt is well under 10k characters.
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOTAL_CHARS = 60_000;

// gpt-oss spends part of this budget on hidden reasoning before it writes
// the answer. Too tight a cap produces the empty `finish_reason: "length"`
// completions ai.service.js already retries, so this is a cost ceiling,
// not a target.
const MAX_COMPLETION_TOKENS = 8192;

// A 30s recording (useVoiceInput's MAX_RECORDING_MS) is a few hundred KB
// even as AAC. This leaves ample headroom under Netlify's 6MB body limit.
const MAX_AUDIO_BASE64_CHARS = 3_000_000;
const MAX_BODY_BYTES = MAX_AUDIO_BASE64_CHARS + 10_000;
const AUDIO_MIME_RE = /^audio\/[\w.+-]+(;\s*codecs=[\w.,-]+)?$/i;

const UPSTREAM_TIMEOUT_MS = 25_000;

function badRequest(message) {
  return new HttpError(400, "invalid_request", message);
}

function validateChat(payload) {
  const { model, messages, temperature = 0.7, json: jsonMode = true } = payload;
  if (!ALLOWED_MODELS.has(model)) throw badRequest("Model not allowed");
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw badRequest(`messages must be an array of 1-${MAX_MESSAGES} items`);
  }
  let totalChars = 0;
  const clean = messages.map((m) => {
    if (!m || !ALLOWED_ROLES.has(m.role) || typeof m.content !== "string") {
      throw badRequest("Each message needs a valid role and string content");
    }
    if (m.content.length > MAX_MESSAGE_CHARS) throw badRequest("Message too long");
    totalChars += m.content.length;
    return { role: m.role, content: m.content };
  });
  if (totalChars > MAX_TOTAL_CHARS) throw badRequest("Conversation too long");
  if (typeof temperature !== "number" || temperature < 0 || temperature > 1.5) {
    throw badRequest("temperature must be a number between 0 and 1.5");
  }
  return { model, messages: clean, temperature, json: jsonMode !== false };
}

function validateTranscribe(payload) {
  const { audioBase64, mimeType = "audio/webm" } = payload;
  if (typeof audioBase64 !== "string" || !audioBase64) throw badRequest("Missing audioBase64");
  if (audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new HttpError(413, "payload_too_large", "Recording too long");
  }
  if (typeof mimeType !== "string" || mimeType.length > 100 || !AUDIO_MIME_RE.test(mimeType)) {
    throw badRequest("Unsupported audio type");
  }
  return { audioBase64, mimeType };
}

function extensionFor(mimeType) {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

// Passes Groq's status and body through untouched: the client's retry logic
// (ai.service.js) keys off Groq's own error codes like tool_use_failed.
async function forward(path, init, apiKey) {
  let status, body;
  try {
    const response = await fetch(`${GROQ_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    status = response.status;
    body = await response.text();
  } catch (err) {
    if (err?.name === "TimeoutError") {
      throw new HttpError(504, "upstream_timeout", "The AI service took too long to respond");
    }
    console.error("Groq request failed:", err);
    throw new HttpError(502, "upstream_unreachable", "Could not reach the AI service");
  }
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function chat({ model, messages, temperature, json: jsonMode }, apiKey) {
  return forward("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  }, apiKey);
}

function transcribe({ audioBase64, mimeType }, apiKey) {
  const buffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), `recording.${extensionFor(mimeType)}`);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", "en");
  formData.append("response_format", "json");
  formData.append("temperature", "0");
  return forward("/audio/transcriptions", { method: "POST", body: formData }, apiKey);
}

export default async (req) => {
  try {
    requirePost(req);
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new HttpError(500, "server_misconfigured", "Server misconfigured: GROQ_API_KEY is not set");

    const uid = await requireUser(req);
    const payload = await readJson(req, MAX_BODY_BYTES);

    let run;
    if (payload.type === "chat") {
      const input = validateChat(payload);
      run = () => chat(input, apiKey);
    } else if (payload.type === "transcribe") {
      const input = validateTranscribe(payload);
      run = () => transcribe(input, apiKey);
    } else {
      throw badRequest("Unknown type");
    }

    const counted = await consumeDailyQuota(uid);
    const [response] = await Promise.all([run(), counted]);
    return response;
  } catch (err) {
    return errorResponse(err);
  }
};
