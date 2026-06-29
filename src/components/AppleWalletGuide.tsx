import type { ReactNode } from 'react';
import { LegalPage, LegalH2 } from './legal/LegalPage';

/**
 * Customer-facing guide: how to refresh an Apple Wallet loyalty card.
 * Passes update over the air automatically; this shows how to force a refresh.
 * Android (Google Wallet) updates on its own, so this guide is iOS-only.
 *
 * Screenshots: drop 5 images into /public/wallet-guide as 01.png … 05.png.
 * The caption/alt on each step says which screenshot belongs where.
 */
function Step({ n, title, img, alt, children }: {
  n: number; title: string; img: string; alt: string; children: ReactNode;
}) {
  return (
    <div className="pt-2">
      <LegalH2>{`Step ${n} — ${title}`}</LegalH2>
      <p>{children}</p>
      <div className="mt-3 rounded-xl border notion-border bg-[#F7F7F5] overflow-hidden flex justify-center items-center min-h-[120px]">
        <img src={img} alt={alt} className="max-h-[520px] w-auto object-contain" loading="lazy" />
      </div>
    </div>
  );
}

export function AppleWalletGuide() {
  return (
    <LegalPage title="Updating your Apple Wallet card" lastUpdated="28 June 2026">
      <p>
        Your Stampfix loyalty card updates <strong>automatically</strong> — your stamp count
        usually refreshes within a minute of your last visit, even with your phone in your
        pocket. If your card ever looks out of date, you can refresh it by hand in a few
        seconds. These steps are for <strong>iPhone (Apple Wallet)</strong>. On Android,
        Google Wallet updates on its own and needs no extra steps.
      </p>

      <Step n={1} title="Open Wallet and tap your card" img="/wallet-guide/01.png"
        alt="Apple Wallet showing the loyalty card in the list">
        Open the <strong>Wallet</strong> app on your iPhone and tap your loyalty card to open it.
      </Step>

      <Step n={2} title="Open the card menu" img="/wallet-guide/02.png"
        alt="Pass menu with Pass Details, Notifications and Remove Pass">
        Tap the <strong>•••</strong> (more) button in the top-right corner, then tap{' '}
        <strong>Pass Details</strong>.
      </Step>

      <Step n={3} title="Turn on Automatic Updates" img="/wallet-guide/03.png"
        alt="Pass details with the Automatic Updates toggle on">
        Make sure <strong>Automatic Updates</strong> is switched on. This keeps your stamps
        refreshing on their own going forward.
      </Step>

      <Step n={4} title="Pull to refresh" img="/wallet-guide/04.png"
        alt="The pass refreshing with a loading spinner">
        To update right now, go back to the card and <strong>swipe down</strong> on it. You'll
        see a brief spinner while it refreshes.
      </Step>

      <Step n={5} title="You're up to date" img="/wallet-guide/05.png"
        alt="The card showing Updated just now with the latest stamps">
        That's it — your card now shows <strong>"Updated just now"</strong> with your latest stamps.
      </Step>

      <p className="pt-4">
        Still stuck? Email{' '}
        <a href="mailto:support@stampfix.app" className="underline">support@stampfix.app</a>.
      </p>
    </LegalPage>
  );
}
