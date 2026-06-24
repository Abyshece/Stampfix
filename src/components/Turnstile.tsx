import { useEffect, useRef } from 'react';

// Cloudflare's Turnstile script attaches a global. Declare its shape
// so TypeScript stops complaining.
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'auto' | 'light' | 'dark';
          size?: 'normal' | 'compact';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  /** Fired with a verified token. Caller sends it to verify-turnstile to confirm. */
  onVerify: (token: string) => void;
  /** Fired if the user fails the challenge or it expires. Resets caller state. */
  onError?: () => void;
  /** Visual theme. Defaults to "auto" (light/dark from system). */
  theme?: 'auto' | 'light' | 'dark';
}

/**
 * Cloudflare Turnstile widget.
 *
 * Reads the site key from `VITE_TURNSTILE_SITE_KEY`. If the env var is
 * not set, the component renders nothing and immediately fires onVerify
 * with a placeholder token. That keeps local dev / preview environments
 * working without forcing a Cloudflare account — verify-turnstile is
 * also bypass-friendly when the secret is missing.
 *
 * Why use Turnstile instead of reCAPTCHA: free with no usage limits,
 * privacy-respecting (no Google tracking), faster to load, less
 * friction (mostly silent).
 */
export function Turnstile({ onVerify, onError, theme = 'auto' }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onErrorRef = useRef(onError);

  // Keep callbacks fresh without re-rendering the widget on every parent
  // state change. The widget renders ONCE per mount.
  useEffect(() => { onVerifyRef.current = onVerify; }, [onVerify]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

    // No site key configured: dev/preview path. Fire a placeholder token
    // immediately so the parent form is usable.
    if (!siteKey) {
      onVerifyRef.current('dev-bypass-token');
      return;
    }

    // Ensure the Cloudflare script is loaded exactly once across the page.
    const SCRIPT_ID = 'cf-turnstile-script';
    let scriptEl = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    const loadPromise: Promise<void> = scriptEl
      ? Promise.resolve()
      : new Promise<void>((resolve, reject) => {
          scriptEl = document.createElement('script');
          scriptEl.id = SCRIPT_ID;
          scriptEl.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
          scriptEl.async = true;
          scriptEl.defer = true;
          scriptEl.onload = () => resolve();
          scriptEl.onerror = () => reject(new Error('Failed to load Turnstile script'));
          document.head.appendChild(scriptEl);
        });

    let cancelled = false;
    let verified = false;

    // Safety net: if the widget hasn't produced a token within a few seconds
    // (misconfigured key/domain, stuck challenge, slow network), fail open so
    // the form is never permanently stuck behind a disabled button. A real
    // token wins if it arrives first.
    const timeoutId = window.setTimeout(() => {
      if (!cancelled && !verified) onVerifyRef.current('turnstile-timeout');
    }, 6000);

    loadPromise
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          size: 'normal',
          callback: (token) => { verified = true; onVerifyRef.current(token); },
          // Fail open on challenge error/expiry rather than dead-ending a
          // legitimate user; the server-side verifier still runs on real tokens.
          'error-callback': () => { onErrorRef.current?.(); if (!cancelled) onVerifyRef.current('turnstile-timeout'); },
          'expired-callback': () => { onErrorRef.current?.(); if (!cancelled) onVerifyRef.current('turnstile-timeout'); },
        });
      })
      .catch((err) => {
        // Cloudflare's script didn't load (corporate network, adblock).
        // Fail open: emit a placeholder token so the form remains usable.
        // The server-side verifier will reject it with a Cloudflare error,
        // but that's the right behavior — block actual bots, not blocked-network users.
        console.warn('[turnstile] script load failed:', err);
        onVerifyRef.current('script-load-failed');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); }
        catch { /* widget already gone, ignore */ }
      }
    };
  }, [theme]);

  // Nothing to render if no site key is configured.
  if (!import.meta.env.VITE_TURNSTILE_SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center" />;
}
