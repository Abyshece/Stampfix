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
    <LegalPage title="Terms of Service" lastUpdated="19 June 2026">
      <p>
        These Terms of Service (“Terms”) govern your use of the Stampfix loyalty-card platform (the
        “Service”) provided by 17999658 Canada Inc. (d/b/a Stampfix) (“Stampfix”, “we”, “us”).
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
        that limit, continued use requires a paid subscription: EUR 19.99 per month incl. USt. for
        Merchants in Germany, or CA$29.99 per month for Merchants in Canada (plus applicable
        GST/HST). Subscriptions are billed monthly through our payment provider, Stripe, and can be
        cancelled at any time from your dashboard.
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
        The Service integrates with third parties such as Apple Wallet, Google Wallet, Stripe, and email
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

      <LegalH2>10. Indemnity</LegalH2>
      <p>
        You agree to defend, indemnify, and hold harmless Stampfix and its officers, directors,
        employees, and service providers from and against any claims, liabilities, damages, losses,
        and expenses (including reasonable legal fees) arising out of or relating to: (a) your use of
        the Service; (b) the operation of your loyalty program, including the rewards you offer and
        your communications with Cardholders; (c) any content or data you provide; (d) your breach of
        these Terms; or (e) your violation of any applicable law, including data-protection law (such
        as PIPEDA or the GDPR) and anti-spam law (such as Canada’s Anti-Spam Legislation, “CASL”).
      </p>

      <LegalH2>11. Termination</LegalH2>
      <p>
        You may stop using the Service and delete your account at any time. We may suspend or
        terminate access if you breach these Terms or if required to protect the Service or other
        users. On termination, your right to use the Service ends; provisions that by their nature
        should survive (such as limitation of liability) will survive.
      </p>

      <LegalH2>12. Governing law</LegalH2>
      <p>
        These Terms are governed by the laws of the Province of British Columbia and the federal laws
        of Canada applicable there, without regard to conflict-of-laws rules. Mandatory consumer
        protections of your country of residence are unaffected. Where you are a consumer resident in
        the EU, nothing in these Terms deprives you of protections guaranteed by the mandatory law of
        your country of residence.
      </p>

      <LegalH2>13. Dispute resolution</LegalH2>
      <p>
        If a dispute arises out of or relating to these Terms or the Service, you agree to first try
        to resolve it informally by contacting us at hello@stampfix.app; we will work in good faith
        to resolve it within 30 days. If it is not resolved, the parties agree to submit the dispute
        to confidential, binding arbitration seated in Vancouver, British Columbia, conducted in
        English before a single arbitrator under the British Columbia Arbitration Act (SBC 2020,
        c. 2), administered by the Vancouver International Arbitration Centre (VanIAC) or another
        arbitral institution the parties agree on. Each party bears its own costs unless the
        arbitrator orders otherwise. Nothing in this section prevents either party from seeking
        urgent injunctive relief from a court of competent jurisdiction, and nothing here limits any
        mandatory rights you may have under applicable consumer-protection law.
      </p>

      <LegalH2>14. General</LegalH2>
      <p>
        <strong>Severability.</strong> If any provision of these Terms is held invalid or
        unenforceable, the remaining provisions continue in full force and effect.
      </p>
      <p>
        <strong>Assignment.</strong> Stampfix may assign or transfer these Terms, in whole or in
        part, including in connection with a merger, acquisition, or sale of assets. You may not
        assign your rights or obligations without our prior written consent, and any attempted
        assignment in breach of this section is void.
      </p>
      <p>
        <strong>Waiver.</strong> Our failure to enforce any provision is not a waiver of our right to
        enforce it later.
      </p>
      <p>
        <strong>Entire agreement.</strong> These Terms, together with the Privacy Policy and the Data
        Processing Agreement, constitute the entire agreement between you and Stampfix regarding the
        Service and supersede all prior or contemporaneous agreements on that subject.
      </p>

      <LegalH2>15. Changes to these Terms</LegalH2>
      <p>
        We may update these Terms from time to time. We will post the updated version here and revise
        the “Last updated” date, and will notify Merchants of material changes by email. Continued
        use after changes take effect constitutes acceptance.
      </p>

      <LegalH2>16. Contact</LegalH2>
      <p>
        Questions about these Terms? Email hello@stampfix.app or write
        to 28-16223 23A Ave, Surrey BC V3Z 6P4, Canada.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        This document is a template provided for convenience and does not constitute legal advice.
        Have it reviewed by qualified counsel before relying on it.
      </p>
    </LegalPage>
  );
}
