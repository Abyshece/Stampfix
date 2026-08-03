import * as Sentry from '@sentry/react';

/**
 * Initialise Sentry for production error monitoring.
 *
 * Behaviour:
 *  - If VITE_SENTRY_DSN is not set (e.g. local dev), this is a complete
 *    no-op. No requests, no console noise, nothing to clean up.
 *  - Captures uncaught JS errors and unhandled promise rejections.
 *  - Records the last few seconds of UI interactions via Session Replay
 *    so we can see what the user clicked before the error.
 *  - Replays are sampled at 10% on normal sessions and 100% on sessions
 *    that have errors — this keeps the free-tier quota healthy while
 *    still capturing every problem.
 *  - Tagged with environment ('production'/'preview') so dev errors
 *    don't pollute production dashboards.
 */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured — running locally or in a build without monitoring.
    return;
  }

  // Vercel exposes VERCEL_ENV at build time; default to "development".
  // import.meta.env.MODE is Vite's mode ('production' for `vite build`).
  const environment =
    (import.meta.env.VITE_VERCEL_ENV as string | undefined) ||
    (import.meta.env.MODE as string | undefined) ||
    'development';

  Sentry.init({
    dsn,
    environment,
    // Third-party noise, not our code: the Instagram/Facebook in-app browser
    // (Meta) injects a script that, on pagehide, calls window.webkit.messageHandlers
    // to message native iOS. When that bridge isn't present it throws — it never
    // affects the user, so we don't report it.
    ignoreErrors: [/webkit\.messageHandlers/i, 'sendDataToNative', 'sendPageHideMessage'],
    // Only the React integration + replay. We deliberately skip BrowserTracing
    // (performance monitoring) for v1 — it doubles the quota and we don't
    // have a performance story to investigate yet.
    // Privacy: send no PII to the monitoring tool. Session Replay is disabled
    // entirely (it records UI sessions and is the most privacy-invasive part),
    // default PII (IP, cookies) is off, and any IP that slips through is stripped
    // in beforeSend. Uncaught-error tracking still works fully.
    integrations: [],
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) delete event.user.ip_address;
      return event;
    },
    // Don't ship errors from non-prod builds to the prod dashboard.
    enabled: environment !== 'development',
  });
}

// Re-export the ErrorBoundary so callers don't need to also import Sentry.
export const SentryErrorBoundary = Sentry.ErrorBoundary;
