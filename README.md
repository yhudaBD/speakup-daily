# SpeakUp Daily

A daily English speaking-practice app for Hebrew-speaking adults — pronunciation drills,
sentence-completion practice, AI roleplay conversations, an AI-run placement conversation
that builds a personal learning plan (shown as a visual progress path), and a private usage
dashboard for running a friend beta before pricing anything. Sign-in is with Google, and
history syncs across devices for the same account.

Live: https://admirable-cassata-5ac5ae.netlify.app
Dashboard (owner-only, password-gated): `/usage_dashboard.html`

See **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** for the full architecture, feature list,
and data model. See **[placement_prompt.md](./placement_prompt.md)** for the AI placement
conversation's system prompt and the Groq reliability quirks it works around.

## Stack

React 19 + Vite 8, no backend framework — Netlify Functions for anything that needs a secret
(Groq API key) or shared storage (Netlify Blobs for usage analytics). Auth is Firebase
(Google sign-in, required); state lives in `localStorage` per device and syncs to Firestore
per account once signed in.

## Local development

```bash
npm install
```

Copy `.env.example` to `.env.local` and fill in:

- `GROQ_API_KEY` — from [console.groq.com/keys](https://console.groq.com/keys). Powers chat,
  translation, transcription, and the placement conversation.
- `ADMIN_SECRET` — any password you choose, to open `/usage_dashboard.html` locally.

Then run the app **through Netlify Functions**, not plain Vite, or the AI features and
dashboard will 500 (missing key) since neither is available outside `netlify dev`:

```bash
npx netlify dev
```

This prints a local URL (a random port, shown in the terminal) that proxies both the Vite
dev server and the functions in `netlify/functions/`. Plain `npm run dev` also works but only
for pages that don't call the AI or the dashboard.

Netlify Blobs (used for dashboard event storage) does **not** work in local dev unless this
project is linked to a real Netlify site (`netlify link`, requires login) — expect
`MissingBlobsEnvironmentError` locally otherwise. It works automatically once deployed.

## Deployment

The Netlify site is connected to this repo's `main` branch — every push deploys automatically.
Required environment variables (Site settings → Environment variables on Netlify, never
committed to the repo): `GROQ_API_KEY`, `ADMIN_SECRET`. Optional: `AI_DAILY_LIMIT_PER_USER`
(AI calls per account per day, default 600).

**Crash reporting (optional)**: render crashes are caught by error boundaries
(`src/components/ErrorBoundary.jsx`) and go through `src/services/errorReporting.js`, which
only logs to the console unless the build has `VITE_SENTRY_DSN`. To turn on Sentry:
1. Set `VITE_SENTRY_DSN` in Netlify's environment variables. It's read at build time, so
   redeploy after setting it.
2. Add the project's ingest host (e.g. `https://o123456.ingest.us.sentry.io`) to
   `connect-src` in the CSP in `netlify.toml`. Otherwise the browser blocks the reports.

Without a DSN the Sentry SDK is compiled out and isn't downloaded at all.

**Firestore security rules** live in `firestore.rules` and are *not* deployed by Netlify. They
are the only thing keeping one account from reading another's synced history (the Firebase
web config is public by design). After changing them, deploy with
`npx firebase-tools deploy --only firestore:rules` (project set in `.firebaserc`), or paste the
file into Firebase Console → Firestore → Rules.

**Netlify Free build-minute cap**: the account is on Netlify's free tier, capped at 300 build
minutes/month account-wide (not per site) on a fixed monthly anchor date — not the calendar
month. Every push to `main` **and every open PR's deploy preview** consumes this same pool.
When it runs out, builds silently stop (no error — the tell is the latest commit on `main`
having zero GitHub commit statuses instead of a `netlify/...` context). It resets automatically
next cycle (check the exact date under Netlify's Team settings → Billing → Usage), but a build
that was skipped while the quota was exhausted does **not** run automatically once it resets —
trigger it manually from the Netlify UI ("Trigger deploy") or push again. See
PROJECT_OVERVIEW.md §9 for the full incident writeup from September 2026.

## Workflow

One feature branch per task, tests (`npm test -- --run`), build (`npm run build`) and lint
(`npm run lint`) clean, then
merge `--no-ff` into `main` and push. GitHub Actions (`.github/workflows/ci.yml`) runs the same
checks, plus `npm audit` on production dependencies, on every push, so a red check on `main`
means the deploy Netlify just made should not have happened. Netlify skips the build entirely
when a push touches only docs/tests/CI/Firestore rules (`ignore` in `netlify.toml`). `git log --oneline` on `main` is the authoritative
history of what's been built and why — commit messages here are written to stand alone.
