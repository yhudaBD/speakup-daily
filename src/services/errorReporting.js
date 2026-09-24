// One place every caught crash goes through (ErrorBoundary, and anything
// else worth reporting later). It always logs to the console. When the
// build has a Sentry DSN (VITE_SENTRY_DSN, set in Netlify's environment
// variables), it also sends the error to Sentry.
//
// Sentry is loaded with a dynamic import behind a build-time constant.
// Without a DSN the import is dead code, the SDK never reaches the bundle
// or the service-worker precache, and users download nothing extra.
// Enabling it also needs the project's ingest host in the CSP's
// connect-src (see README).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

let sentry = null;

export function initErrorReporting() {
  if (!SENTRY_DSN || sentry) return sentry;
  sentry = import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        sendDefaultPii: false,
        tracesSampleRate: 0,
      });
      return Sentry;
    })
    .catch((err) => {
      console.warn("Error reporting unavailable:", err);
      return null;
    });
  return sentry;
}

export function reportError(error, context = {}) {
  console.error(error, context);
  initErrorReporting()?.then((Sentry) => Sentry?.captureException(error, { extra: context }));
}
