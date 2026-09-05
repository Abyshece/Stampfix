// Server-render marketing pages for crawlers/AI (dynamic rendering).
// Humans still get the SPA; this returns accurate HTML + structured data so
// answer engines can cite Stampfix for "digital loyalty card" queries.
export const config = { runtime: 'edge' };
const SITE = 'https://stampfix.app';
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FAQ: [string, string][] = [
  ['What is Stampfix?', "Stampfix replaces paper stamp cards with a digital loyalty card that lives in your customers' phone wallet. Customers collect stamps on each visit and redeem a reward once the card is full — no app to download, no plastic cards."],
  ['Do my customers need to install an app?', 'No. Customers add their card to Apple Wallet or Google Wallet straight from a link or QR code. It sits alongside their boarding passes and payment cards.'],
  ['How do customers collect stamps?', "At checkout you scan the QR code on the customer's card from your Stampfix dashboard. Their stamp count updates automatically, usually within seconds."],
  ['How do I set up Stampfix for my business?', 'Create a free account, set your reward (for example, "Buy 6, get 1 free") and the number of stamps, then share your card link or print a poster. You can be live in a few minutes.'],
  ['Do I need any special hardware?', 'No. Stampfix runs on the phone, tablet, or computer you already have. There are no NFC readers, terminals, or cards to buy; a printed QR poster on the counter is all you need to start enrolling customers.'],
  ['Can I customise how my card looks?', "Yes. Set your card's colour, logo, and reward text to match your brand, and update the design any time. Custom branding is part of the Pro plan."],
  ['Does Stampfix work across multiple locations?', 'Yes. Manage several locations from one dashboard and track performance per location. Multi-location support is available on the Pro plan.'],
  ['Can my staff give out stamps?', 'Yes. Add staff members with their own PIN so anyone on shift can give stamps, while you stay in control — set a daily stamp limit and see exactly who stamped what.'],
  ['How does Stampfix prevent stamp fraud?', 'Several safeguards work together: a cap on how many stamps a single customer can collect per day, automatic anomaly detection, and per-staff PINs so every stamp is attributable.'],
  ['What does it cost?', 'Stampfix is free to start. The Pro plan is CA$29.99/month in Canada, or €19.99/month incl. USt. in Germany. You can upgrade or cancel any time.'],
  ['Which wallets are supported?', "Both Apple Wallet (iPhone) and Google Wallet (Android). Cards update over the air, so a customer's stamp count stays current without any action on their part."],
  ['Can I send my customers notifications?', "Yes. When you give a stamp, the customer's wallet card updates automatically and can show a notification on their phone, and you can also send announcements. You remain responsible for consent where the law requires it."],
  ['Can customers turn notifications off?', 'Yes — at any time, from the Wallet settings for your card on their phone. Nothing is installed, so there is nothing to uninstall.'],
  ['What if a customer gets a new phone or loses their card?', 'Their stamps are safe. A customer can recover their card using their phone number and a short code, or simply re-add it from your card link — their progress carries over.'],
  ['What customer data do I see, and who owns it?', 'Your dashboard shows customer names, email addresses, visit frequency, and stamp and reward activity, with filtering and insights. The data belongs to you — you can export your customer list as a CSV at any time.'],
  ['Is customer data secure?', "Yes. We only collect what's needed to run your loyalty program and handle it in line with PIPEDA and GDPR."],
];

const PAGES: Record<string, { title: string; desc: string; h1: string; body: string }> = {
  '/': {
    title: 'Stampfix — Digital loyalty stamp cards in Apple & Google Wallet',
    desc: 'Replace paper stamp cards with a digital loyalty card in Apple Wallet and Google Wallet. No app to download, no hardware, set up in 30 seconds. GDPR compliant — for cafés, restaurants, salons, gyms and more in Europe.',
    h1: 'Digital loyalty stamp cards for independent merchants',
    body: `<p>No apps. No paper stamp cards. No extra hardware. Just loyalty. Create a digital stamp card in 30 seconds — a simple link that lives in your customer's Apple Wallet or Google Wallet.</p>
<h2>Native to Apple &amp; Google Wallet — no friction</h2>
<p>Customers don't want another app clogging their phone. Stampfix passes live directly in Apple Wallet on iPhone and Google Wallet on Android, using the technology already built into the device. One-tap install from a QR code, lock-screen notifications when nearby, and updates that sync automatically.</p>
<h2>Know your customers, not just their orders</h2>
<p>Stampfix tracks every scan, giving you insights into visit frequency, retention, and reward redemptions. Identify top spenders automatically, export data for email marketing, and block fraudulent activity instantly.</p>
<h2>Enterprise-grade loyalty on a local-business budget</h2>
<p>No setup fees, no app development, no expensive hardware — just a flat monthly price with unlimited customers. Free to start; Pro is €19.99/month in Germany or CA$29.99/month in Canada, cancel anytime.</p>
<h2>Made for your shop</h2>
<p>Whether café, bakery, restaurant, döner shop, bar, florist, nail studio, hairdresser, barbershop, tattoo studio, gym, spa, car wash, dog grooming, dry cleaner or yoga studio — Stampfix adapts to your business.</p>`,
  },
  '/pricing': {
    title: 'Pricing — Stampfix digital loyalty cards',
    desc: 'Stampfix is free to start. Pro is €19.99/month (Germany) or CA$29.99/month (Canada): unlimited customers, no setup fees, no hardware, cancel anytime.',
    h1: 'Simple pricing for independent merchants',
    body: `<p>Stampfix is free to start. The Pro plan is €19.99/month incl. USt. in Germany, or CA$29.99/month in Canada.</p>
<h2>What's included</h2>
<p>Unlimited customers and cards, digital passes in Apple &amp; Google Wallet, customer insights, custom card branding, multiple locations, staff PINs, and fraud protection. No setup fees, no hardware to buy, and you can cancel any time from your dashboard.</p>`,
  },
  '/features': {
    title: 'Features — Stampfix digital loyalty platform',
    desc: 'Apple & Google Wallet passes, self-serve stamping, customer insights, multi-location, staff PINs, fraud protection, and push notifications — no app, no hardware.',
    h1: 'Everything you need to run a modern loyalty program',
    body: `<h2>Digital wallet cards</h2><p>Passes live in Apple Wallet and Google Wallet. One-tap install from a QR code; updates sync over the air.</p>
<h2>Stamping &amp; self-serve</h2><p>Give a stamp by scanning the customer's QR from your dashboard, or let customers scan/tap to stamp themselves at the counter.</p>
<h2>Customer insights</h2><p>See visit frequency, retention and reward redemptions; identify top spenders; export your customer list as CSV.</p>
<h2>Multi-location &amp; staff</h2><p>Run several locations from one dashboard, add staff with their own PINs, and set daily stamp limits.</p>
<h2>Fraud protection &amp; notifications</h2><p>Per-day caps, anomaly detection and per-staff attribution keep abuse in check. Cards can show lock-screen notifications when you add a stamp or send an announcement.</p>`,
  },
  '/about': {
    title: 'About — Stampfix',
    desc: 'Stampfix is a digital loyalty-card platform for independent merchants in Europe and Canada — Apple & Google Wallet stamp cards, no app, GDPR and PIPEDA compliant.',
    h1: 'About Stampfix',
    body: `<p>Stampfix is a digital loyalty-card platform built for independent merchants — cafés, restaurants, salons, gyms and more — in Europe and Canada. We replace paper stamp cards with a digital card that lives in Apple Wallet and Google Wallet, so there is no app to download and no hardware to buy.</p>
<p>We handle customer data in line with GDPR and PIPEDA, and the customer data always belongs to the merchant.</p>`,
  },
  '/use-cases': {
    title: 'Use cases — Stampfix loyalty for every kind of business',
    desc: 'Digital loyalty and stamp cards for cafés, restaurants, bakeries, döner shops, bars, salons, barbershops, gyms, spas and more.',
    h1: 'Loyalty for every kind of business',
    body: `<p>Stampfix works for any business that rewards repeat visits: cafés, restaurants, bakeries, ice-cream shops, snack bars, pizzerias, bars &amp; clubs, florists, nail studios, hairdressers, barbershops, tattoo studios, gyms, retail, döner shops, bubble tea &amp; juice bars, food trucks, lash &amp; brow studios, spas &amp; massage, car washes, dog grooming, dry cleaners, and yoga &amp; Pilates studios.</p>`,
  },
};

function html(head: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${head}</head><body style="max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#1a1a1a">${body}<hr><p><a href="${SITE}">Stampfix</a> · <a href="${SITE}/blog">Blog</a> · <a href="${SITE}/pricing">Pricing</a> · <a href="${SITE}/faq">FAQ</a></p></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' } },
  );
}

export default async function handler(req: Request): Promise<Response> {
  const path = new URL(req.url).searchParams.get('path') || '/';
  const canon = SITE + (path === '/' ? '' : path);

  if (path === '/faq') {
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
    const head = `<title>FAQ — Stampfix digital loyalty cards</title><meta name="description" content="Answers about Stampfix: how digital stamp cards work, Apple &amp; Google Wallet, pricing, setup, data and GDPR."><link rel="canonical" href="${SITE}/faq"><script type="application/ld+json">${JSON.stringify(ld)}</script>`;
    const body = `<h1>Stampfix — Frequently asked questions</h1>${FAQ.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join('')}`;
    return html(head, body);
  }

  const p = PAGES[path];
  if (!p) return html(`<title>Stampfix</title><link rel="canonical" href="${SITE}">`, `<h1>Stampfix — digital loyalty cards</h1><p><a href="${SITE}">Home</a></p>`);

  let ld = '';
  if (path === '/') {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', name: 'Stampfix', url: SITE, description: p.desc },
        { '@type': 'WebSite', name: 'Stampfix', url: SITE },
        { '@type': 'SoftwareApplication', name: 'Stampfix', applicationCategory: 'BusinessApplication', operatingSystem: 'Web, iOS, Android', description: p.desc, offers: [{ '@type': 'Offer', price: '0', priceCurrency: 'EUR', name: 'Free' }, { '@type': 'Offer', price: '19.99', priceCurrency: 'EUR', name: 'Pro' }] },
      ],
    };
    ld = `<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
  }
  const head = `<title>${esc(p.title)}</title><meta name="description" content="${esc(p.desc)}"><link rel="canonical" href="${canon}"><meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.desc)}"><meta property="og:url" content="${canon}">${ld}`;
  return html(head, `<h1>${esc(p.h1)}</h1>${p.body}`);
}
