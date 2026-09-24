/**
 * dateHelpers.js — utility functions for dates and streaks
 *
 * Day keys ("YYYY-MM-DD", the keys of state.sessions and
 * streak.lastPracticeDate) are the user's *local* calendar date. They used
 * to come from toISOString(), which is the UTC date. In Israel (UTC+2/+3)
 * that rolls over at 02:00/03:00, so practice after midnight was filed
 * under the previous day and could break a streak. Build and parse day keys
 * only through the helpers here.
 */

export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// new Date("YYYY-MM-DD") means UTC midnight, which is still the previous
// day anywhere west of UTC. This returns local midnight of that date.
export function parseDateKey(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getTodayString() {
  return toDateKey();
}

export function getGreeting(name = "") {
  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 17) greeting = "Good afternoon";
  const displayName = name ? `, ${name}` : "";
  return `${greeting}${displayName}! 👋`;
}

export function formatDate(dateKey) {
  return parseDateKey(dateKey).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// Oldest first, ending with today.
export function getLastNDays(n, now = new Date()) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    days.push(toDateKey(addDays(now, -i)));
  }
  return days;
}

// Whole calendar days from a day key to today. Rounded because a day
// that crosses a DST change is 23 or 25 hours long.
export function daysSince(dateKey, now = new Date()) {
  if (!dateKey) return Infinity;
  const today = parseDateKey(toDateKey(now));
  return Math.round((today - parseDateKey(dateKey)) / (1000 * 60 * 60 * 24));
}
