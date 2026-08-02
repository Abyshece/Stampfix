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

// Initialise Sentry before React mounts so any error during initial render
// is captured. Safe no-op if VITE_SENTRY_DSN is not set.
initSentry();

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
    </SentryErrorBoundary>
  </React.StrictMode>,
);
