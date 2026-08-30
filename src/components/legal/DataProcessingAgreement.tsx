import { LegalPage } from './LegalPage';

/**
 * Data Processing Agreement (DPA) — required by GDPR Article 28 whenever
 * one party (the merchant, as data controller) uses another party
 * (Stampfix, as data processor) to handle personal data.
 *
 * Boilerplate written to cover the Article 28 essentials:
 *   - subject matter, duration, nature & purpose
 *   - types of personal data + categories of data subjects
 *   - obligations of the processor
 *   - sub-processors
 *   - data subject rights
 *   - audit + assistance
 *
 * Placeholders for company name + jurisdiction (BC, Canada) match the
 * pattern in PrivacyPolicy/TermsOfService — fill in [PLACEHOLDER]s
 * after BC registration completes.
 */
export function DataProcessingAgreement() {
  return (
    <LegalPage title="Data Processing Agreement" lastUpdated="14 August 2026">
      <p className="text-sm text-gray-500 italic">
        This Data Processing Agreement ("DPA") forms part of the agreement between you (the "Controller", referred to as "you" or "the Merchant") and 17999658 Canada Inc. (d/b/a Stampfix) ("Stampfix", "we", "the Processor") and applies whenever Stampfix processes Personal Data on the Merchant's behalf.
      </p>

      <h2>1. Definitions</h2>
      <p>
        Capitalized terms used but not defined here have the meanings given in the EU General Data Protection Regulation (GDPR) and the UK GDPR. "Personal Data" means any information relating to an identified or identifiable natural person processed by Stampfix on behalf of the Merchant.
      </p>

      <h2>2. Scope and Subject Matter</h2>
      <p>
        Stampfix processes Personal Data solely for the purpose of providing the loyalty-card services described in the main Terms of Service (the "Services"). The Merchant remains the Controller of all customer data collected through their loyalty program; Stampfix acts strictly as the Processor.
      </p>

      <h2>3. Duration of Processing</h2>
      <p>
        Processing continues for the duration of the Merchant's subscription. Upon termination, Stampfix will, at the Merchant's election, return or delete all Personal Data within 30 days, except where retention is required by law.
      </p>

      <h2>4. Nature and Purpose of Processing</h2>
      <p>
        Stampfix processes Personal Data only to operate the loyalty program: tracking stamps, issuing rewards, sending transactional emails, providing analytics to the Merchant, and supporting customer wallet integrations (e.g. Apple Wallet and Google Wallet).
      </p>

      <h2>5. Types of Personal Data and Categories of Data Subjects</h2>
      <p>
        <strong>Personal Data:</strong> Customer name, email address, stamp counts, reward redemption history, IP address (for security), wallet pass identifiers.
      </p>
      <p>
        <strong>Data Subjects:</strong> End customers of the Merchant who enroll in the Merchant's loyalty program.
      </p>

      <h2>6. Obligations of Stampfix (Processor)</h2>
      <ul>
        <li>Process Personal Data only on documented instructions from the Merchant, including with regard to international transfers.</li>
        <li>Never process the Merchant's customer data for Stampfix's own purposes — including advertising, profiling, resale, or training of machine-learning models — and use it only to provide the Services.</li>
        <li>Ensure that personnel authorized to process Personal Data are subject to confidentiality obligations.</li>
        <li>Implement and maintain appropriate technical and organizational security measures (Article 32 GDPR), including:
          <ul>
            <li>AES-256 (or equivalent) encryption at rest for databases and storage, and TLS 1.2/1.3 for all data in transit;</li>
            <li>role- and row-level access control on a least-privilege basis, restricting production data access to authorized personnel;</li>
            <li>multi-tenant isolation, with each Merchant's records logically separated and access enforced at the database (row-level security) and application layer;</li>
            <li>operational, security, and error logging, with personal data minimized in logs;</li>
            <li>confidentiality obligations for all personnel with data access, regular security review, and a Record of Processing Activities maintained under Article 30(2) GDPR.</li>
          </ul>
        </li>
        <li>Notify the Merchant without undue delay and within 24 hours of becoming aware of any Personal Data Breach affecting the Merchant's data — so the Merchant can meet its own 72-hour notification obligation under Article 33 GDPR — including, where available, the nature of the incident, the categories and approximate number of data subjects and records affected, the likely consequences, and the measures taken or proposed.</li>
        <li>Assist the Merchant in responding to Data Subject Requests (access, rectification, deletion, portability, restriction, objection).</li>
        <li>Make available all information necessary to demonstrate compliance with this DPA, and submit to audits no more than once per twelve-month period upon reasonable notice.</li>
      </ul>

      <h2>7. Sub-processors</h2>
      <p>
        The Merchant authorizes Stampfix to engage the following sub-processors, each bound by data protection obligations consistent with this DPA:
      </p>
      <ul>
        <li><strong>Supabase Inc.</strong> — Database, authentication, file storage. Servers located in the EU and Canada.</li>
        <li><strong>Vercel Inc.</strong> — Application hosting and edge networking.</li>
        <li><strong>Resend</strong> — Transactional email delivery.</li>
        <li><strong>Stripe Inc.</strong> — Payment processing (Merchant subscription billing only; not customer data).</li>
        <li><strong>Google LLC</strong> — Google Wallet pass distribution (where the customer opts in).</li>
        <li><strong>Apple Inc.</strong> — Apple Wallet pass distribution and push updates (where the customer opts in).</li>
        <li><strong>Cloudflare Inc.</strong> — DDoS protection and Turnstile bot detection.</li>
        <li><strong>Functional Software, Inc. (Sentry)</strong> — Error monitoring and diagnostics.</li>
      </ul>
      <p>
        The current, canonical list of sub-processors — including each one's purpose, processing location, and transfer mechanism — is maintained at{' '}
        <a href="/subprocessors" className="underline">stampfix.app/subprocessors</a>. Stampfix will give the Merchant 30 days' notice of any new sub-processor and the opportunity to object on reasonable grounds.
      </p>

      <h2>8. International Transfers</h2>
      <p>
        Where Personal Data is transferred outside the European Economic Area or the United Kingdom, transfers are governed by the European Commission's Standard Contractual Clauses (2021/914/EU) or an equivalent legally recognized transfer mechanism. Stampfix's primary processing locations are the EU and Canada; Canada benefits from an EU adequacy decision.
      </p>

      <h2>9. Data Subject Rights</h2>
      <p>
        Stampfix provides Merchants with tools to action data subject requests (deletion via the customer "My Card" page; bulk export and deletion via the Merchant dashboard or written request). The Merchant remains the primary point of contact for their customers' rights requests. Verified requests forwarded by the Merchant are actioned within 14 calendar days where technically possible, with data exports provided in a standard machine-readable format (JSON or CSV).
      </p>

      <h2>10. Return and Deletion of Data</h2>
      <p>
        Upon termination of Services, Stampfix will delete or return all Personal Data to the Merchant within 30 days, unless legal obligations require longer retention (in which case Stampfix will isolate and protect the retained data).
      </p>
      <p>
        Stampfix also applies storage-limitation controls (Article 5(1)(e) GDPR): consistent with the retention schedule in our{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>, end-customer records that remain inactive for 24 months are erased or irreversibly anonymized. Deleted records are removed from production without undue delay; where a copy persists in a backup, it is placed beyond use and removed on the backup's retention cycle, and suppression controls prevent deleted records from being reintroduced during a disaster-recovery restore.
      </p>

      <h2>11. Liability</h2>
      <p>
        Each party's liability under this DPA is governed by the main Terms of Service and applicable data protection law. Nothing in this DPA limits liability under Article 82 GDPR for damages caused by non-compliant processing.
      </p>

      <h2>12. Governing Law</h2>
      <p>
        This DPA is governed by the laws of British Columbia, Canada, with the GDPR taking precedence for processing of EU data subjects.
      </p>

      <h2>13. Contact</h2>
      <p>
        For DPA-related questions or data subject requests escalated to Stampfix as Processor, contact: hello@stampfix.app.
      </p>

      <p className="text-sm text-gray-500 italic mt-8">
        By accepting this DPA at signup, the Merchant agrees to the terms set out above. Stampfix may update this DPA from time to time and will provide notice of material changes via email and in-app.
      </p>
    </LegalPage>
  );
}
