import { LegalPage, LegalH2, Placeholder } from './LegalPage';

/**
 * Terms of Service for Stampfix. Written for a Canadian company (governing
 * law: British Columbia) serving Merchants in Canada and Germany.
 *
 * PLACEHOLDERS to fill once the company is registered:
 *  - Legal entity name
 *  - Registered address (Vancouver, BC)
 *  - Support/legal contact email
 *
 * Not legal advice — have counsel review before public launch.
 */
export function TermsOfService() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="28 May 2026">
      <p>
        These Terms of Service (“Terms”) govern your use of the Stampfix loyalty-card platform (the
        “Service”) provided by <Placeholder>LEGAL ENTITY NAME</Placeholder> (“Stampfix”, “we”, “us”).
        By creating an account or using the Service, you agree to these Terms. If you are using the
        Service on behalf of a business, you confirm you have authority to bind that business.
      </p>

      <LegalH2>1. The Service</LegalH2>
      <p>
        Stampfix lets businesses (“Merchants”) create digital loyalty cards that their customers
        (“Cardholders”) can save to a mobile wallet, and lets Merchants record stamps and rewards.
        We may add, change, or remove features over time.
      </p>

      <LegalH2>2. Accounts</LegalH2>
      <p>
        You must provide accurate information when creating an account and keep your login
        credentials secure. You are responsible for activity that occurs under your account. Notify
        us promptly of any unauthorised use.
      </p>

      <LegalH2>3. Plans, fees, and billing</LegalH2>
      <p>
        The Service is currently offered free of charge up to 10 Cardholders per Merchant. Beyond
        that limit, continued use requires a paid subscription of EUR 19.99 per month (or the
        equivalent in Canadian dollars), billed through our payment provider, Stripe. Prices are
        exclusive of applicable taxes (such as German VAT or Canadian GST/HST), which will be added
        where required.
      </p>
      <p>
        Subscriptions renew automatically until cancelled. You may cancel at any time; cancellation
        takes effect at the end of the current billing period. Fees already paid are non-refundable
        except where required by law.
      </p>

      <LegalH2>4. Merchant responsibilities</LegalH2>
      <p>
        As a Merchant, you are the data controller for your Cardholders’ personal information and are
        responsible for: obtaining any consent required to enrol Cardholders and send them messages;
        honouring the rewards you advertise; and complying with consumer-protection, marketing, and
        data-protection laws applicable to your business, including GDPR (for German Merchants) and
        PIPEDA and applicable provincial law (for Canadian Merchants).
      </p>

      <LegalH2>5. Acceptable use</LegalH2>
      <p>You agree not to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Use the Service for unlawful, fraudulent, or deceptive purposes</li>
        <li>Upload content that infringes others’ rights or is unlawful</li>
        <li>Attempt to disrupt, reverse-engineer, or gain unauthorised access to the Service</li>
        <li>Use the Service to send unsolicited bulk messages in violation of anti-spam laws (including Canada’s CASL and EU rules)</li>
      </ul>

      <LegalH2>6. Intellectual property</LegalH2>
      <p>
        Stampfix and its underlying software, design, and branding are owned by us and protected by
        law. We grant you a limited, non-exclusive, non-transferable right to use the Service while
        these Terms are in effect. You retain ownership of the content and data you provide.
      </p>

      <LegalH2>7. Third-party services</LegalH2>
      <p>
        The Service integrates with third parties such as Google Wallet, Stripe, and email
        providers. Your use of those features may be subject to the third party’s own terms, and we
        are not responsible for third-party services.
      </p>

      <LegalH2>8. Disclaimers</LegalH2>
      <p>
        The Service is provided “as is” and “as available”. To the fullest extent permitted by law,
        we disclaim all warranties, express or implied, including merchantability and fitness for a
        particular purpose. We do not warrant that the Service will be uninterrupted or error-free.
        Note that wallet passes require a compatible device and a valid issuer configuration, which
        may affect availability of that feature.
      </p>

      <LegalH2>9. Limitation of liability</LegalH2>
      <p>
        To the fullest extent permitted by law, Stampfix will not be liable for indirect,
        incidental, special, or consequential damages, or for lost profits or data. Our total
        liability for any claim relating to the Service will not exceed the greater of the amount you
        paid us in the twelve months before the claim, or EUR 100. Some jurisdictions do not allow
        certain limitations, so some of the above may not apply to you.
      </p>

      <LegalH2>10. Termination</LegalH2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or
        terminate access if you breach these Terms or if required to protect the Service or other
        users. On termination, your right to use the Service ends; provisions that by their nature
        should survive (such as limitation of liability) will survive.
      </p>

      <LegalH2>11. Governing law</LegalH2>
      <p>
        These Terms are governed by the laws of the Province of British Columbia and the federal laws
        of Canada applicable there, without regard to conflict-of-laws rules. Mandatory consumer
        protections of your country of residence are unaffected. Where you are a consumer resident in
        the EU, nothing in these Terms deprives you of protections guaranteed by the mandatory law of
        your country of residence.
      </p>

      <LegalH2>12. Changes to these Terms</LegalH2>
      <p>
        We may update these Terms from time to time. We will post the updated version here and revise
        the “Last updated” date, and will notify Merchants of material changes by email. Continued
        use after changes take effect constitutes acceptance.
      </p>

      <LegalH2>13. Contact</LegalH2>
      <p>
        Questions about these Terms? Email <Placeholder>SUPPORT CONTACT EMAIL</Placeholder> or write
        to <Placeholder>REGISTERED ADDRESS, VANCOUVER, BC, CANADA</Placeholder>.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        This document is a template provided for convenience and does not constitute legal advice.
        Have it reviewed by qualified counsel before relying on it.
      </p>
    </LegalPage>
  );
}
