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
import { conversationAnalysisSchema, rubricLevel } from "../src/services/aiSchemas.js";

export const PARTS = ["fluency", "grammar", "vocabulary"];
// What it takes to call the prompt fit: 85% of parts within 1, no part off
// by 3 or more, no pull to one side (the mean difference within 0.4; a
// model that rates everyone 3 passes "within 1" but moves nobody's level),
// and the level each example shows (rubricLevel, which ADJUST_LEVEL uses)
// within one step of the expected one.
export const MIN_AGREEMENT = 0.85;
export const MAX_BIAS = 0.4;
const LEVELS = ["Pre-A1", "A1", "A2", "B1", "B2", "C1"];

const MODEL = "openai/gpt-oss-120b"; // TRANSLATION_MODEL in ai.service.js
const TEMPERATURE = 0.3;

// How far each rubric part is from the expected one.
export function compareRubric(expected, actual) {
  return Object.fromEntries(PARTS.map((p) => [p, actual[p] - expected[p]]));
}

// Levels between the expected rubric's and the actual one's.
export function levelSteps(expected, actual) {
  return LEVELS.indexOf(rubricLevel(actual)) - LEVELS.indexOf(rubricLevel(expected));
}

// Over all examples ({ id, expected, actual }): the share of parts within 1,
// the mean difference, the examples with a part off by 3 or more, and those
// whose level is off by more than one step.
export function summarize(results) {
  const diffs = results.flatMap((r) => PARTS.map((p) => r.actual[p] - r.expected[p]));
  const within = diffs.filter((d) => Math.abs(d) <= 1).length;
  const agreement = diffs.length ? within / diffs.length : 0;
  const bias = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
  const farOff = results.filter((r) => PARTS.some((p) => Math.abs(r.actual[p] - r.expected[p]) >= 3)).map((r) => r.id);
  const levelOff = results.filter((r) => Math.abs(levelSteps(r.expected, r.actual)) > 1).map((r) => r.id);
  const pass = agreement >= MIN_AGREEMENT && Math.abs(bias) <= MAX_BIAS && farOff.length === 0 && levelOff.length === 0;
  return { agreement, bias, farOff, levelOff, pass };
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
      results.push({ id: example.id, expected: example.expected, actual: rubric });
      const shown = PARTS.map((p) => `${p} ${rubric[p]} (${example.expected[p]})`).join(", ");
      console.log(`${example.id}: ${shown}, score ${overall_score}, level ${rubricLevel(rubric)} (${rubricLevel(example.expected)})`);
    } catch (err) {
      if (err.fatal) {
        console.error(err.message);
        process.exitCode = 1;
        return;
      }
      console.log(`${example.id}: failed, ${err.message}`);
      results.push({ id: example.id, expected: example.expected, actual: { fluency: 99, grammar: 99, vocabulary: 99 } });
    }
  }
  const { agreement, bias, farOff, levelOff, pass } = summarize(results);
  console.log(`\nWithin 1 of expected: ${Math.round(agreement * 100)}% (need ${MIN_AGREEMENT * 100}%)`);
  console.log(`Mean difference: ${bias.toFixed(2)} (need within ${MAX_BIAS})`);
  if (farOff.length) console.log(`Off by 3 or more: ${farOff.join(", ")}`);
  if (levelOff.length) console.log(`Level off by 2 or more: ${levelOff.join(", ")}`);
  console.log(pass ? "PASS" : "FAIL");
  process.exitCode = pass ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
