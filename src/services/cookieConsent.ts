// Cookie-consent state. Stored in localStorage. "essential" is always true
// (strictly-necessary cookies are exempt from consent); "functional" gates
// error-monitoring (Sentry), which only loads once the user opts in.

export type CookieConsent = { essential: true; functional: boolean; ts: number };

const KEY = 'sf_cookie_consent_v1';

export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return { essential: true, functional: !!p.functional, ts: Number(p.ts) || 0 };
  } catch {
    return null;
  }
}

export function setCookieConsent(functional: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ essential: true, functional, ts: Date.now() }));
    window.dispatchEvent(new Event('sf-cookie-consent'));
  } catch {
    /* storage blocked — nothing we can do; treat as no consent */
  }
}

/** Footer "Cookie settings" link calls this to reopen the banner. */
export function reopenCookieBanner(): void {
  window.dispatchEvent(new Event('sf-cookie-reopen'));
}
