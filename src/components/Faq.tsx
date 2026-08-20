import { LegalPage, LegalH2 } from './legal/LegalPage';

/**
 * Public FAQ page. Reuses the LegalPage chrome (back link + reading column)
 * for a consistent, readable layout.
 */
export function Faq() {
  return (
    <LegalPage title="Frequently asked questions" lastUpdated="19 August 2026">
      <p>
        Quick answers about Stampfix — the digital loyalty-card platform. If you don't
        find what you need, email us at{' '}
        <a href="mailto:support@stampfix.app" className="underline">support@stampfix.app</a>.
      </p>

      <LegalH2>What is Stampfix?</LegalH2>
      <p>
        Stampfix replaces paper stamp cards with a digital loyalty card that lives in your
        customers' phone wallet. Customers collect stamps on each visit and redeem a reward
        once the card is full — no app to download, no plastic cards.
      </p>

      <LegalH2>Do my customers need to install an app?</LegalH2>
      <p>
        No. Customers add their card to Apple Wallet or Google Wallet straight from a link
        or QR code. It sits alongside their boarding passes and payment cards.
      </p>

      <LegalH2>How do customers collect stamps?</LegalH2>
      <p>
        At checkout you scan the QR code on the customer's card from your Stampfix dashboard.
        Their stamp count updates automatically, usually within seconds.
      </p>

      <LegalH2>How do I set up Stampfix for my business?</LegalH2>
      <p>
        Create a free account, set your reward (for example, "Buy 6, get 1 free")
        and the number of stamps, then share your card link or print a poster. You can be
        live in a few minutes.
      </p>

      <LegalH2>Do I need any special hardware?</LegalH2>
      <p>
        No. Stampfix runs on the phone, tablet, or computer you already have — you scan a customer's QR
        code from your dashboard to give a stamp. There are no NFC readers, terminals, or cards to buy; a
        printed QR poster on the counter is all you need to start enrolling customers.
      </p>

      <LegalH2>Can I customise how my card looks?</LegalH2>
      <p>
        Yes. Set your card's colour, logo, and reward text to match your brand, and update the design any
        time — handy for a rebrand or a seasonal campaign. Custom branding is part of the Pro plan.
      </p>

      <LegalH2>Does Stampfix work across multiple locations?</LegalH2>
      <p>
        Yes. Manage several locations from one dashboard and track performance per location. Multi-location
        support is available on the Pro plan.
      </p>

      <LegalH2>Can my staff give out stamps?</LegalH2>
      <p>
        Yes. Add staff members with their own PIN so anyone on shift can give stamps, while you stay in
        control — set a daily stamp limit and see exactly who stamped what.
      </p>

      <LegalH2>How does Stampfix prevent stamp fraud?</LegalH2>
      <p>
        Several safeguards work together: a cap on how many stamps a single customer can collect per day,
        automatic anomaly detection, and per-staff PINs so every stamp is attributable — keeping casual
        abuse in check without slowing down your counter.
      </p>

      <LegalH2>What does it cost?</LegalH2>
      <p>
        Stampfix is free to start. The Pro plan is CA$29.99/month in Canada, or €19.99/month
        incl. USt. in Germany. You can upgrade or cancel any time from your dashboard.
      </p>

      <LegalH2>Which wallets are supported?</LegalH2>
      <p>
        Both Apple Wallet (iPhone) and Google Wallet (Android). Cards update over the air, so
        a customer's stamp count stays current without any action on their part.
      </p>

      <LegalH2>Can I send my customers notifications?</LegalH2>
      <p>
        Yes. When you give a stamp, the customer's wallet card updates automatically and can show a
        notification on their phone, and you can also send announcements. You remain responsible for having
        consent where the law requires it for marketing messages.
      </p>

      <LegalH2>Can customers turn notifications off?</LegalH2>
      <p>
        Yes — at any time, from the Wallet settings for your card on their phone. Nothing is installed, so
        there's nothing to uninstall.
      </p>

      <LegalH2>What if a customer gets a new phone or loses their card?</LegalH2>
      <p>
        Their stamps are safe. A customer can recover their card using their phone number and a short code,
        or simply re-add it from your card link — their progress carries over.
      </p>

      <LegalH2>A customer's card isn't showing the latest stamps — what do they do?</LegalH2>
      <p>
        Cards normally update on their own within a minute. If a customer wants to refresh
        manually, our step-by-step guide shows how:{' '}
        <a href="/wallet-guide" className="underline">how to update your Apple Wallet card</a>.
      </p>

      <LegalH2>What customer data do I see, and who owns it?</LegalH2>
      <p>
        Your dashboard shows customer names, email addresses, how often they visit, and their stamp and
        reward activity, with filtering and insights. The data belongs to you — you can export your
        customer list as a CSV at any time.
      </p>

      <LegalH2>Is customer data secure?</LegalH2>
      <p>
        Yes. We only collect what's needed to run your loyalty program and handle it in line
        with PIPEDA and GDPR. See our <a href="/privacy" className="underline">Privacy Policy</a> for details.
      </p>

      <LegalH2>How do I get help?</LegalH2>
      <p>
        Email <a href="mailto:support@stampfix.app" className="underline">support@stampfix.app</a> and we'll get back to you.
      </p>
    </LegalPage>
  );
}
