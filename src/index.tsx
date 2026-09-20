import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/400-italic.css';
import '@fontsource/lora/600.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry, SentryErrorBoundary } from './lib/sentry';
import { ToastProvider } from './components/ToastProvider';
import { CookieBanner } from './components/CookieBanner';
import { getCookieConsent } from './lib/cookieConsent';
import './i18n';

// --- DOM-mutation guard (browser translation / extensions) -----------------
// Google Translate / in-browser "Translate this page" and some extensions
// rewrite the text nodes React manages; React's later removeChild / insertBefore
// then targets a node whose parent has changed and throws NotFoundError, which
// unmounts the whole app. We already ship native EN/DE, so that layer is
// redundant. Make the two calls no-op safely when the relationship is already
// broken (the widely used workaround for React issue #11538). Correct calls are
// unchanged: this only triggers in the exact case that would have thrown.
if (typeof Node === 'function' && Node.prototype) {
  const proto = Node.prototype as {
    removeChild: <T extends Node>(child: T) => T;
    insertBefore: <T extends Node>(node: T, ref: Node | null) => T;
  };
  const _removeChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return _removeChild.call(this, child) as T;
  };
  const _insertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return node;
    return _insertBefore.call(this, node, ref) as T;
  };
}

// --- Stale code-split chunk recovery (after a deploy) -----------------------
// A dynamic import() 404s when a user keeps an old tab open across a deploy:
// Vite fingerprints chunks by content hash, so the old MerchantApp-XXXX.js is
// gone. Vite fires `vite:preloadError`; reload once to fetch the fresh
// index.html + chunk names. The 10s throttle avoids a reload loop if a module
// genuinely can't be fetched (offline / real outage).
window.addEventListener('vite:preloadError', () => {
  const key = 'sf_chunk_reload_at';
  const last = Number(sessionStorage.getItem(key) || '0');
  if (Date.now() - last < 10000) return;
  try { sessionStorage.setItem(key, String(Date.now())); } catch { /* ignore */ }
  window.location.reload();
});

// Error-monitoring is a consented, non-essential cookie: only start Sentry
// if the user has opted in. The banner starts it immediately on consent.
if (getCookieConsent()?.functional) initSentry();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element');

/**
 * Fallback UI when the React tree throws an uncaught error. Kept very
 * simple — if the app's main code is broken, the fallback shouldn't
 * depend on it. Plain inline styles, no fonts, no Tailwind, no app
 * components. The error itself goes to Sentry.
 */
function FatalError() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#37352F',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 24, margin: '0 0 8px', fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ color: '#6B6B6B', lineHeight: 1.5, marginBottom: 24 }}>
          We've been notified and are looking into it. Please try refreshing the page.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#37352F',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <SentryErrorBoundary fallback={<FatalError />}>
      <ToastProvider>
        <App />
      </ToastProvider>
      <CookieBanner />
    </SentryErrorBoundary>
  </React.StrictMode>,
);
