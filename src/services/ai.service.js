import { systemInstruction } from "../data/rolePlayTopics";
import { placementSystemPrompt } from "../data/placementPrompt";
import { auth } from "./firebase";
import {
  chatTurnSchema, translationSchema, placementTurnSchema,
  conversationAnalysisSchema, practiceAnalysisSchema, practiceSentencesSchema,
} from "./aiSchemas";

const PROXY_URL = "/api/groq-proxy";
const CHAT_MODEL = "openai/gpt-oss-20b";
const TRANSLATION_MODEL = "openai/gpt-oss-120b";

const TRANSLATION_SYSTEM = `You are a professional English-to-Hebrew translator for Israeli adults learning English.
Your translations appear under English chat messages to help learners understand.

RULES:
- Write natural Israeli Hebrew as people actually speak — never robotic or word-for-word.
- Use correct Hebrew grammar, spelling, and punctuation.
- Use "הייתי רוצה" (not "אני היה רוצה") for "I would like".
- Use "אפשר לקבל" or "אפשר לקבל" for "Can I get/have".
- Use "בבקשה" naturally at the end of requests.
- For unknown gender, use plural (אתם/רוצים) or impersonal forms.
- Translate idioms by meaning, not literally.
- Use vocabulary common in Israel: "חלב שקדים" (almond milk), "קפוצ'ינו", "להזמין" (to order).
- Keep brand names in English (e.g. Brew & Bean).
- Short, clear sentences. Match the tone (friendly, professional, casual).

EXAMPLES of good translations:
- "What can I get for you?" → "מה אפשר להביא לכם?"
- "Would you like that hot or iced?" → "רוצים את זה חם או קר?"
- "That'll be $4.50" → "זה יוצא 4.50 דולר"
- "I would like a cappuccino please" → "הייתי רוצה קפוצ'ינו, בבקשה"
- "Do you have oat milk?" → "יש לכם חלב שיבולת שועל?"

Return JSON only: { "translations": ["...", ...] }`;

const DIFFICULTY_INSTRUCTIONS = {
  easy: `
SUGGESTED RESPONSES (EASY DIFFICULTY):
Provide exactly 3 complete, natural sentences the user could say next.
Each must be a full sentence — never end with "..." or leave words out.
Never use contractions — write full forms (I would, do not, that is, I am, etc.).
`,
  medium: `
SUGGESTED RESPONSES (MEDIUM DIFFICULTY):
Provide exactly 3 complete sentences — slightly more advanced vocabulary than easy, but still natural.
Each must be a full sentence — never end with "..." or leave words out.
Never use contractions — write full forms (I would, do not, that is, I am, etc.).
`,
  hard: `
SUGGESTED RESPONSES (HARD DIFFICULTY):
Return an empty array: "suggested_user_responses": []
The user must respond entirely on their own with no help.
`,
};

const GENERATE_SENTENCES_SYSTEM = `You are an English pronunciation coach for Israeli adults learning English.
Your task is to generate practice sentences on a given topic.

Return JSON only:
{
  "topic_en": "Topic name in English",
  "sentences": [
    {
      "id": "ai_001",
      "text": "English sentence to practice",
      "translation": "תרגום עברי טבעי",
      "phonetic_tips": "One specific pronunciation tip for this sentence"
    }
  ]
}

Rules:
- Generate exactly the requested number of sentences.
- Each sentence must be natural spoken English (not textbook formal).
- Sentences should be relevant to the topic.
- Difficulty should match the requested level: easy=short simple sentences, medium=more complex phrases, advanced=idioms and complex structures.
- phonetic_tips: ONE clear tip about a tricky sound or stress in that sentence. Keep it short.
- translation: natural Israeli Hebrew, not word-for-word.
- id: use format ai_001, ai_002, etc.
- topic_en: translate the topic to English.
- Focus on practical, useful phrases people actually say.`;

const PRACTICE_ANALYSIS_SYSTEM = `You are an English speaking coach for Israeli adults.
Analyze a completed pronunciation practice session and return helpful feedback in Hebrew.

Return JSON only:
{
  "summary_he": "2-3 sentence encouraging summary in Hebrew about their session",
  "speaking_tips": [
    "Practical tip in Hebrew about natural spoken English (rhythm, linking, intonation, fillers, etc.)"
  ],
  "vocabulary": [
    {
      "word": "interesting English word or phrase from the session",
      "meaning_he": "Hebrew meaning",
      "usage_tip_he": "How to use it naturally in spoken conversation — in Hebrew",
      "example": "A short natural spoken example sentence in English"
    }
  ]
}

Rules:
- Pick 3-5 useful words/phrases from the sentences practiced — focus on ones worth remembering.
- speaking_tips: 2-3 tips about SPOKEN English (not written grammar textbooks).
- Be encouraging and specific. Reference the topic/category if given.`;

const ANALYSIS_SYSTEM = `You are an English conversation coach for Israeli adults.
Analyze a completed roleplay conversation and provide constructive feedback in Hebrew.

Return JSON only:
{
  "overall_score": 75,
  "summary": "2-3 sentence overall assessment in Hebrew",
  "strengths": ["strength 1 in Hebrew", "strength 2 in Hebrew"],
  "improvements": ["specific tip 1 in Hebrew", "specific tip 2 in Hebrew"],
  "grammar_notes": ["note about a grammar pattern in Hebrew"],
  "vocabulary_suggestions": ["useful phrase they could learn"]
}

Score 0-100 based on: fluency, grammar, vocabulary range, and appropriateness.
Be encouraging but specific. Reference actual things the user said.`;

// gpt-oss models on Groq occasionally fail to produce valid JSON-mode output —
// observed in practice as three distinct 400 error codes:
//   - tool_use_failed: model emits a phantom tool call; failed_generation is a
//     JSON string wrapping {name, arguments} — the real content is .arguments.
//   - json_validate_failed / output_parse_failed: model drifts into plain text
//     or leaks its own reasoning instead of JSON.
// All three are non-deterministic formatting hiccups, not real failures, so
// retry the exact same request (see MAX_GROQ_ATTEMPTS below) before giving up.
// tool_use_failed can also be recovered directly from failed_generation
// without even retrying.
// invalid_json / schema_invalid are ours: a reply that parsed badly or
// didn't fit its schema (see groqChat).
const RECOVERABLE_ERROR_CODES = new Set([
  "tool_use_failed", "json_validate_failed", "output_parse_failed", "empty_completion",
  "invalid_json", "schema_invalid",
]);

function recoverFromToolUseFailure(errBody) {
  try {
    const parsed = JSON.parse(errBody);
    const raw = parsed?.error?.failed_generation;
    if (parsed?.error?.code !== "tool_use_failed" || !raw) return null;
    const wrapped = JSON.parse(raw);
    return wrapped?.arguments ? JSON.stringify(wrapped.arguments) : null;
  } catch {
    return null;
  }
}

function isRecoverableGroqError(errText) {
  try {
    return RECOVERABLE_ERROR_CODES.has(JSON.parse(errText)?.error?.code);
  } catch {
    return false;
  }
}

// The proxy only serves signed-in users (netlify/functions/_shared/auth.js).
// getIdToken() returns the cached token, refreshing it first if it's about
// to expire, so this adds no round trip on most calls.
async function proxyHeaders() {
  const token = await auth?.currentUser?.getIdToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function groqChatOnce({ model, messages, temperature, json }) {
  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: await proxyHeaders(),
    body: JSON.stringify({ type: "chat", model, messages, temperature, json }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const recovered = recoverFromToolUseFailure(errText);
    if (recovered) return { ok: true, content: recovered };
    return { ok: false, status: response.status, errText };
  }

  const data = await response.json();
  const choice = data.choices[0];
  // A reasoning model can burn its entire output budget on its own chain of
  // thought and hit the token ceiling before ever writing the real answer —
  // that comes back as a "successful" 200 with empty content. Treat it the
  // same as the other recoverable formatting failures rather than returning
  // an empty string to the caller.
  if (!choice.message.content?.trim() && choice.finish_reason === "length") {
    return { ok: false, status: 200, errText: JSON.stringify({ error: { code: "empty_completion" } }) };
  }
  return { ok: true, content: choice.message.content };
}

// This model fails JSON-mode validation surprisingly often in practice (observed
// ~30-40% per call, occasionally two 400s in a row) — 3 attempts total keeps the
// compounding failure chance low without noticeably slowing down a turn.
const MAX_GROQ_ATTEMPTS = 3;

function invalidReply(code, detail) {
  return { ok: false, status: 200, errText: JSON.stringify({ error: { code, message: detail } }) };
}

// Parses a JSON-mode reply and checks it against its schema (aiSchemas.js).
function validateReply(content, schema) {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return invalidReply("invalid_json", "Reply was not valid JSON");
  }
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  console.warn("AI reply did not match its schema:", parsed.error.issues);
  return invalidReply("schema_invalid", parsed.error.issues.map((i) => i.message).join("; "));
}

// With a `schema`, returns the parsed, validated value. A reply that doesn't
// fit uses up an attempt like any other recoverable failure. Without one
// (plain-text mode), returns the raw content.
async function groqChat({ model, messages, temperature = 0.7, json = true, schema }) {
  let result;
  for (let attempt = 1; attempt <= MAX_GROQ_ATTEMPTS; attempt++) {
    result = await groqChatOnce({ model, messages, temperature, json });
    if (result.ok && schema) result = validateReply(result.content, schema);
    if (result.ok || !isRecoverableGroqError(result.errText)) break;
  }
  if (!result.ok) {
    throw new Error(`Groq API error: ${result.status} ${result.errText}`);
  }
  return schema ? result.value : result.content;
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function translateToHebrew(texts) {
  if (!texts.length) return [];

  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const { translations } = await groqChat({
    model: TRANSLATION_MODEL,
    messages: [
      { role: "system", content: TRANSLATION_SYSTEM },
      { role: "user", content: `Translate these English sentences to Hebrew:\n\n${numbered}` },
    ],
    temperature: 0.1,
    schema: translationSchema,
  });

  if (translations.length !== texts.length) {
    console.warn("Translation count mismatch, padding with empty strings");
    while (translations.length < texts.length) translations.push("");
  }

  return translations;
}

function buildProfileContext(placement) {
  if (!placement) return "";
  const parts = [`\nUSER PROFILE (use this to personalize your character's vocabulary and pacing — never mention it explicitly):`];
  if (placement.overall_level) parts.push(`- English level: ${placement.overall_level}`);
  if (placement.job_field) parts.push(`- Job: ${placement.job_field}`);
  if (placement.gaps?.length) parts.push(`- Known trouble spots to reinforce naturally: ${placement.gaps.slice(-8).join(", ")}`);
  return parts.length > 1 ? parts.join("\n") + "\n" : "";
}

export const aiService = {
  async sendMessage({ systemPrompt, messages, chatDifficulty = "easy", placement = null }) {
    try {
      const difficultyExtra = DIFFICULTY_INSTRUCTIONS[chatDifficulty] || "";
      const profileContext = buildProfileContext(placement);
      const groqMessages = [
        { role: "system", content: systemPrompt + "\n" + systemInstruction + difficultyExtra + profileContext },
        ...messages,
      ];

      const parsed = await groqChat({
        model: CHAT_MODEL,
        messages: groqMessages,
        temperature: 0.85,
        schema: chatTurnSchema,
      });

      const suggestions = chatDifficulty === "hard" ? [] : parsed.suggested_user_responses;

      const toTranslate = [parsed.ai_reply, ...suggestions.map((s) => s.en)].filter(Boolean);
      const hebrew = toTranslate.length ? await translateToHebrew(toTranslate) : [];

      return {
        ai_reply: parsed.ai_reply,
        ai_reply_he: hebrew[0] || "",
        suggested_user_responses: suggestions.map((s, i) => ({
          en: s.en,
          he: hebrew[i + 1] || "",
          hint: s.hint || "",
        })),
      };
    } catch (error) {
      console.warn("Groq proxy unavailable, using fallback mock response:", error);

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const turnCount = messages.filter((m) => m.role === "user").length;

      let ai_reply = "Hi there! Welcome. How can I help you today?";
      if (turnCount > 0) {
        ai_reply = "I see! Tell me more about that.";
        if (turnCount > 2) {
          ai_reply = "Interesting! What else would you like to know?";
        }
      }

      const mockTranslations = {
        "Hi there! Welcome. How can I help you today?": "היי! ברוכים הבאים. איך אוכל לעזור?",
        "I see! Tell me more about that.": "הבנתי! ספרו לי עוד על זה.",
        "Interesting! What else would you like to know?": "מעניין! מה עוד תרצו לדעת?",
      };

      return {
        ai_reply,
        ai_reply_he: mockTranslations[ai_reply] || "",
        suggested_user_responses: chatDifficulty === "hard" ? [] : [
          { en: "I would like to order a coffee, please.", he: "הייתי רוצה להזמין קפה, בבקשה." },
          { en: "Could you tell me more about the options?", he: "אפשר לשמוע עוד על האפשרויות?" },
          { en: "Thank you, that is all I need for now.", he: "תודה, זה הכל לעכשיו." },
        ],
      };
    }
  },

  async transcribeAudio(blob, mimeType = "audio/webm") {
    const audioBase64 = await blobToBase64(blob);

    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: await proxyHeaders(),
      body: JSON.stringify({ type: "transcribe", audioBase64, mimeType }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Transcription error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return (data.text || "").trim();
  },

  // No fallback: a made-up score here used to be saved as the real result
  // and fed ADJUST_LEVEL / MERGE_PLACEMENT_GAPS. On failure this throws, and
  // RolePlay's DoneScreen shows an error with a retry.
  async analyzeConversation({ messages, topicTitle }) {
    if (!messages.some((m) => m.role === "user")) {
      throw new Error("Nothing to analyze: the conversation has no user messages");
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`)
      .join("\n");

    return groqChat({
      model: TRANSLATION_MODEL,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM },
        {
          role: "user",
          content: `Topic: ${topicTitle}\n\nConversation:\n${transcript}`,
        },
      ],
      temperature: 0.3,
      schema: conversationAnalysisSchema,
    });
  },

  // No fallback, for the same reason as analyzeConversation: the old one
  // put invented "words" (the first long word of each sentence) into the
  // word bank. Practice.jsx shows an error with a retry instead.
  async analyzePracticeSession({ sentences, categoryLabel, difficulty, averageScore }) {
    const sentenceList = sentences.map((s) => `- ${s.text}`).join("\n");

    return groqChat({
      model: TRANSLATION_MODEL,
      messages: [
        { role: "system", content: PRACTICE_ANALYSIS_SYSTEM },
        {
          role: "user",
          content: `Topic: ${categoryLabel || "Mixed"}\nDifficulty: ${difficulty}\nAverage pronunciation score: ${averageScore}%\n\nSentences practiced:\n${sentenceList}`,
        },
      ],
      temperature: 0.4,
      schema: practiceAnalysisSchema,
    });
  },

  // No fallback: generic canned sentences presented as the user's own topic
  // (and savable as one) were worse than an honest error, which
  // AITopicPanel in Practice.jsx already shows with a retry.
  async generatePracticeSentences({ topic, difficulty = "easy", count = 5, placement = null }) {
    const profileContext = buildProfileContext(placement);
    const parsed = await groqChat({
      model: TRANSLATION_MODEL,
      messages: [
        { role: "system", content: GENERATE_SENTENCES_SYSTEM + profileContext },
        {
          role: "user",
          content: `Topic (in Hebrew or English): "${topic}"\nDifficulty: ${difficulty}\nNumber of sentences: ${count}\n\nGenerate ${count} natural English pronunciation practice sentences about this topic.`,
        },
      ],
      temperature: 0.7,
      schema: practiceSentencesSchema,
    });

    const sentences = parsed.sentences.map((s, i) => ({
      id: s.id || `ai_${String(i + 1).padStart(3, "0")}`,
      text: s.text,
      translation: s.translation,
      category: "ai",
      difficulty,
      phonetic_tips: s.phonetic_tips,
    }));

    return { sentences, topicEn: parsed.topic_en || topic };
  },

  // No mock fallback here either: a fabricated level result
  // would be actively misleading since it drives personalization everywhere else.
  // Let callers catch the error and offer the user a manual skip instead.
  async runPlacementTurn({ messages }) {
    const groqMessages = [
      { role: "system", content: placementSystemPrompt },
      ...messages,
    ];

    // placementTurnSchema requires a usable result (a CEFR overall_level) on
    // the final turn, since that result drives personalization everywhere.
    return groqChat({
      model: CHAT_MODEL,
      messages: groqMessages,
      temperature: 0.5, // lower than roleplay's 0.85 — steadier JSON-mode compliance for this model
      schema: placementTurnSchema,
    });
  },

  // "How do you say...?" helper: translate a Hebrew phrase to natural spoken
  // English without it counting as the user's conversation turn. Plain-text
  // mode (json: false) — no schema to satisfy, so it's naturally more
  // reliable than the JSON-mode calls above.
  async translateToEnglish(hebrewText) {
    try {
      const raw = await groqChat({
        model: CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: "Translate the given Hebrew text to natural, casual spoken English. Reply with ONLY the English translation — no quotes, no explanation, no Hebrew.",
          },
          { role: "user", content: hebrewText },
        ],
        temperature: 0.3,
        json: false,
      });
      return raw.trim();
    } catch (error) {
      console.warn("translateToEnglish failed:", error);
      return "";
    }
  },
};
