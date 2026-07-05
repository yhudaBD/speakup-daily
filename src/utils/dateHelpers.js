/**
 * dateHelpers.js — utility functions for dates and streaks
 */

export function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

export function getGreeting(name = "") {
  const hour = new Date().getHours();
  let greeting = "Good evening";
  if (hour < 12) greeting = "Good morning";
  else if (hour < 17) greeting = "Good afternoon";
  const displayName = name ? `, ${name}` : "";
  return `${greeting}${displayName}! 👋`;
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function getLastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split("T")[0]);
  }
  return days;
}

export function daysSince(dateString) {
  if (!dateString) return Infinity;
  const then = new Date(dateString);
  const now = new Date();
  const diff = now - then;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
