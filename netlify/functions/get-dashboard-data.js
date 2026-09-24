// Private read endpoint for usage_dashboard.html — the ONLY consumer of this
// should be that password-gated page. Requires ADMIN_SECRET (set as a Netlify
// environment variable, same pattern as GROQ_API_KEY) to match exactly, or it
// refuses to return anything. If ADMIN_SECRET isn't configured at all, this
// fails closed (returns 500) rather than silently serving data to anyone.
//
// v2 function (export default (req) =>), not the classic handler(event)
// style — see log-event.js for why: Netlify's automatic Blobs credential
// injection needed the v2 signature to work in production during testing.
//
// The secret is only accepted from the X-Admin-Secret header, not the body,
// and compared in constant time. Event details are sanitized again here, not
// just on write, so events stored before that check existed can't carry
// markup into the dashboard.
import { createHash, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { HttpError, errorResponse, json, requirePost } from "./_shared/http.js";
import { sanitizeDetails } from "./_shared/events.js";
// Rough cost estimate per RolePlay turn, derived from real Groq pricing
// measured earlier in this project (~$0.11/user/month at typical usage) —
// good enough for the $10/month alert threshold; not meant to be exact.
const EST_COST_PER_TURN_USD = 0.0004;

// Hashing first gives both sides the same length, which timingSafeEqual
// requires, without leaking the real secret's length.
function secretMatches(provided, expected) {
  const digest = (v) => createHash("sha256").update(String(v)).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

function dateOf(ts) {
  return (ts || "").slice(0, 10);
}

export default async (req) => {
  try {
    requirePost(req);
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) {
      throw new HttpError(500, "server_misconfigured", "Server misconfigured: ADMIN_SECRET is not set");
    }
    const provided = req.headers.get("x-admin-secret");
    if (!provided || !secretMatches(provided, adminSecret)) {
      throw new HttpError(401, "unauthorized", "Unauthorized");
    }

    const store = getStore("events");
    const { blobs } = await store.list();
    const events = (
      await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }).catch(() => null)))
    )
      .filter((ev) => ev && typeof ev.userId === "string")
      .map((ev) => ({ ...ev, details: sanitizeDetails(ev.details) }));

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

    return json(200, {
      users: users.sort((a, b) => (b.lastActiveTs || "").localeCompare(a.lastActiveTs || "")),
      summary: { totalUsers: users.length, weeklyActiveUsers, popularTopics, totalCostUsd },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return errorResponse(err);
  }
};
