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
        This Privacy Policy explains how <Placeholder>LEGAL ENTITY NAME</Placeholder> (“Stampfix”,
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
        <Placeholder>LEGAL ENTITY NAME</Placeholder><br />
        <Placeholder>REGISTERED ADDRESS, VANCOUVER, BC, CANADA</Placeholder><br />
        Email: <Placeholder>PRIVACY CONTACT EMAIL</Placeholder>
      </p>
      <p>
        For individuals in the European Union, our representative pursuant to Article 27 GDPR is:{' '}
        <Placeholder>EU REPRESENTATIVE — TO BE APPOINTED</Placeholder>.
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

      <LegalH2>7. How long we keep it</LegalH2>
      <p>
        We keep Merchant account data for as long as the account is active, and for a reasonable
        period afterward to meet legal and tax obligations. Cardholder data is retained while the
        Merchant’s loyalty program is active; when a Merchant deletes a Cardholder or closes their
        account, the associated data is deleted, subject to any retention required by law.
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
        <Placeholder>PRIVACY CONTACT EMAIL</Placeholder>.
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

      <LegalH2>12. Contact</LegalH2>
      <p>
        Questions about this policy or your personal information? Email{' '}
        <Placeholder>PRIVACY CONTACT EMAIL</Placeholder> or write to{' '}
        <Placeholder>REGISTERED ADDRESS, VANCOUVER, BC, CANADA</Placeholder>.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        This document is a template provided for convenience and does not constitute legal advice.
        Have it reviewed by qualified counsel before relying on it.
      </p>
    </LegalPage>
  );
}
