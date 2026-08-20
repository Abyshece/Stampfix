import { LegalPage, LegalH2 } from './LegalPage';

/**
 * Cardholder Privacy Notice — the end-user (customer) privacy notice, separate
 * from the combined / Merchant-facing Privacy Policy. Written in plain language
 * for the person who saves a loyalty card and collects stamps. GDPR + PIPEDA.
 *
 * Mirrors the split we already have for Terms (TermsOfService vs CardholderTerms).
 * Not legal advice — have counsel review before relying on it.
 */
export function CardholderPrivacy() {
  return (
    <LegalPage title="Cardholder Privacy Notice" lastUpdated="19 August 2026">
      <p>
        This notice explains, in plain terms, how your personal data is handled when you save a digital
        loyalty card issued through Stampfix and collect stamps at a participating business. It is written
        for you, the customer (the “Cardholder”). Businesses using Stampfix should instead read our{' '}
        <a href="/privacy" className="underline">Privacy Policy</a> and{' '}
        <a href="/dpa" className="underline">Data Processing Agreement</a>.
      </p>

      <LegalH2>1. Who processes your data</LegalH2>
      <p>
        The <strong>business (café, shop, or salon) whose card you hold is the data Controller</strong> for
        its own loyalty program — it decides why your data is used. <strong>Stampfix</strong> (17999658
        Canada Inc., d/b/a Stampfix) operates the technology and acts as that business’s{' '}
        <strong>Processor</strong>. Stampfix is an independent Controller only for limited technical and
        security data needed to run and protect the service. As a company based outside the EU, Stampfix
        has appointed an EU representative under Art. 27 GDPR (see our{' '}
        <a href="/impressum" className="underline">Impressum</a>).
      </p>

      <LegalH2>2. What data is processed</LegalH2>
      <ul>
        <li>First and last name</li>
        <li>Email address</li>
        <li>Phone number (only if you choose to provide it, e.g. for card recovery)</li>
        <li>Your Wallet card identifier</li>
        <li>Stamp and reward activity (visits, stamps collected, rewards redeemed, current balance)</li>
        <li>Timestamp of your last activity</li>
        <li>Limited technical data (authentication and security / error logs)</li>
      </ul>

      <LegalH2>3. Who can access your data</LegalH2>
      <ul>
        <li>Only the specific business whose card you hold can see your data.</li>
        <li>Other businesses on Stampfix cannot see it — there is <strong>no cross-store profiling</strong>.</li>
        <li>Stampfix does <strong>not sell your data</strong> and does not use it for advertising.</li>
      </ul>

      <LegalH2>4. Where your data is stored &amp; how it’s protected</LegalH2>
      <p>
        Your data is stored on managed cloud infrastructure in the <strong>EU (Frankfurt)</strong>, with
        some processing in <strong>Canada</strong> (which benefits from an EU adequacy decision). Data is
        encrypted in transit and at rest, access is restricted on a least-privilege basis, and each
        business’s data is logically separated. Where data is transferred outside the EEA, it is protected
        by an adequacy decision or the EU Standard Contractual Clauses.
      </p>

      <LegalH2>5. Why your data is used</LegalH2>
      <ul>
        <li>To operate your digital stamp card and show your stamps and rewards</li>
        <li>To keep your card up to date in Apple Wallet and Google Wallet</li>
        <li>To let the business recognise you and honour the rewards it offers</li>
        <li>To prevent misuse and fraud, and to keep the service secure</li>
      </ul>

      <LegalH2>6. Push notifications</LegalH2>
      <p>
        Your card can send updates to your phone through Apple Wallet or Google Wallet (for example, when
        you receive a stamp or a reward is ready). These are <strong>optional</strong> and can be turned off
        at any time in your Wallet settings for the card. The business is responsible for the content of any
        messages it chooses to send.
      </p>

      <LegalH2>7. How long your data is kept</LegalH2>
      <p>
        Your data is kept while your card is active. If your card is inactive for <strong>24 months</strong>,
        it is erased or irreversibly anonymized. You can ask for your card and data to be deleted at any time.
        Some records may be kept longer only where the law requires it.
      </p>

      <LegalH2>8. Your rights</LegalH2>
      <p>
        Under the GDPR (for EU Cardholders) and PIPEDA (for Canadian Cardholders), you have the right to
        access your data, correct it, request its deletion, restrict or object to processing, receive a copy
        in a portable format, and withdraw consent at any time. Because the business is the Controller of its
        loyalty program, please contact that business first; Stampfix will assist it in responding. EU
        Cardholders also have the right to lodge a complaint with a data-protection supervisory authority.
      </p>

      <LegalH2>9. Contact</LegalH2>
      <p>
        For the loyalty program itself, contact the business whose card you hold. For questions about how
        Stampfix operates the platform, email{' '}
        <a href="mailto:hello@stampfix.app" className="underline">hello@stampfix.app</a>. Our EU
        representative under Art. 27 GDPR is listed in our{' '}
        <a href="/impressum" className="underline">Impressum</a>.
      </p>

      <LegalH2>10. Changes to this notice</LegalH2>
      <p>
        We may update this notice from time to time. Material changes will be communicated where required, and
        the “last updated” date above will change.
      </p>
    </LegalPage>
  );
}
