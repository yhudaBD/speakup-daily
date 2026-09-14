// Private read endpoint for usage_dashboard.html — the ONLY consumer of this
// should be that password-gated page. Requires ADMIN_SECRET (set as a Netlify
// environment variable, same pattern as GROQ_API_KEY) to match exactly, or it
// refuses to return anything. If ADMIN_SECRET isn't configured at all, this
// fails closed (returns 500) rather than silently serving data to anyone.
import { getStore } from "@netlify/blobs";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
// Rough cost estimate per RolePlay turn, derived from real Groq pricing
// measured earlier in this project (~$0.11/user/month at typical usage) —
// good enough for the $10/month alert threshold; not meant to be exact.
const EST_COST_PER_TURN_USD = 0.0004;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
    "Content-Type": "application/json",
  };
}

function dateOf(ts) {
  return (ts || "").slice(0, 10);
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  if (!ADMIN_SECRET) {
    return { statusCode: 500, headers: corsHeaders(), body: JSON.stringify({ error: "Server misconfigured: ADMIN_SECRET is not set" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    payload = {};
  }
  const providedSecret = event.headers["x-admin-secret"] || payload.secret;
  if (providedSecret !== ADMIN_SECRET) {
    return { statusCode: 401, headers: corsHeaders(), body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const store = getStore("events");
    const { blobs } = await store.list();
    const events = (
      await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }).catch(() => null)))
    ).filter(Boolean);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const byUser = new Map();

    for (const ev of events) {
      if (!byUser.has(ev.userId)) {
        byUser.set(ev.userId, {
          userId: ev.userId,
          userName: "",
          activeDates: new Set(),
          placementLevel: null,
          currentLevel: null,
          lastActiveTs: null,
          helpSeries: [],
          topicCounts: {},
          totalTurns: 0,
        });
      }
      const u = byUser.get(ev.userId);
      if (ev.userName) u.userName = ev.userName;
      u.activeDates.add(dateOf(ev.ts));
      if (!u.lastActiveTs || ev.ts > u.lastActiveTs) u.lastActiveTs = ev.ts;
      if (ev.details?.currentLevel) u.currentLevel = ev.details.currentLevel;

      if (ev.type === "placement_completed" && !u.placementLevel) {
        u.placementLevel = ev.details?.level || null;
      }
      if (ev.type === "session_ended" && ev.details?.kind === "roleplay") {
        if (typeof ev.details.helpUsedCount === "number") {
          u.helpSeries.push({ ts: ev.ts, count: ev.details.helpUsedCount });
        }
        if (ev.details.topicTitle) {
          u.topicCounts[ev.details.topicTitle] = (u.topicCounts[ev.details.topicTitle] || 0) + 1;
        }
        u.totalTurns += ev.details.turnCount || 0;
      }
    }

    const globalTopicCounts = {};
    const users = [...byUser.values()].map((u) => {
      const helpSorted = [...u.helpSeries].sort((a, b) => (a.ts < b.ts ? -1 : 1));
      const avg = helpSorted.length ? helpSorted.reduce((s, x) => s + x.count, 0) / helpSorted.length : null;
      let trend = null;
      if (helpSorted.length >= 6) {
        const half = Math.floor(helpSorted.length / 2);
        const earlier = helpSorted.slice(0, half).reduce((s, x) => s + x.count, 0) / half;
        const recent = helpSorted.slice(-half).reduce((s, x) => s + x.count, 0) / half;
        trend = recent < earlier - 0.2 ? "down" : recent > earlier + 0.2 ? "up" : "flat";
      }
      for (const [topic, count] of Object.entries(u.topicCounts)) {
        globalTopicCounts[topic] = (globalTopicCounts[topic] || 0) + count;
      }
      const daysSinceActive = u.lastActiveTs ? Math.floor((now - new Date(u.lastActiveTs).getTime()) / 86400000) : null;

      return {
        userId: u.userId,
        userName: u.userName || "(unnamed)",
        activeDates: [...u.activeDates].sort(),
        placementLevel: u.placementLevel,
        currentLevel: u.currentLevel || u.placementLevel,
        lastActiveTs: u.lastActiveTs,
        daysSinceActive,
        avgHelpUsed: avg,
        helpTrend: trend,
        topicCounts: u.topicCounts,
        estimatedCostUsd: Math.round(u.totalTurns * EST_COST_PER_TURN_USD * 10000) / 10000,
      };
    });

    const weeklyActiveUsers = users.filter(
      (u) => u.lastActiveTs && new Date(u.lastActiveTs).getTime() >= sevenDaysAgo
    ).length;
    const popularTopics = Object.entries(globalTopicCounts)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
    const totalCostUsd = Math.round(users.reduce((s, u) => s + u.estimatedCostUsd, 0) * 10000) / 10000;

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        users: users.sort((a, b) => (b.lastActiveTs || "").localeCompare(a.lastActiveTs || "")),
        summary: { totalUsers: users.length, weeklyActiveUsers, popularTopics, totalCostUsd },
        generatedAt: new Date().toISOString(),
      }),
    };
  } catch (error) {
    return { statusCode: 502, headers: corsHeaders(), body: JSON.stringify({ error: error.message || "Aggregation error" }) };
  }
};
