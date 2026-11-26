import { LegalPage, LegalH2 } from './LegalPage';
import { reopenCookieBanner } from '../../lib/cookieConsent';

export function CookiePolicy() {
  return (
    <LegalPage title="Cookie Policy" lastUpdated="26 November 2026">
      <p>
        This Cookie Policy explains how <strong>17999658 Canada Inc. (d/b/a Stampfix)</strong> uses
        cookies and similar technologies (such as <em>localStorage</em>) on{' '}
        <strong>stampfix.app</strong>. It should be read together with our{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>
      <p>
        In short: we use only the storage needed to make the site work, plus two optional things that
        run only if you consent: error monitoring, and our own statistics on how visitors use our
        website. <strong>We do not use advertising, marketing, or cross-site tracking cookies, we do
        not use third-party analytics, and we do not sell your data.</strong>
      </p>

      <LegalH2>1. What are cookies?</LegalH2>
      <p>
        Cookies are small text files a website stores on your device; <em>localStorage</em> is a
        similar browser mechanism. They let a site remember things between pages and visits, for
        example, that you are signed in. Under the GDPR and ePrivacy rules, cookies that are strictly
        necessary for a service you request do not require consent; all others do.
      </p>

      <LegalH2>2. Strictly necessary (always active)</LegalH2>
      <p>These are required for the site to function and cannot be switched off.</p>
      <ul className="list-disc pl-5 space-y-2 text-gray-600">
        <li>
          <strong>Sign-in session (Supabase)</strong>: stored in your browser&rsquo;s localStorage to
          keep you securely logged in as a merchant or cardholder. Persists until you sign out or it
          expires.
        </li>
        <li>
          <strong>Payments &amp; fraud prevention (Stripe)</strong>: set only on the checkout/billing
          page when you start a subscription, to process the payment securely and prevent fraud (e.g.
          <code> __stripe_mid</code>, <code>__stripe_sid</code>). Durations range from the length of
          your visit up to about one year.
        </li>
        <li>
          <strong>Security &amp; delivery (hosting/CDN)</strong>: our hosting and content-delivery
          providers (Vercel, Cloudflare) may set short-lived cookies to route traffic, balance load,
          and protect against abuse.
        </li>
        <li>
          <strong>Your cookie choice</strong>: we store your consent decision itself in localStorage
          so we don&rsquo;t ask again on every visit.
        </li>
        <li>
          <strong>Shop pages (stampfix.app/v/&hellip;)</strong>: in localStorage, which of a
          shop&rsquo;s stories you have already watched (<code>sf_story_seen_&hellip;</code>) and your
          best game score (<code>sf_snake_best</code>). These never leave your device. Only when you send
          a shop feedback, a random device ID (<code>sf_device</code>) so that one phone can&rsquo;t send
          feedback over and over; it is not linked to you.
        </li>
      </ul>
      <p className="text-sm text-gray-500">
        Legal basis: these are necessary to provide the service you request (ePrivacy strictly-necessary
        exemption; GDPR Art. 6(1)(b)/(f)).
      </p>

      <LegalH2>3. Optional: error monitoring (only with your consent)</LegalH2>
      <ul className="list-disc pl-5 space-y-2 text-gray-600">
        <li>
          <strong>Sentry</strong>: if you accept, we load Sentry to automatically detect crashes and
          errors so we can fix them. It is configured to <strong>not</strong> record your IP address,
          <strong> not</strong> capture session replays, and to strip personal data. It sets no
          advertising cookies. If you choose &ldquo;Essential only,&rdquo; Sentry is never loaded.
        </li>
      </ul>
      <p className="text-sm text-gray-500">Legal basis: your consent (GDPR Art. 6(1)(a)).</p>

      <LegalH2>4. Optional: website statistics (only with your consent)</LegalH2>
      <p>
        If you tick &ldquo;Website statistics&rdquo; (or choose &ldquo;Accept all&rdquo;), we keep our own
        statistics on how visitors use the public pages of stampfix.app (the home page, features,
        pricing, blog, legal pages and the signup form), so we can see what&rsquo;s useful and what
        isn&rsquo;t. They are not used inside the Stampfix app, on cardholders&rsquo; cards or on
        ordering pages.
      </p>
      <ul className="list-disc pl-5 space-y-2 text-gray-600">
        <li>
          <strong>Stored in your browser (localStorage)</strong>: <code>sf_ins_visitor</code>, a random
          number that tells a returning visitor from a new one (kept 13 months), and{' '}
          <code>sf_ins_session</code>, your current visit (it ends after 30 minutes without activity).
        </li>
        <li>
          <strong>What we record</strong>: the pages you view; how long a page is on screen and in use;
          how far down you scroll; which buttons and links you click and where on the page; repeated
          or unanswered clicks (to find what doesn&rsquo;t work); whether you play the feature video and
          how much of it; whether you start or send the signup or contact form (never what you type);
          the website that sent you (its domain only) and campaign tags in the link; your device type
          (phone, tablet or computer) and language.
        </li>
        <li>
          <strong>What we don&rsquo;t record</strong>: your IP address, name, email or anything you type,
          and we don&rsquo;t combine it with other data or build profiles across websites.
        </li>
        <li>
          <strong>Where it goes</strong>: only to our own database (hosted by Supabase, see{' '}
          <a href="/subprocessors" className="underline">Subprocessors</a>). No third party receives it,
          and it is deleted after 13 months.
        </li>
      </ul>
      <p className="text-sm text-gray-500">
        Legal basis: your consent (GDPR Art. 6(1)(a); storing and reading the two items on your device
        under &sect;25(1) TDDDG). You can withdraw it at any time in the cookie settings; we then stop
        and remove the two items from your browser.
      </p>

      <LegalH2>5. What we do NOT use</LegalH2>
      <p>
        We do not use Google Analytics, advertising pixels (e.g. Meta/Facebook), or any cross-site
        tracking. Our fonts are self-hosted, so loading the site does not share your IP address with
        third-party font providers.
      </p>

      <LegalH2>6. Managing your choices</LegalH2>
      <p>
        When you first visit, a banner lets you accept all cookies or keep only the essential ones. You
        can change your decision at any time:
      </p>
      <p>
        <button
          onClick={reopenCookieBanner}
          className="inline-flex items-center px-4 py-2 rounded-lg bg-[#37352F] text-white text-sm font-medium hover:bg-[#2F2D28] transition"
        >
          Open cookie settings
        </button>
      </p>
      <p>
        You can also block or delete cookies in your browser settings. Note that blocking strictly-
        necessary storage may prevent you from signing in or completing a payment.
      </p>

      <LegalH2>7. Changes and contact</LegalH2>
      <p>
        We may update this policy as our tools change; the date at the top shows the latest version.
        For any question about cookies or your data, contact our Privacy Officer at{' '}
        <a href="mailto:hello@stampfix.app" className="underline">hello@stampfix.app</a> (see the{' '}
        <a href="/impressum" className="underline">Impressum</a> for postal details and our EU
        representative).
      </p>
    </LegalPage>
  );
}
