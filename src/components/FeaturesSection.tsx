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
    { icon: Wallet,      text: 'Web wallet for iPhone users today; Apple Wallet integration coming soon' },
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

          {/* "My loyalty card" header */}
          <div className="px-4 pt-4 pb-2">
            <div className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">My loyalty card</div>
            <div className="text-sm font-serif-display font-semibold text-[#37352F]">Lucky Café</div>
          </div>

          {/* Card */}
          <div className="px-3 flex-1 flex items-start justify-center pt-2">
            <SampleLoyaltyCard />
          </div>

          {/* Bottom info chip */}
          <div className="px-4 pb-5">
            <div className="bg-white border border-gray-100 rounded-lg px-3 py-2 text-center shadow-sm">
              <div className="text-[8px] uppercase tracking-widest text-gray-400 font-bold">Card ID</div>
              <div className="text-xs font-mono font-semibold text-[#37352F]">SF00042</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Sample loyalty card — mimics WalletCard's look, lighter weight. */
function SampleLoyaltyCard() {
  const filled = 6;
  const total = 8;
  // Match the wallet card aspect ratio (roughly credit-card 1.586:1)
  return (
    <div className="w-full rounded-xl shadow-md overflow-hidden bg-white border border-gray-100">
      {/* Header bar — café color */}
      <div className="bg-gradient-to-br from-[#2d5a3d] to-[#1d3d28] text-white px-3 py-2.5">
        <div className="text-[8px] uppercase tracking-widest opacity-70 font-bold">Buy 8 coffees</div>
        <div className="text-[11px] font-semibold">Get 1 free</div>
      </div>

      {/* Stamps grid */}
      <div className="p-3 grid grid-cols-4 gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const isFilled = i < filled;
          return (
            <div key={i} className={`aspect-square rounded-full flex items-center justify-center text-[10px] font-bold border ${
              isFilled
                ? 'bg-[#2d5a3d] text-white border-[#2d5a3d]'
                : 'bg-gray-50 text-gray-300 border-gray-200 border-dashed'
            }`}>
              {isFilled ? '☕' : ''}
            </div>
          );
        })}
      </div>

      {/* Progress footer */}
      <div className="px-3 pb-3">
        <div className="flex justify-between items-end mb-1">
          <span className="text-[8px] text-gray-400 uppercase tracking-wider font-bold">Holder</span>
          <span className="text-[8px] text-gray-400 uppercase tracking-wider font-bold">Joined</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-semibold text-[#37352F]">Anna L.</span>
          <span className="text-[9px] text-gray-500 font-mono">Mar 12</span>
        </div>
      </div>
    </div>
  );
}
