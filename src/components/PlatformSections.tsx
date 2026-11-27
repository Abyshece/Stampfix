import { useTranslation } from 'react-i18next';
import {
  Wallet, QrCode, BellRing, RefreshCw, UtensilsCrossed, BarChart3,
  Star, Wifi, Gamepad2, MessageSquare, Truck, Link2, Play, CreditCard, ArrowRight,
} from 'lucide-react';

// Landing page: what Stampfix is now (a marketing and retention platform),
// "Everything in one place" and the business page "One QR code" showcase.

const TILES = [
  { key: 'loyalty', icon: Wallet, color: '#16A34A', title: 'Loyalty cards in Wallet', body: 'Digital stamp cards in Apple and Google Wallet. No app to download, no paper cards to lose.' },
  { key: 'page', icon: QrCode, color: '#7C3AED', title: 'Your business page', body: 'One QR code for your menu, Wi-Fi, Google reviews, socials, delivery apps and more.' },
  { key: 'offers', icon: BellRing, color: '#F59E0B', title: 'Offers on the lock screen', body: 'Send offers straight to your customers’ phones, with reminders when they are nearby.' },
  { key: 'autopilot', icon: RefreshCw, color: '#E11D48', title: 'Win-back on autopilot', body: '“We miss you” offers go out by themselves when a regular stops coming in.' },
  { key: 'ordering', icon: UtensilsCrossed, color: '#0EA5E9', title: 'Menu and table ordering', body: 'Guests scan, browse your menu and order from the table. Coupons included.' },
  { key: 'results', icon: BarChart3, color: '#2563EB', title: 'Results you can see', body: 'See who your regulars are, what they spend and which offers bring them back.' },
] as const;

/** "Everything in one place": the six things Stampfix does, as cards. */
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
          {t('landing.platform.sub', { defaultValue: 'Stop juggling a loyalty app, a link-in-bio page, a menu QR and a newsletter tool. Stampfix does all of it, for one flat price.' })}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map(({ key, icon: Icon, color, title, body }) => (
          <div key={key} className="rounded-2xl border notion-border bg-white p-6 hover:shadow-md hover:-translate-y-0.5 transition">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}14`, color }}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-lg text-[#37352F] mb-1.5">{t(`landing.platform.${key}.t`, { defaultValue: title })}</h3>
            <p className="text-gray-500 leading-relaxed">{t(`landing.platform.${key}.b`, { defaultValue: body })}</p>
          </div>
        ))}
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
  const tiles: { icon: typeof Star; label: string; tint: string }[] = [
    { icon: UtensilsCrossed, label: 'Menu & order', tint: '#0EA5E9' },
    { icon: Star, label: 'Google review', tint: '#F59E0B' },
    { icon: Wifi, label: 'Wi-Fi', tint: '#16A34A' },
    { icon: Truck, label: 'Delivery', tint: '#E11D48' },
    { icon: Gamepad2, label: 'Play a game', tint: '#7C3AED' },
    { icon: MessageSquare, label: 'Feedback', tint: '#2563EB' },
  ];
  const stories = ['#F59E0B', '#E11D48', '#7C3AED', '#0EA5E9', '#16A34A'];
  return (
    <div aria-hidden className="relative w-[270px] h-[560px] rounded-[44px] border-[10px] border-[#1F1F1F] bg-white shadow-2xl overflow-hidden">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-[#1F1F1F] z-10" />
      <div className="h-28 bg-gradient-to-br from-[#7C2D12] via-[#B45309] to-[#F59E0B]" />
      <div className="px-4 -mt-8">
        <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-2xl">☕</div>
        <div className="mt-2 font-semibold text-[#37352F]">Bean &amp; Brew</div>
        <div className="text-[11px] text-gray-500">Café · Open until 6 pm</div>
        <div className="flex gap-2 mt-3">
          {stories.map((c, i) => (
            <div key={c} className="w-10 h-10 rounded-full p-[2px]" style={{ background: `linear-gradient(135deg, ${c}, #F472B6)` }}>
              <div className="w-full h-full rounded-full bg-white p-[2px]"><div className="w-full h-full rounded-full" style={{ background: `${c}33` }}>{i === 0 && <Play className="w-3 h-3 m-auto mt-[11px] text-gray-500" />}</div></div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-[#37352F] text-white text-[13px] font-medium py-2.5 flex items-center justify-center gap-1.5">
          <CreditCard className="w-4 h-4" /> Get your loyalty card <ArrowRight className="w-3.5 h-3.5" />
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          {tiles.map(({ icon: Icon, label, tint }) => (
            <div key={label} className="rounded-xl border notion-border px-2.5 py-2.5 flex items-center gap-2 text-[12px] font-medium text-[#37352F]">
              <span className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tint}18`, color: tint }}><Icon className="w-3.5 h-3.5" /></span>
              {label}
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
