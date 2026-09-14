# SpeakUp Daily

A daily English speaking-practice app for Hebrew-speaking adults — pronunciation drills,
AI roleplay conversations, an AI-run placement conversation that builds a personal learning
plan, and a private usage dashboard for running a friend beta before pricing anything.

Live: https://admirable-cassata-5ac5ae.netlify.app
Dashboard (owner-only, password-gated): `/usage_dashboard.html`

See **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** for the full architecture, feature list,
and data model. See **[placement_prompt.md](./placement_prompt.md)** for the AI placement
conversation's system prompt and the Groq reliability quirks it works around.

## Stack

React 19 + Vite 8, no backend framework — Netlify Functions for anything that needs a secret
(Groq API key) or shared storage (Netlify Blobs for usage analytics). State lives in
`localStorage` per device; there is no login/account system.

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
committed to the repo): `GROQ_API_KEY`, `ADMIN_SECRET`.

## Workflow

One feature branch per task, build (`npm run build`) and lint (`npm run lint`) clean, then
merge `--no-ff` into `main` and push. `git log --oneline` on `main` is the authoritative
history of what's been built and why — commit messages here are written to stand alone.
