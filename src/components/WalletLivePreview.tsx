/**
 * Live Apple Wallet + Google Wallet previews.
 *
 * Renders straight from the in-progress settings draft, so the merchant sees
 * the card change as they pick colours — before saving anything.
 */

interface PreviewSettings {
  businessName: string;
  offerTitle: string;
  maxStamps: number;
  backgroundColor?: string | null;
  cardTextColor?: string | null;
  logoColor?: string | null;
  logoText?: string | null;
  logoImage?: string | null;
}

const isDark = (hex: string) => {
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
};

function Mark({ color, className = 'h-3' }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 290 90" className={`${className} w-auto`} fill={color} aria-hidden="true">
      <rect x="8" y="12" width="66" height="66" rx="4" />
      <circle cx="140" cy="45" r="34" />
      <rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)" />
      <rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)" />
    </svg>
  );
}

function Stamps({ total, filled, color }: { total: number; filled: number; color: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: Math.min(total, 10) }, (_, i) => {
        const on = i < filled;
        const kind = i % 3;
        const style = { backgroundColor: on ? color : 'transparent', borderColor: color, opacity: on ? 1 : 0.35 };
        if (kind === 2) {
          return (
            <span key={i} className="w-4 h-4 flex items-center justify-center" style={{ opacity: on ? 1 : 0.35 }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke={color} strokeWidth={4} strokeLinecap="round">
                <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
              </svg>
            </span>
          );
        }
        return <span key={i} className={`w-4 h-4 border-2 ${kind === 1 ? 'rounded-full' : 'rounded-[3px]'}`} style={style} />;
      })}
    </div>
  );
}

function CardFace({ s, platform }: { s: PreviewSettings; platform: 'apple' | 'google' }) {
  const bg = s.backgroundColor || '#f0ece1';
  const ink = s.cardTextColor || (isDark(bg) ? '#FFFFFF' : '#1d3458');
  const logo = s.logoColor || (isDark(bg) ? '#FFFFFF' : '#111827');
  const filled = Math.min(2, s.maxStamps);

  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-lg" style={{ backgroundColor: bg, color: ink }}>
      {platform === 'google' && (
        <div className="px-3 py-1.5 text-[9px] font-medium" style={{ backgroundColor: 'rgba(0,0,0,0.12)', color: ink }}>
          Google Wallet
        </div>
      )}
      <div className="p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {s.logoImage
              ? <img src={s.logoImage} alt="" className="h-4 w-auto object-contain" />
              : <Mark color={logo} />}
            <span className="text-[11px] font-bold truncate">{s.logoText || s.businessName || 'Your Business'}</span>
          </div>
          <div className="text-right leading-none">
            <div className="text-[7px] font-bold tracking-wider opacity-70">STAMPS LEFT</div>
            <div className="text-base font-bold">{Math.max(0, s.maxStamps - filled)}</div>
          </div>
        </div>

        <Stamps total={s.maxStamps} filled={filled} color={ink} />

        <div className="flex justify-between items-end gap-2">
          <div className="min-w-0">
            <div className="text-[7px] font-bold tracking-wider opacity-70">MEMBER</div>
            <div className="text-[11px] truncate">Lucky Müller</div>
          </div>
          <div className="text-right min-w-0">
            <div className="text-[7px] font-bold tracking-wider opacity-70">REWARD</div>
            <div className="text-[11px] truncate">{s.offerTitle || 'Buy 6, get 1 free'}</div>
          </div>
        </div>

        <div className="bg-white rounded-md p-2 flex flex-col items-center">
          <div
            className="w-16 h-16"
            style={{
              backgroundImage:
                'repeating-conic-gradient(#000 0% 25%, #fff 0% 50%)',
              backgroundSize: '8px 8px',
            }}
          />
          <div className="text-[7px] font-mono text-black mt-1">SF00042</div>
        </div>
      </div>
    </div>
  );
}

export function WalletLivePreview({ settings }: { settings: PreviewSettings }) {
  return (
    <div className="bg-[#F7F7F5] border notion-border rounded-lg p-4 mb-5">
      <p className="text-sm font-medium text-[#37352F] mb-1">This is how your card will look</p>
      <p className="text-xs text-gray-500 mb-4">Updates live as you change colours. Save to apply it to real cards.</p>
      <div className="grid grid-cols-2 gap-4 max-w-md">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Apple Wallet</div>
          {/* Apple presents passes on a neutral sheet */}
          <div className="bg-[#EDEDED] rounded-2xl p-2">
            <CardFace s={settings} platform="apple" />
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Google Wallet</div>
          <div className="bg-[#202124] rounded-2xl p-2">
            <CardFace s={settings} platform="google" />
          </div>
        </div>
      </div>
    </div>
  );
}
