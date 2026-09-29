// Which cloud structure an account uses (MIGRATION_PLAN.md §8): schema 2
// (the single document) unless switched on, first for listed accounts
// (VITE_CLOUD_V3_EMAILS, comma separated), then for everyone
// (VITE_CLOUD_SCHEMA=v3). Setting VITE_CLOUD_SCHEMA back to v2 and
// redeploying is the way back.
export function cloudSchemaFor(email, env = import.meta.env) {
  if (env.VITE_CLOUD_SCHEMA === "v3") return "v3";
  const listed = String(env.VITE_CLOUD_V3_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return email && listed.includes(email.toLowerCase()) ? "v3" : "v2";
}
