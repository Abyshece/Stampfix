import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCookieConsent, setCookieConsent, CONSENT_VERSION } from '../lib/cookieConsent';
import { initSentry } from '../lib/sentry';
import { useTranslation } from 'react-i18next';

/**
 * GDPR / ePrivacy cookie banner. Shows on first visit (and when reopened from
 * the footer, or when it asks something new). Nothing non-essential runs before
 * consent: error-monitoring (Sentry) and our own website statistics only start
 * if the user accepts. "Essential only" is as prominent as "Accept all", and no
 * non-essential option is pre-ticked.
 */
export function CookieBanner() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [functional, setFunctional] = useState(false); // never pre-consented
  const [analytics, setAnalytics] = useState(false);   // never pre-consented

  useEffect(() => {
    const c = getCookieConsent();
    // First visit, or chosen before the banner asked about website statistics.
    // Never inside a frame (the admin panel's heatmap preview shows pages in one).
    if ((!c || c.v < CONSENT_VERSION) && window.top === window) setOpen(true);
    const reopen = () => {
      const now = getCookieConsent();
      setFunctional(now?.functional ?? false);
      setAnalytics(now?.analytics ?? false);
      setCustomize(true);
      setOpen(true);
    };
    window.addEventListener('sf-cookie-reopen', reopen);
    return () => window.removeEventListener('sf-cookie-reopen', reopen);
  }, []);

  if (!open) return null;

  const save = (fn: boolean, an: boolean) => {
    setCookieConsent(fn, an);
    if (fn) { try { initSentry(); } catch { /* ignore */ } }
    setOpen(false);
  };

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[200] p-4 sm:p-6">
      <div className="mx-auto max-w-3xl bg-white border notion-border rounded-xl shadow-2xl p-5 sm:p-6">
        <h2 className="text-base font-semibold text-[#37352F]">{t('cust.cookie.title', { defaultValue: 'We use cookies' })}</h2>
        <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
          {t('cust.cookie.bodyA', { defaultValue: 'We use' })} <strong>{t('cust.cookie.essential', { defaultValue: 'essential' })}</strong> {t('cust.cookie.bodyB2', { defaultValue: "cookies to run Stampfix, for example to keep you signed in, process payments and keep the site secure. With your consent, we also use error monitoring to fix problems, and our own website statistics to see how visitors use stampfix.app. No advertising cookies, no third-party trackers. See our" })}{' '}
          <a href="/cookies" className="underline text-[#37352F] hover:text-black">{t('cust.cookie.cookiePolicy', { defaultValue: 'Cookie Policy' })}</a>.
        </p>

        {customize && (
          <div className="mt-4 space-y-3 border-t notion-border pt-4">
            <label className="flex items-start gap-3 opacity-70">
              <input type="checkbox" checked disabled className="mt-0.5" />
              <span className="text-sm text-gray-600">
                <b className="text-[#37352F]">{t('cust.cookie.necessaryB', { defaultValue: 'Strictly necessary' })}</b>: {t('cust.cookie.necessaryRest', { defaultValue: 'required for sign-in, payments and security. Always on.' })}
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={functional}
                onChange={(e) => setFunctional(e.target.checked)}
                className="mt-0.5 accent-[#37352F]"
              />
              <span className="text-sm text-gray-600">
                <b className="text-[#37352F]">{t('cust.cookie.errorMonB', { defaultValue: 'Error monitoring' })}</b>: {t('cust.cookie.errorMonRest', { defaultValue: 'helps us find and fix bugs (Sentry). No advertising, and your IP is removed.' })}
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="mt-0.5 accent-[#37352F]"
                data-consent-analytics
              />
              <span className="text-sm text-gray-600">
                <b className="text-[#37352F]">{t('cust.cookie.analyticsB', { defaultValue: 'Website statistics' })}</b>: {t('cust.cookie.analyticsRest', { defaultValue: 'our own statistics on how visitors use stampfix.app (pages, scrolling, clicks), to make it better. Kept by us only, no IP address, deleted after 13 months.' })}
              </span>
            </label>
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:items-center">
          {!customize && (
            <button
              onClick={() => setCustomize(true)}
              className="order-3 sm:order-1 sm:mr-auto text-sm text-gray-500 hover:text-[#37352F] underline px-1 py-2"
            >
              {t('cust.cookie.customize', { defaultValue: 'Customize' })}
            </button>
          )}
          <button
            onClick={() => save(false, false)}
            className="order-2 px-5 py-2.5 rounded-lg border notion-border text-sm font-medium text-[#37352F] hover:bg-gray-50 transition"
          >
            {t('cust.cookie.essentialOnly', { defaultValue: 'Essential only' })}
          </button>
          <button
            onClick={() => (customize ? save(functional, analytics) : save(true, true))}
            className="order-1 sm:order-3 px-5 py-2.5 rounded-lg bg-[#37352F] text-white text-sm font-medium hover:bg-[#2F2D28] transition"
          >
            {customize ? t('cust.cookie.saveChoices', { defaultValue: 'Save choices' }) : t('cust.cookie.acceptAll', { defaultValue: 'Accept all' })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
