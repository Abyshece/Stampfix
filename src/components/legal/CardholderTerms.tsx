import { LegalPage, LegalH2 } from './LegalPage';

/**
 * Cardholder Terms — the end-user (customer) agreement, separate from the
 * Merchant-facing Terms of Service. Covers the person who saves a loyalty
 * card and collects stamps.
 *
 * Written for a Canadian company (governing law: British Columbia) whose
 * merchants operate in Canada and Germany. Canadian-specific coverage:
 *   - CASL (consent + unsubscribe for commercial electronic messages)
 *   - PIPEDA (privacy), with GDPR noted for EU cardholders
 *   - Mandatory consumer-protection carve-outs (provincial + EU)
 *
 * Not legal advice — have counsel review before relying on it.
 */
export function CardholderTerms() {
  return (
    <LegalPage title="Cardholder Terms" lastUpdated="19 June 2026">
      <p>
        These Cardholder Terms (“Terms”) govern your use of the digital loyalty cards offered through
        Stampfix, a platform operated by 17999658 Canada Inc. (d/b/a Stampfix) (“Stampfix”, “we”,
        “us”). By signing up for or using a loyalty card through Stampfix, you (the “Cardholder”)
        agree to these Terms. If you do not agree, please do not sign up for or use a card.
      </p>

      <LegalH2>1. About these terms</LegalH2>
      <p>
        You are a customer of a business (the “Merchant”) that runs its loyalty program using
        Stampfix. These Terms cover your use of the loyalty card and related features (the
        “Service”) and are an agreement between you and Stampfix. Your relationship with the Merchant
        — including the loyalty offer itself — is governed by the Merchant’s own terms and by the law
        that applies to that Merchant.
      </p>

      <LegalH2>2. The roles: Stampfix and the Merchant</LegalH2>
      <p>
        Stampfix provides the technology that powers your loyalty card: the card, the QR code, and
        the record of your stamps. The Merchant designs and runs its own program — it sets the offer
        and the rules, applies the stamps, and decides whether to grant a reward. Stampfix is not a
        party to the loyalty offer between you and the Merchant and is not responsible for whether a
        Merchant honours its offer.
      </p>

      <LegalH2>3. Your card and signing in</LegalH2>
      <p>
        You must be at least 16 years old to sign up for a card (or older where your local law sets a
        higher age of digital consent). Stampfix is not intended for children under 16, and we do not
        knowingly collect their personal data.
      </p>
      <p>
        To use a card, you provide your name and an email address, and we send a secure sign-in link
        to that email. Keep access to your email and account secure, and tell us promptly of any
        unauthorised use. Please keep your details accurate so that you receive your stamps and any
        messages you have asked for.
      </p>

      <LegalH2>4. Rewards</LegalH2>
      <p>
        Rewards are offered and provided by the Merchant, not by Stampfix. A Merchant may change or
        withdraw an offer and has the final decision on whether to grant a reward, subject to the
        consumer-protection laws that apply to it. Stampfix does not guarantee any reward and is not
        liable if a Merchant changes, withdraws, or declines to honour an offer.
      </p>

      <LegalH2>5. Acceptable use</LegalH2>
      <p>You agree not to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Use the Service for any unlawful, fraudulent, or deceptive purpose</li>
        <li>Collect stamps or obtain rewards dishonestly</li>
        <li>Provide false or misleading information when signing up</li>
        <li>Tamper with, disrupt, or attempt to reverse-engineer the Service</li>
        <li>Harass or abuse a Merchant, our staff, or anyone else</li>
      </ul>
      <p>
        We may suspend or terminate your access if you breach these Terms.
      </p>

      <LegalH2>6. Messages and your consent (CASL)</LegalH2>
      <p>
        When you join a Merchant’s loyalty program, you consent to receive electronic messages (such
        as email or SMS) from that Merchant and from Stampfix relating to the program and the
        Service, in accordance with Canada’s Anti-Spam Legislation (CASL). Every commercial
        electronic message includes a way to unsubscribe, and you may withdraw your consent at any
        time; we will give effect to your request promptly. Withdrawing consent to marketing messages
        does not stop essential service messages, such as sign-in links.
      </p>

      <LegalH2>7. Your privacy</LegalH2>
      <p>
        We handle personal information in line with our{' '}
        <a href="/privacy" className="underline hover:text-[#37352F]">Privacy Policy</a>. For your
        loyalty-card data, the Merchant whose program you joined is the data controller and Stampfix
        acts as its data processor. Your information is handled under Canada’s Personal Information
        Protection and Electronic Documents Act (PIPEDA) and, where you are in the European Union,
        the General Data Protection Regulation (GDPR). You can request access to or deletion of your
        data from the “My Card” page, or by contacting the Merchant; we will assist the Merchant in
        responding.
      </p>

      <LegalH2>8. Wallet passes</LegalH2>
      <p>
        You may save your loyalty card to Apple Wallet or Google Wallet. This requires a compatible
        device, and your use of Apple Wallet or Google Wallet is also subject to Apple’s or Google’s
        own terms. Apple Wallet passes are generated by Stampfix and stored on your device. Using a
        wallet pass is optional — you can always open your card through the web link instead.
      </p>

      <LegalH2>9. Service availability and disclaimers</LegalH2>
      <p>
        The Service is provided “as is” and “as available”. To the fullest extent permitted by law,
        we do not warrant that it will be uninterrupted or error-free, and wallet passes depend on a
        compatible device and a valid issuer configuration. Nothing in these Terms excludes
        warranties or rights that cannot be excluded under applicable consumer-protection law.
      </p>

      <LegalH2>10. Limitation of liability</LegalH2>
      <p>
        To the fullest extent permitted by law, Stampfix will not be liable for indirect, incidental,
        special, or consequential damages, or for any loss arising from a Merchant’s offer or a
        Merchant’s failure to honour it. Because the Service is free to Cardholders, our total
        liability to you for any claim relating to the Service will not exceed CAD $100. Nothing in
        this section limits liability that cannot be limited by law, and your mandatory rights under
        the consumer-protection law of your province or country of residence are unaffected.
      </p>

      <LegalH2>11. Termination</LegalH2>
      <p>
        You may stop using the Service and delete your card at any time from the “My Card” page. A
        Merchant or Stampfix may suspend or end your access to a program if you breach these Terms or
        where necessary to protect the Service or other users.
      </p>

      <LegalH2>12. Governing law</LegalH2>
      <p>
        These Terms are governed by the laws of the Province of British Columbia and the federal laws
        of Canada applicable there, without regard to conflict-of-laws rules. Your mandatory consumer
        protections under the law of your province or country of residence are unaffected. Where you
        are a consumer resident in the EU, nothing in these Terms deprives you of protections
        guaranteed by the mandatory law of your country of residence.
      </p>

      <LegalH2>13. Changes to these terms</LegalH2>
      <p>
        We may update these Terms from time to time. We will post the updated version here and revise
        the “Last updated” date. Your continued use of the Service after changes take effect
        constitutes acceptance of the updated Terms.
      </p>

      <LegalH2>14. Contact</LegalH2>
      <p>
        Questions about these Terms or your loyalty card? Email privacy@stampfix.app for privacy
        matters or hello@stampfix.app for anything else, or write to 28-16223 23A Ave, Surrey BC
        V3Z 6P4, Canada.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        Last updated: 18 July 2026
      </p>
    </LegalPage>
  );
}
