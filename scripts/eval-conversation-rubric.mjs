// Runs the conversation analysis prompt (src/services/analysisPrompt.js) on
// scripts/eval/conversation-rubric.json and reports how often each rubric
// part lands within 1 of the expected value (CRITICAL_REVIEW.md §14).
// CLAUDE.md: run it before and after every change to the prompt.
//
// Calls Groq directly, with the same model and temperature as the app:
//   GROQ_API_KEY=... node scripts/eval-conversation-rubric.mjs
// The key is the one set in Netlify. It isn't printed or saved.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ANALYSIS_SYSTEM, analysisTranscript } from "../src/services/analysisPrompt.js";
import { conversationAnalysisSchema } from "../src/services/aiSchemas.js";

export const PARTS = ["fluency", "grammar", "vocabulary"];
// Agreement needed to call the prompt fit: 85% of parts within 1, and no
// part off by 3 or more.
export const MIN_AGREEMENT = 0.85;

const MODEL = "openai/gpt-oss-120b"; // TRANSLATION_MODEL in ai.service.js
const TEMPERATURE = 0.3;

// How far each rubric part is from the expected one.
export function compareRubric(expected, actual) {
  return Object.fromEntries(PARTS.map((p) => [p, actual[p] - expected[p]]));
}

// Agreement over all examples: the share of parts within 1, and the
// examples with a part off by 3 or more.
export function summarize(results) {
  const diffs = results.flatMap((r) => PARTS.map((p) => r.diff[p]));
  const within = diffs.filter((d) => Math.abs(d) <= 1).length;
  const agreement = diffs.length ? within / diffs.length : 0;
  const farOff = results.filter((r) => PARTS.some((p) => Math.abs(r.diff[p]) >= 3)).map((r) => r.id);
  return { agreement, farOff, pass: agreement >= MIN_AGREEMENT && farOff.length === 0 };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Groq's free tier limits tokens a minute. On 429 wait as long as it says
// (retry-after, in seconds), up to a few times.
async function analyze(example, apiKey, attempt = 0) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: TEMPERATURE,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM },
        { role: "user", content: `Topic: ${example.topic}\n\nConversation:\n${analysisTranscript(example.messages)}` },
      ],
    }),
  });
  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error(`Groq refused the key (${response.status}). Use the key set in Netlify.`), { fatal: true });
  }
  if (response.status === 429 && attempt < 5) {
    const wait = Number(response.headers.get("retry-after")) || 20;
    await sleep((wait + 1) * 1000);
    return analyze(example, apiKey, attempt + 1);
  }
  if (!response.ok) throw new Error(`Groq ${response.status}`);
  const data = await response.json();
  return conversationAnalysisSchema.parse(JSON.parse(data.choices[0].message.content));
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("Set GROQ_API_KEY (the key set in Netlify).");
    process.exitCode = 1;
    return;
  }
  const { examples } = JSON.parse(readFileSync(new URL("./eval/conversation-rubric.json", import.meta.url), "utf8"));
  const results = [];
  for (const example of examples) {
    try {
      const { rubric, overall_score } = await analyze(example, apiKey);
      const diff = compareRubric(example.expected, rubric);
      results.push({ id: example.id, diff });
      const shown = PARTS.map((p) => `${p} ${rubric[p]} (${example.expected[p]})`).join(", ");
      console.log(`${example.id}: ${shown}, score ${overall_score}`);
    } catch (err) {
      if (err.fatal) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      console.log(`${example.id}: failed, ${err.message}`);
      results.push({ id: example.id, diff: Object.fromEntries(PARTS.map((p) => [p, 99])) });
    }
  }
  const { agreement, farOff, pass } = summarize(results);
  console.log(`\nWithin 1 of expected: ${Math.round(agreement * 100)}% (need ${MIN_AGREEMENT * 100}%)`);
  if (farOff.length) console.log(`Off by 3 or more: ${farOff.join(", ")}`);
  console.log(pass ? "PASS" : "FAIL");
  process.exitCode = pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
