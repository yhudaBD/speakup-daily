// Server-side proxy for the Groq API.
// Keeps GROQ_API_KEY out of the client bundle — set it as a Netlify
// environment variable (Site settings → Environment variables), NOT
// prefixed with VITE_, so Vite never inlines it into shipped JS.

const GROQ_API_KEY = process.env.GROQ_API_KEY;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

function extensionFor(mimeType) {
  if (mimeType.includes("mp4") || mimeType.includes("aac")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

async function handleChat(payload) {
  const { model, messages, temperature = 0.7, json = true } = payload;
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      temperature,
    }),
  });
  const data = await response.json();
  return { statusCode: response.status, data };
}

async function handleTranscribe(payload) {
  const { audioBase64, mimeType = "audio/webm" } = payload;
  if (!audioBase64) {
    return { statusCode: 400, data: { error: "Missing audioBase64" } };
  }

  const buffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([buffer], { type: mimeType }), `recording.${extensionFor(mimeType)}`);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", "en");
  formData.append("response_format", "json");
  formData.append("temperature", "0");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });
  const data = await response.json();
  return { statusCode: response.status, data };
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!GROQ_API_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: "Server misconfigured: GROQ_API_KEY is not set" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  try {
    let result;
    if (payload.type === "chat") {
      result = await handleChat(payload);
    } else if (payload.type === "transcribe") {
      result = await handleTranscribe(payload);
    } else {
      return { statusCode: 400, headers: corsHeaders(), body: JSON.stringify({ error: "Unknown type" }) };
    }
    return { statusCode: result.statusCode, headers: corsHeaders(), body: JSON.stringify(result.data) };
  } catch (error) {
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({ error: error.message || "Upstream error" }),
    };
  }
};
