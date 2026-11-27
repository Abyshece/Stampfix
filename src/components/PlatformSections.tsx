import { useTranslation } from 'react-i18next';
import {
  Wallet, QrCode, BellRing, UtensilsCrossed, BarChart3, Store, Check, ChevronDown,
  Star, Wifi, Gamepad2, MessageSquare, Truck, Link2, Play, CreditCard, ArrowRight, X,
} from 'lucide-react';

// Landing page: what Stampfix is now (a marketing and retention platform),
// "Everything in one place" and the business page "One QR code" showcase.

// Every feature, in six groups (only what the product really does).
const GROUPS = [
  { key: 'loyalty', icon: Wallet, color: '#16A34A', title: 'Loyalty cards', items: [
    'Stamp cards in Apple and Google Wallet', 'No app to download, no paper to lose', 'Your phone is the scanner, no hardware',
    'Your logo, colours and stamp icons', 'Stamp limits that stop cheating', 'Lost cards found again in seconds'] },
  { key: 'page', icon: QrCode, color: '#7C3AED', title: 'Business page', items: [
    'One QR code for everything', 'Menu, Wi-Fi and Google reviews', 'Delivery apps, socials and links',
    'Stories with your photos and videos', 'Private feedback and a quick game', 'Change it any time, no reprinting'] },
  { key: 'marketing', icon: BellRing, color: '#F59E0B', title: 'Marketing and win-back', items: [
    'Offers on the lock screen', 'Reminders when customers are nearby', 'Ready-made “we miss you” offers',
    'See who has stopped coming', 'Coupons for your menu', 'Marketing consent collected for you'] },
  { key: 'ordering', icon: UtensilsCrossed, color: '#0EA5E9', title: 'Table ordering', items: [
    'Guests order from the table by QR', 'New orders arrive with an alert', 'Accept, mark ready, collected',
    'Guests follow their order live', 'Build your menu or upload it', 'Free on every plan'] },
  { key: 'insights', icon: BarChart3, color: '#2563EB', title: 'Insights and results', items: [
    'Know who your regulars are', 'Visits, rewards and retention', 'Average spend and campaign returns',
    'Customer list and activity log', 'Export your data any time'] },
  { key: 'shop', icon: Store, color: '#E11D48', title: 'Built for your shop', items: [
    'Staff accounts you control', 'Multiple locations', 'Print-ready posters and table codes',
    'Live in a few minutes', 'GDPR handled for you', 'English and German'] },
] as const;

/** "Everything you need to bring customers back": every feature, in six groups. */
export function PlatformGrid() {
  const { t } = useTranslation();
  return (
    <section className="max-w-6xl mx-auto px-6 py-20 md:py-24" data-platform-grid>
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs uppercase tracking-widest font-bold text-gray-400">{t('landing.platform.kicker', { defaultValue: 'One platform' })}</span>
        <h2 className="text-3xl md:text-5xl font-serif-display font-medium mt-2 mb-4 tracking-tight text-balance">
          {t('landing.platform.h2', { defaultValue: 'Everything you need to bring customers back' })}
        </h2>
        <p className="text-lg text-gray-500 text-pretty">
          {t('landing.platform.sub', { defaultValue: 'More than 30 tools that usually come from five different apps. In Stampfix they share one login, one QR code and one flat price.' })}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUPS.map(({ key, icon: Icon, color, title, items }) => (
          <div key={key} className="rounded-2xl border notion-border bg-white p-6 hover:shadow-md transition" data-feature-group={key}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}14`, color }}><Icon className="w-5 h-5" /></div>
              <h3 className="font-semibold text-lg text-[#37352F]">{t(`landing.platform.${key}.t`, { defaultValue: title })}</h3>
            </div>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={it} className="flex items-start gap-2 text-[15px] text-gray-600">
                  <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color }} />{t(`landing.platform.${key}.i${i}`, { defaultValue: it })}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** "One QR code replaces": the things on the counter that Stampfix takes over. */
export function ReplacesStrip() {
  const { t } = useTranslation();
  const things = ['Paper stamp cards', 'Menu PDFs', 'Wi-Fi password signs', 'Review cards', 'Link-in-bio pages', 'A separate ordering app'];
  return (
    <section className="max-w-5xl mx-auto px-6 py-10 text-center" data-replaces>
      <p className="text-sm font-medium text-gray-500 mb-4">{t('landing.replaces.title', { defaultValue: 'One QR code replaces' })}</p>
      <div className="flex flex-wrap justify-center gap-2.5">
        {things.map((th, i) => (
          <span key={th} className="inline-flex items-center gap-1.5 rounded-full bg-[#F7F7F5] border notion-border px-3.5 py-2 text-sm text-gray-500">
            <X className="w-3.5 h-3.5 text-rose-500" /><span className="line-through decoration-gray-300">{t(`landing.replaces.i${i}`, { defaultValue: th })}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

/** "Sound familiar?": three questions a shop owner recognises, each with what Stampfix does. */
export function SoundFamiliar() {
  const { t } = useTranslation();
  const qs = [
    { q: 'Who are your regulars?', a: 'Most shops could not name their top 20 customers. Stampfix shows you who they are, how often they come and what they spend.' },
    { q: 'Do you notice when they stop coming?', a: 'When a regular goes quiet, Stampfix spots it and prepares a “we miss you” offer you can send in one tap, then shows you who came back.' },
    { q: 'How many tools are you paying for?', a: 'A loyalty app, a menu QR, a link page, an ordering tool. Stampfix is one login, one QR code and one flat price.' },
  ];
  return (
    <section className="max-w-6xl mx-auto px-6 pt-20 md:pt-24" data-sound-familiar>
      <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-10 tracking-tight text-center">{t('landing.familiar.h2', { defaultValue: 'Sound familiar?' })}</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {qs.map((x, i) => (
          <div key={x.q} className="rounded-2xl bg-[#F7F7F5] p-6">
            <div className="text-sm font-semibold text-gray-400 mb-3">0{i + 1}</div>
            <h3 className="font-serif-display text-2xl font-medium text-[#37352F] mb-2 leading-snug">{t(`landing.familiar.q${i}`, { defaultValue: x.q })}</h3>
            <p className="text-gray-500 leading-relaxed">{t(`landing.familiar.a${i}`, { defaultValue: x.a })}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Common questions, as an accordion. */
export function LandingFaq() {
  const { t } = useTranslation();
  const faqs = [
    { q: 'Do my customers need to download an app?', a: 'No. The loyalty card goes into Apple Wallet or Google Wallet, which is already on their phone. Your business page opens in the browser.' },
    { q: 'Do I need any hardware?', a: 'No. Your phone or tablet is the scanner. Print your QR code on the posters we make for you, and you are ready.' },
    { q: 'Why one platform instead of separate tools?', a: 'Because everything works together. A guest who scans your table QR can order, join your loyalty card and get your offers later, all from one scan, and you see it all in one place.' },
    { q: 'Can I change my page without reprinting the QR code?', a: 'Yes. The QR code always points to your page, so you can change your menu, links, Wi-Fi or offers any time.' },
    { q: 'Is table ordering extra?', a: 'No. Table ordering and your menu are free on every plan.' },
    { q: 'Is it GDPR compliant, and can I cancel any time?', a: 'Yes to both. Marketing consent is collected for you, your data can be exported any time, and there is no contract.' },
  ];
  return (
    <section className="max-w-3xl mx-auto px-6 py-20 md:py-24" data-landing-faq>
      <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-8 tracking-tight text-center">{t('landing.faq.h2', { defaultValue: 'Common questions' })}</h2>
      <div className="divide-y notion-border border-y notion-border">
        {faqs.map((f, i) => (
          <details key={f.q} className="group py-4">
            <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-lg font-medium text-[#37352F]">
              {t(`landing.faq.q${i}`, { defaultValue: f.q })}
              <ChevronDown className="w-5 h-5 shrink-0 text-gray-400 transition group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-gray-500 leading-relaxed">{t(`landing.faq.a${i}`, { defaultValue: f.a })}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The last call to action before the contact form. */
export function ClosingCta({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="px-6 pb-20" data-closing-cta>
      <div className="max-w-5xl mx-auto rounded-3xl bg-[#37352F] text-white px-6 py-14 md:py-16 text-center">
        <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-4 tracking-tight text-balance">{t('landing.close.h2', { defaultValue: 'One QR code. Every reason to come back.' })}</h2>
        <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">{t('landing.close.sub', { defaultValue: 'Set up your loyalty card and business page in a few minutes. Free to start, no card needed.' })}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onStart} className="bg-white text-[#37352F] px-7 py-3 rounded-lg font-medium text-lg inline-flex items-center gap-2 hover:bg-gray-100 transition">
            {t('hero.startFree')} <ArrowRight className="w-5 h-5" />
          </button>
          <a href="https://calendar.app.google/WCPgkaPjeoUbkQJq7" target="_blank" rel="noopener noreferrer" className="border border-white/30 px-7 py-3 rounded-lg font-medium text-lg hover:border-white transition">
            {t('hero.bookDemo')}
          </a>
        </div>
      </div>
    </section>
  );
}

const QR_ITEMS = [
  { key: 'join', icon: CreditCard, label: 'Join your loyalty card' },
  { key: 'menu', icon: UtensilsCrossed, label: 'See the menu and order' },
  { key: 'review', icon: Star, label: 'Leave a Google review' },
  { key: 'wifi', icon: Wifi, label: 'Connect to your Wi-Fi' },
  { key: 'delivery', icon: Truck, label: 'Order on Uber Eats, DoorDash or Lieferando' },
  { key: 'links', icon: Link2, label: 'Find your Instagram, TikTok and website' },
  { key: 'stories', icon: Play, label: 'Watch your latest photos and videos' },
  { key: 'feedback', icon: MessageSquare, label: 'Send you private feedback' },
  { key: 'game', icon: Gamepad2, label: 'Play a quick game while they wait' },
] as const;

/** "One QR code. Everything your guests need." The business page, with a phone mock-up. */
export function OneQrSection() {
  const { t } = useTranslation();
  return (
    <section className="border-y notion-border bg-[#F7F7F5]/60" data-one-qr>
      <div className="max-w-6xl mx-auto px-6 py-20 md:py-24 grid md:grid-cols-[1.15fr_1fr] gap-12 md:gap-16 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 bg-white border notion-border rounded-full px-3 py-1 text-xs font-medium text-gray-600">
            <QrCode className="w-3.5 h-3.5" /> {t('landing.qr.kicker', { defaultValue: 'Your business page' })}
          </span>
          <h2 className="text-3xl md:text-5xl font-serif-display font-medium mt-4 mb-4 tracking-tight text-balance">
            {t('landing.qr.h2', { defaultValue: 'One QR code. Everything your guests need.' })}
          </h2>
          <p className="text-lg text-gray-500 mb-8 leading-relaxed text-pretty">
            {t('landing.qr.sub', { defaultValue: 'Put one QR code on your counter, tables and window. Guests land on your own page, and you can change what is on it any time, without reprinting.' })}
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {QR_ITEMS.map(({ key, icon: Icon, label }) => (
              <li key={key} className="flex items-start gap-2.5 text-[15px] text-[#37352F]">
                <span className="mt-0.5 w-6 h-6 rounded-md bg-white border notion-border flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5" /></span>
                {t(`landing.qr.${key}`, { defaultValue: label })}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-center"><PagePhone /></div>
      </div>
    </section>
  );
}

/** A drawn phone showing a sample business page (illustration only). */
function PagePhone() {
  const { t } = useTranslation();
  const tiles: { key: string; icon: typeof Star; label: string; tint: string }[] = [
    { key: 'menu', icon: UtensilsCrossed, label: 'Menu & order', tint: '#0EA5E9' },
    { key: 'review', icon: Star, label: 'Google review', tint: '#F59E0B' },
    { key: 'wifi', icon: Wifi, label: 'Wi-Fi', tint: '#16A34A' },
    { key: 'delivery', icon: Truck, label: 'Delivery', tint: '#E11D48' },
    { key: 'game', icon: Gamepad2, label: 'Play a game', tint: '#7C3AED' },
    { key: 'feedback', icon: MessageSquare, label: 'Feedback', tint: '#2563EB' },
  ];
  const stories = ['#F59E0B', '#E11D48', '#7C3AED', '#0EA5E9', '#16A34A'];
  return (
    <div aria-hidden className="relative w-[270px] h-[560px] rounded-[44px] border-[10px] border-[#1F1F1F] bg-white shadow-2xl overflow-hidden">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-[#1F1F1F] z-10" />
      <div className="h-28 bg-gradient-to-br from-[#7C2D12] via-[#B45309] to-[#F59E0B]" />
      <div className="px-4 -mt-8">
        <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-2xl">☕</div>
        <div className="mt-2 font-semibold text-[#37352F]">Bean &amp; Brew</div>
        <div className="text-[11px] text-gray-500">{t('landing.qr.phone.sub', { defaultValue: 'Café · Open until 6 pm' })}</div>
        <div className="flex gap-2 mt-3">
          {stories.map((c, i) => (
            <div key={c} className="w-10 h-10 rounded-full p-[2px]" style={{ background: `linear-gradient(135deg, ${c}, #F472B6)` }}>
              <div className="w-full h-full rounded-full bg-white p-[2px]"><div className="w-full h-full rounded-full" style={{ background: `${c}33` }}>{i === 0 && <Play className="w-3 h-3 m-auto mt-[11px] text-gray-500" />}</div></div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-[#37352F] text-white text-[13px] font-medium py-2.5 flex items-center justify-center gap-1.5">
          <CreditCard className="w-4 h-4" /> {t('landing.qr.phone.join', { defaultValue: 'Get your loyalty card' })} <ArrowRight className="w-3.5 h-3.5" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          {tiles.map(({ key, icon: Icon, label, tint }) => (
            <div key={key} className="rounded-xl border notion-border px-2.5 py-2.5 flex items-center gap-2 text-[12px] font-medium text-[#37352F]">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tint}18`, color: tint }}><Icon className="w-3.5 h-3.5" /></span>
              {t(`landing.qr.phone.${key}`, { defaultValue: label })}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-3 mt-3 text-gray-400">
          <span className="w-7 h-7 rounded-full border notion-border flex items-center justify-center text-[10px] font-bold">IG</span>
          <span className="w-7 h-7 rounded-full border notion-border flex items-center justify-center text-[10px] font-bold">TT</span>
          <span className="w-7 h-7 rounded-full border notion-border flex items-center justify-center"><Link2 className="w-3.5 h-3.5" /></span>
        </div>
      </div>
    </div>
  );
}
