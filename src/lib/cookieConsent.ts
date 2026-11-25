// Cookie-consent state. Stored in localStorage. "essential" is always true
// (strictly-necessary cookies are exempt from consent); "functional" gates
// error-monitoring (Sentry), which only loads once the user opts in;
// "analytics" gates our own website statistics (src/lib/siteInsights.ts).

export type CookieConsent = { essential: true; functional: boolean; analytics: boolean; ts: number; v: number };

const KEY = 'sf_cookie_consent_v1';
/** Raised when the banner asks something new: everyone who chose before is asked again. */
export const CONSENT_VERSION = 2;

export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { essential: true, functional: !!p.functional, analytics: !!p.analytics, ts: Number(p.ts) || 0, v: Number(p.v) || 1 };
  } catch {
    return null;
  }
}

export function setCookieConsent(functional: boolean, analytics = false): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ essential: true, functional, analytics, ts: Date.now(), v: CONSENT_VERSION }));
    window.dispatchEvent(new Event('sf-cookie-consent'));
  } catch {
    /* storage blocked — nothing we can do; treat as no consent */
  }
}

/** Footer "Cookie settings" link calls this to reopen the banner. */
export function reopenCookieBanner(): void {
  window.dispatchEvent(new Event('sf-cookie-reopen'));
}
