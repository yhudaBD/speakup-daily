import { systemInstruction } from "../data/rolePlayTopics";

const API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";
const CHAT_MODEL = "llama-3.1-8b-instant";
const TRANSLATION_MODEL = "llama-3.3-70b-versatile";

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

async function groqChat({ model, messages, temperature = 0.7, json = true }) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(json ? { response_format: { type: "json_object" } } : {}),
      temperature,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function translateToHebrew(texts) {
  if (!texts.length) return [];

  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const raw = await groqChat({
    model: TRANSLATION_MODEL,
    messages: [
      { role: "system", content: TRANSLATION_SYSTEM },
      { role: "user", content: `Translate these English sentences to Hebrew:\n\n${numbered}` },
    ],
    temperature: 0.1,
  });

  const parsed = JSON.parse(raw);
  const translations = parsed.translations || [];

  if (translations.length !== texts.length) {
    console.warn("Translation count mismatch, padding with empty strings");
    while (translations.length < texts.length) translations.push("");
  }

  return translations;
}

export const aiService = {
  async sendMessage({ systemPrompt, messages, chatDifficulty = "easy" }) {
    if (!API_KEY) {
      console.warn("No VITE_GROQ_API_KEY found in .env.local. Using fallback mock responses.");

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

    try {
      const difficultyExtra = DIFFICULTY_INSTRUCTIONS[chatDifficulty] || "";
      const groqMessages = [
        { role: "system", content: systemPrompt + "\n" + systemInstruction + difficultyExtra },
        ...messages,
      ];

      const responseText = await groqChat({
        model: CHAT_MODEL,
        messages: groqMessages,
        temperature: 0.85,
      });

      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        console.error("Failed to parse JSON from Groq:", responseText);
        throw new Error("Invalid response format from AI");
      }

      const suggestions = chatDifficulty === "hard"
        ? []
        : (parsed.suggested_user_responses || []).map((s) =>
            typeof s === "string" ? { en: s } : { en: s.en || "", hint: s.hint || "" }
          );

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
      console.error("Groq API Error:", error);
      throw error;
    }
  },

  async transcribeAudio(blob, mimeType = "audio/webm") {
    if (!API_KEY) {
      throw new Error("No API key configured");
    }

    const ext = mimeType.includes("mp4") || mimeType.includes("aac")
      ? "m4a"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";

    const formData = new FormData();
    formData.append("file", blob, `recording.${ext}`);
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "en");
    formData.append("response_format", "json");
    formData.append("temperature", "0");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Transcription error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    return (data.text || "").trim();
  },

  async analyzeConversation({ messages, topicTitle }) {
    const userMessages = messages.filter((m) => m.role === "user");
    if (!userMessages.length) {
      return {
        overall_score: 0,
        summary: "לא היו הודעות מהמשתמש לניתוח.",
        strengths: [],
        improvements: ["נסה לשלוח לפחות הודעה אחת בשיחה"],
        grammar_notes: [],
        vocabulary_suggestions: [],
      };
    }

    if (!API_KEY) {
      await new Promise((r) => setTimeout(r, 1200));
      return {
        overall_score: 78,
        summary: "שיחה טובה! דיברת באנגלית בצורה טבעית והגבת לשאלות.",
        strengths: ["המשכת את השיחה בצורה טבעית", "השתמשת במילים מתאימות לתרחיש"],
        improvements: ["נסה משפטים ארוכים יותר", "שים לב לזמנים (past/present)"],
        grammar_notes: ["שים לב לשימוש ב-articles (a/the)"],
        vocabulary_suggestions: ["I would appreciate...", "Could you please..."],
      };
    }

    const transcript = messages
      .map((m) => `${m.role === "user" ? "Student" : "AI"}: ${m.content}`)
      .join("\n");

    const raw = await groqChat({
      model: TRANSLATION_MODEL,
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM },
        {
          role: "user",
          content: `Topic: ${topicTitle}\n\nConversation:\n${transcript}`,
        },
      ],
      temperature: 0.3,
    });

    return JSON.parse(raw);
  },

  async analyzePracticeSession({ sentences, categoryLabel, difficulty, averageScore }) {
    const sentenceList = sentences.map((s) => `- ${s.text}`).join("\n");

    if (!API_KEY) {
      await new Promise((r) => setTimeout(r, 1000));
      return {
        summary_he: `תרגול מצוין בנושא ${categoryLabel || "כללי"}! המשכת להתאמן והגעת לממוצע של ${averageScore}%.`,
        speaking_tips: [
          "בדיבור טבעי, מקשרים מילים — 'want to' נשמע כמו 'wanna' בדיבור לא רשמי.",
          "השתמש במילות מילוי כמו 'well', 'you know' כדי לקנות זמן לחשיבה.",
          "הדגש את המילה החשובה במשפט — זה עוזר למאזין להבין אותך.",
        ],
        vocabulary: sentences.slice(0, 3).map((s) => {
          const words = s.text.split(/\s+/).filter((w) => w.length > 5);
          const word = words[0]?.replace(/[^a-zA-Z'-]/g, "") || "practice";
          return {
            word,
            meaning_he: s.translation || "מילה מהתרגול",
            usage_tip_he: "השתמש במילה הזו במשפטים יומיומיים כשאתה מדבר על אותו נושא.",
            example: s.text,
          };
        }),
      };
    }

    const raw = await groqChat({
      model: TRANSLATION_MODEL,
      messages: [
        { role: "system", content: PRACTICE_ANALYSIS_SYSTEM },
        {
          role: "user",
          content: `Topic: ${categoryLabel || "Mixed"}\nDifficulty: ${difficulty}\nAverage pronunciation score: ${averageScore}%\n\nSentences practiced:\n${sentenceList}`,
        },
      ],
      temperature: 0.4,
    });

    return JSON.parse(raw);
  },

  async generatePracticeSentences({ topic, difficulty = "easy", count = 5 }) {
    if (!API_KEY) {
      await new Promise((r) => setTimeout(r, 1200));
      const fallbackSentences = [
        { id: "ai_001", text: "Let me tell you about that.", translation: "תן לי לספר לך על זה.", category: "ai", difficulty, phonetic_tips: "'tell you' — blend naturally" },
        { id: "ai_002", text: "That is a really good point.", translation: "זו נקודה ממש טובה.", category: "ai", difficulty, phonetic_tips: "'really' — stress on first syllable" },
        { id: "ai_003", text: "I think we should try that.", translation: "אני חושב שכדאי לנסות את זה.", category: "ai", difficulty, phonetic_tips: "'should' — the 'l' is silent" },
        { id: "ai_004", text: "Can you help me with this?", translation: "אתה יכול לעזור לי עם זה?", category: "ai", difficulty, phonetic_tips: "'help me' — link the two words" },
        { id: "ai_005", text: "I would love to learn more about it.", translation: "הייתי שמח ללמוד עוד על זה.", category: "ai", difficulty, phonetic_tips: "'would' — the 'l' is silent" },
      ].slice(0, count);
      return { sentences: fallbackSentences, topicEn: topic };
    }

    const raw = await groqChat({
      model: TRANSLATION_MODEL,
      messages: [
        { role: "system", content: GENERATE_SENTENCES_SYSTEM },
        {
          role: "user",
          content: `Topic (in Hebrew or English): "${topic}"\nDifficulty: ${difficulty}\nNumber of sentences: ${count}\n\nGenerate ${count} natural English pronunciation practice sentences about this topic.`,
        },
      ],
      temperature: 0.7,
    });

    const parsed = JSON.parse(raw);
    const topicEn = parsed.topic_en || topic;
    const sentences = (parsed.sentences || []).map((s, i) => ({
      id: s.id || `ai_${String(i + 1).padStart(3, "0")}`,
      text: s.text,
      translation: s.translation || "",
      category: "ai",
      difficulty,
      phonetic_tips: s.phonetic_tips || "",
    }));

    return { sentences, topicEn };
  },
};
