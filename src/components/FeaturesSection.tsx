import { Check, Smartphone, Zap, BarChart3, Palette, Layers, Globe, Wallet, Building2, Shield, Mail, MapPin } from 'lucide-react';

/**
 * Features section for the marketing site. Two-column on desktop:
 *   left  — checklist of capabilities
 *   right — iPhone mockup showing a sample loyalty card
 * Stacks vertically on mobile.
 *
 * The phone mockup is pure CSS — no asset files. Rounded rectangle
 * "device" with notch, containing an inline SVG loyalty card. Keeps
 * the bundle small and rendering crisp at any resolution.
 */
export function FeaturesSection() {
  const features = [
    { icon: Zap,         text: 'No extra scanner hardware — your phone is the terminal' },
    { icon: Smartphone,  text: 'Set up your first loyalty card in 2-3 minutes' },
    { icon: Globe,       text: 'No app for customers to download — works in any browser' },
    { icon: BarChart3,   text: 'Detailed dashboard with per-location and per-offer analytics' },
    { icon: Palette,     text: 'Brand it your way — choose colors, logo, and offer text' },
    { icon: Layers,      text: 'Run multiple offers and migrate customers automatically' },
    { icon: Wallet,      text: 'Works with Apple Wallet and Google Wallet — no app to download' },
    { icon: Building2,   text: 'Multi-location ready — one account, every branch tracked separately' },
    // Extras I'd add — features Stampfix has that you didn't mention:
    { icon: Mail,        text: 'Automatic one-stamp-away emails bring customers back' },
    { icon: Shield,      text: 'GDPR-compliant by default with consent flow + data deletion' },
    { icon: MapPin,      text: 'Print-ready posters in 3 sizes (business card, A5, A4)' },
  ];

  return (
    <section className="bg-white py-16 md:py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 md:mb-16">
          <span className="text-xs uppercase tracking-widest font-bold text-gray-400">Features</span>
          <h2 className="text-3xl md:text-5xl font-serif-display font-semibold mt-2 mb-4">
            Everything a small business needs
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto">
            Built for cafés, salons, and shops who want loyalty without the bloat — or the price tag — of enterprise platforms.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 md:gap-16 items-center">
          {/* Left — feature checklist */}
          <div className="space-y-3">
            {features.map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#37352F] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4" strokeWidth={3} />
                </div>
                <div className="flex-1 pt-0.5">
                  <span className="text-sm md:text-base text-[#37352F] leading-relaxed">{f.text}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Right — iPhone mockup with Lucky Café loyalty card */}
          <div className="flex justify-center md:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Pure-CSS iPhone-style frame with a sample loyalty card inside. */
function PhoneMockup() {
  return (
    <div className="relative" style={{ width: 280, maxWidth: '100%' }}>
      {/* Device body */}
      <div className="relative bg-[#1a1a1a] rounded-[40px] p-2.5 shadow-2xl" style={{ aspectRatio: '9 / 19' }}>
        {/* Screen */}
        <div className="bg-[#F7F7F5] rounded-[32px] w-full h-full overflow-hidden relative flex flex-col">
          {/* Notch */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#1a1a1a] rounded-full z-10" />

          {/* Status bar */}
          <div className="pt-2.5 px-5 pb-3 flex justify-between items-center text-[10px] font-semibold text-[#37352F] z-0">
            <span>9:41</span>
            <span className="opacity-0">notch</span>
            <span>5G</span>
          </div>

          {/* "My loyalty card" label */}
          <div className="px-4 pt-2 pb-3">
            <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">My loyalty card</div>
          </div>

          {/* Card */}
          <div className="px-3 flex-1 flex items-start justify-center">
            <SampleLoyaltyCard />
          </div>

          {/* Bottom spacer to balance the layout */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}

/** Sample loyalty card — matches the actual WalletCard component design. */
function SampleLoyaltyCard() {
  const filled = 3;
  const total = 6;
  return (
    <div className="w-full rounded-2xl shadow-md overflow-hidden bg-white border border-gray-100">
      {/* Top row: logo + business name on left, stamp count on right */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-white border border-gray-100 flex items-center justify-center text-sm shadow-sm">
            ☕
          </div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#37352F]">Lucky Cafe</div>
        </div>
        <div className="text-right">
          <div className="text-[7px] uppercase tracking-widest text-gray-400 font-bold">Stamps</div>
          <div className="text-base font-bold text-[#37352F] leading-tight">{filled}</div>
        </div>
      </div>

      {/* Stamps grid — 3 columns × 2 rows = 6 total */}
      <div className="px-3 py-2 grid grid-cols-3 gap-2 place-items-center">
        {Array.from({ length: total }, (_, i) => {
          const isFilled = i < filled;
          return isFilled ? (
            <div key={i} className="w-11 h-11 rounded-full bg-black flex items-center justify-center text-sm shadow-sm">
              ☕
            </div>
          ) : (
            <div key={i} className="w-11 h-11 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center text-xs text-gray-300 font-semibold">
              {i + 1}
            </div>
          );
        })}
      </div>

      {/* Offer pill */}
      <div className="px-3 pb-2.5 flex justify-center">
        <div className="bg-gray-50 border border-gray-100 rounded-full px-3 py-1">
          <span className="text-[8px] uppercase tracking-wider text-gray-500 font-semibold">Order 6 times, 1 mango la...</span>
        </div>
      </div>

      {/* Footer: Holder / ID / Joined columns */}
      <div className="bg-gray-50 border-t border-gray-100 px-3 py-2.5 grid grid-cols-3 gap-1 items-end">
        <div>
          <div className="text-[7px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">Holder</div>
          <div className="text-[9px] font-bold text-[#37352F] truncate">Anna L.</div>
        </div>
        <div className="text-center">
          <div className="text-[7px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">ID</div>
          <div className="text-[9px] font-mono font-semibold text-[#37352F]">SF00042</div>
        </div>
        <div className="text-right">
          <div className="text-[7px] uppercase tracking-widest text-gray-400 font-bold mb-0.5">Joined</div>
          <div className="text-[8px] font-mono text-gray-500">Mar 12</div>
        </div>
      </div>

      {/* Mini QR placeholder */}
      <div className="bg-gray-50 px-3 pb-3 flex justify-center">
        <div className="w-14 h-14 bg-white border border-gray-200 rounded-md p-1 shadow-sm">
          <div className="w-full h-full bg-[length:6px_6px] bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%),linear-gradient(45deg,#000_25%,transparent_25%,transparent_75%,#000_75%)] bg-[position:0_0,3px_3px]" />
        </div>
      </div>
    </div>
  );
}
