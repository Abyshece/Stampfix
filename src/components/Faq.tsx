import { LegalPage, LegalH2 } from './legal/LegalPage';

/**
 * Public FAQ page. Reuses the LegalPage chrome (back link + reading column)
 * for a consistent, readable layout.
 */
export function Faq() {
  return (
    <LegalPage title="Frequently asked questions" lastUpdated="28 June 2026">
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

      <LegalH2>What does it cost?</LegalH2>
      <p>
        Stampfix is free to start. The Pro plan is CA$29.99/month. You can upgrade or cancel
        any time from your dashboard.
      </p>

      <LegalH2>Which wallets are supported?</LegalH2>
      <p>
        Both Apple Wallet (iPhone) and Google Wallet (Android). Cards update over the air, so
        a customer's stamp count stays current without any action on their part.
      </p>

      <LegalH2>A customer's card isn't showing the latest stamps — what do they do?</LegalH2>
      <p>
        Cards normally update on their own within a minute. If a customer wants to refresh
        manually, our step-by-step guide shows how:{' '}
        <a href="/wallet-guide" className="underline">how to update your Apple Wallet card</a>.
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
