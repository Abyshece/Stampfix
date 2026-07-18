import { LegalPage, LegalH2, Placeholder } from './LegalPage';

/**
 * Privacy Policy covering both PIPEDA (Canada, where the company is/will be
 * established) and GDPR (EU, because German merchants and their customers
 * are EU data subjects).
 *
 * PLACEHOLDERS to fill once the company is registered:
 *  - Legal entity name
 *  - Registered address (Vancouver, BC)
 *  - Privacy contact email
 *  - EU representative (GDPR Art. 27) — once appointed
 *
 * This is a solid, honest starting template — but it is not legal advice.
 * Have a lawyer review before relying on it for a public launch.
 */
export function PrivacyPolicy() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="28 May 2026">
      <p>
        This Privacy Policy explains how 17999658 Canada Inc. (d/b/a Stampfix) (“Stampfix”,
        “we”, “us”) collects, uses, and protects personal information when you use our digital
        loyalty-card platform at stampfix.app (the “Service”). We are committed to handling personal
        information in accordance with Canada’s Personal Information Protection and Electronic
        Documents Act (PIPEDA) and, where applicable, the EU General Data Protection Regulation
        (GDPR).
      </p>

      <LegalH2>1. Who we are (Data Controller)</LegalH2>
      <p>
        The data controller responsible for your personal information is:
      </p>
      <p>
        17999658 Canada Inc. (d/b/a Stampfix)<br />
        28-16223 23A Ave, Surrey BC V3Z 6P4, Canada<br />
        Email: privacy@stampfix.app
      </p>
      <p>
        For individuals in the European Union, our representative pursuant to Article 27 GDPR is:
      </p>
      <p>
        <strong>Abhishek Abhishek</strong><br />
        Wilhelm-Dahl-Straße 21, Würzburg, Germany<br />
        Email: abysheke@gmail.com
      </p>
      <p className="text-xs text-gray-500">
        The EU Representative acts as a point of contact for EU data subjects and supervisory
        authorities in accordance with Article 27(4) GDPR. Data subjects in the European Union
        may address requests to either the Representative or directly to the Company at the
        addresses above.
      </p>

      <LegalH2>2. The two roles we play</LegalH2>
      <p>
        Stampfix serves businesses (“Merchants”) who run loyalty programs, and the customers of
        those businesses (“Cardholders”).
      </p>
      <p>
        <strong>For Merchant account data</strong> (the business owner’s email, business details,
        billing information), Stampfix is the data controller.
      </p>
      <p>
        <strong>For Cardholder data</strong> (the end customer’s name, email, stamp activity),
        the Merchant is the controller and Stampfix acts as a data processor on the Merchant’s
        behalf. We process Cardholder data only to provide the loyalty service to that Merchant.
      </p>

      <LegalH2>3. Information we collect</LegalH2>
      <p><strong>From Merchants:</strong></p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Email address and password (for account creation and login)</li>
        <li>Business name and country</li>
        <li>Business registration details where required for billing — e.g. German Handelsregister number and VAT ID (USt-IdNr.), or Canadian Business Number</li>
        <li>Loyalty program configuration (offer text, branding, stamp rules)</li>
        <li>Payment information, processed by our payment provider (we do not store full card numbers)</li>
      </ul>
      <p><strong>From Cardholders:</strong></p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Name and email address</li>
        <li>Optionally, age, if provided at signup</li>
        <li>Stamp and reward activity (when stamps are collected or rewards redeemed)</li>
      </ul>
      <p><strong>Automatically:</strong></p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Basic technical data such as IP address, browser type, and timestamps, used for security and to operate the Service</li>
      </ul>

      <LegalH2>4. Why we use it and our legal basis</LegalH2>
      <p>
        Under PIPEDA we process personal information with your knowledge and consent, for purposes a
        reasonable person would consider appropriate. Under GDPR, our legal bases are:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Performance of a contract</strong> (Art. 6(1)(b)) — to create accounts, issue loyalty cards, and track stamps</li>
        <li><strong>Legitimate interests</strong> (Art. 6(1)(f)) — to keep the Service secure and prevent fraud</li>
        <li><strong>Consent</strong> (Art. 6(1)(a)) — for marketing emails, where applicable; you can withdraw consent at any time</li>
        <li><strong>Legal obligation</strong> (Art. 6(1)(c)) — to retain billing records as required by tax law</li>
      </ul>

      <LegalH2>5. How we share information</LegalH2>
      <p>
        We do not sell personal information. We share it only with service providers who help us run
        the Service, under contracts that require them to protect it:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Supabase</strong> — database, authentication, and hosting of application data</li>
        <li><strong>Vercel</strong> — website hosting</li>
        <li><strong>Resend</strong> — transactional email delivery (confirmation and magic-link emails)</li>
        <li><strong>Google</strong> — Google Wallet pass issuance, when a Cardholder chooses to save a card to Google Wallet</li>
        <li><strong>Stripe</strong> — payment processing for paid Merchant subscriptions</li>
      </ul>

      <LegalH2>6. International data transfers</LegalH2>
      <p>
        Stampfix is established in Canada, so personal information of EU data subjects may be
        transferred to and processed in Canada. The European Commission has recognised Canada as
        providing an adequate level of data protection for commercial organisations subject to
        PIPEDA (the EU–Canada adequacy decision), which provides a lawful basis for these transfers.
        Where any provider processes data outside Canada or the EEA, we rely on appropriate
        safeguards such as the European Commission’s Standard Contractual Clauses.
      </p>

      <LegalH2>7. How long we keep it (retention schedule)</LegalH2>
      <p>
        We keep personal information only as long as needed for the purpose it was collected, plus
        any period required by law. The table below sets out our retention periods by data category.
        When the period ends, data is either deleted permanently or anonymised so it can no longer
        identify you.
      </p>
      <div className="overflow-x-auto my-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-[#F7F7F5] text-left">
              <th className="border notion-border px-3 py-2 font-semibold">Data category</th>
              <th className="border notion-border px-3 py-2 font-semibold">Retention period</th>
              <th className="border notion-border px-3 py-2 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border notion-border px-3 py-2">Cardholder card data (active card)</td>
              <td className="border notion-border px-3 py-2">While the card is active</td>
              <td className="border notion-border px-3 py-2">Service provision</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Cardholder card data (deletion requested)</td>
              <td className="border notion-border px-3 py-2">24-hour grace window, then permanent erasure</td>
              <td className="border notion-border px-3 py-2">Allow mistake recovery; GDPR Art. 17</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Cardholder card data (Merchant closed account)</td>
              <td className="border notion-border px-3 py-2">30 days, then permanent erasure</td>
              <td className="border notion-border px-3 py-2">Merchant restore window</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Stamp / reward activity log</td>
              <td className="border notion-border px-3 py-2">Linked to the card; deleted with the card</td>
              <td className="border notion-border px-3 py-2">Dispute evidence; audit</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Merchant account data (active)</td>
              <td className="border notion-border px-3 py-2">Until subscription cancelled</td>
              <td className="border notion-border px-3 py-2">Service provision</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Merchant account data (cancelled)</td>
              <td className="border notion-border px-3 py-2">30 days, then permanent erasure</td>
              <td className="border notion-border px-3 py-2">Restore window</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Billing & invoice records</td>
              <td className="border notion-border px-3 py-2"><strong>6 years</strong></td>
              <td className="border notion-border px-3 py-2">Required by Canada Revenue Agency under Income Tax Act s.230</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Support tickets</td>
              <td className="border notion-border px-3 py-2">2 years after resolution</td>
              <td className="border notion-border px-3 py-2">Continuity for recurring issues</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Email delivery logs (Resend)</td>
              <td className="border notion-border px-3 py-2">~30 days (vendor default)</td>
              <td className="border notion-border px-3 py-2">Deliverability debugging</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Server access logs</td>
              <td className="border notion-border px-3 py-2">Vendor default (Supabase, Vercel)</td>
              <td className="border notion-border px-3 py-2">Security; incident response</td>
            </tr>
            <tr>
              <td className="border notion-border px-3 py-2">Database backups</td>
              <td className="border notion-border px-3 py-2">7-30 days rolling</td>
              <td className="border notion-border px-3 py-2">Disaster recovery</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Where data must be retained beyond the periods above to comply with a legal obligation
        (e.g. tax law), we isolate it, restrict access, and use it only for that purpose. You can
        request earlier deletion at any time by contacting us — we will honour the request except
        where retention is legally required, in which case we will explain why.
      </p>

      <LegalH2>8. Your rights</LegalH2>
      <p>
        Depending on where you live, you have rights over your personal information. Under GDPR these
        include access, rectification, erasure, restriction, portability, and objection, as well as
        the right to withdraw consent and to lodge a complaint with a supervisory authority. Under
        PIPEDA you have the right to access your information and challenge its accuracy, and to
        complain to the Office of the Privacy Commissioner of Canada.
      </p>
      <p>
        Cardholders should direct requests to the Merchant whose program they joined, as that
        Merchant is the controller of their data; we will assist the Merchant in responding. For
        Merchant account data, or to exercise any right directly, contact us at{' '}
        privacy@stampfix.app.
      </p>

      <LegalH2>9. Security</LegalH2>
      <p>
        We use industry-standard measures including encryption in transit, row-level access controls
        in our database, and restricted administrative access. No method of transmission or storage
        is completely secure, but we work to protect your information and to notify you and any
        relevant authority of a breach where required by law.
      </p>

      <LegalH2>10. Children</LegalH2>
      <p>
        The Service is intended for businesses and their adult customers. We do not knowingly collect
        personal information from children. If you believe a child has provided us information,
        contact us and we will delete it.
      </p>

      <LegalH2>11. Changes to this policy</LegalH2>
      <p>
        We may update this policy from time to time. We will post the updated version here and revise
        the “Last updated” date. Material changes will be communicated to Merchants by email.
      </p>

      <LegalH2>12. Cookies and similar technologies</LegalH2>
      <p>
        We use only strictly necessary cookies and local storage — the items required to make the
        Service work. These keep you signed in (your authentication session) and protect the signup
        and login forms against bots and abuse (Cloudflare Turnstile). We do <strong>not</strong> use
        advertising, analytics, or cross-site tracking cookies, and we do not sell or share data for
        behavioural advertising. Because we set only essential cookies, no cookie-consent banner is
        required under the ePrivacy Directive and GDPR. You can clear cookies in your browser at any
        time; doing so will sign you out.
      </p>

      <LegalH2>13. Contact</LegalH2>
      <p>
        Questions about this policy or your personal information? Email{' '}
        privacy@stampfix.app or write to{' '}
        28-16223 23A Ave, Surrey BC V3Z 6P4, Canada.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        Last updated: 18 July 2026
      </p>
    </LegalPage>
  );
}
