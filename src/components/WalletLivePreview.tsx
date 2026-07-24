/**
 * Live Apple Wallet + Google Wallet previews.
 *
 * Rendered from the in-progress settings draft so the merchant sees the real
 * card update as they pick colours — before saving. Layouts follow each
 * platform's actual pass presentation rather than a generic card.
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
  logoMode?: 'stampfix' | 'custom' | 'none';
}

const isDark = (hex: string) => {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 150;
};

function Mark({ color, className }: { color: string; className: string }) {
  return (
    <svg viewBox="0 0 290 90" className={className} fill={color} aria-hidden="true">
      <rect x="8" y="12" width="66" height="66" rx="4" />
      <circle cx="140" cy="45" r="34" />
      <rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(45 240 45)" />
      <rect x="195" y="36" width="90" height="18" rx="9" transform="rotate(-45 240 45)" />
    </svg>
  );
}

/** Top-left branding, honouring the merchant's logo choice. */
function Branding({ s, ink, size }: { s: PreviewSettings; ink: string; size: 'sm' | 'md' }) {
  const mode = s.logoMode ?? 'stampfix';
  const logoCol = s.logoColor || ink;
  const h = size === 'md' ? 'h-4' : 'h-3';
  return (
    <div className="flex items-center gap-2 min-w-0">
      {mode === 'custom' && s.logoImage && (
        <img src={s.logoImage} alt="" className={`${h} w-auto object-contain flex-shrink-0`} />
      )}
      {mode === 'stampfix' && <Mark color={logoCol} className={`${h} w-auto flex-shrink-0`} />}
      <span className={`${size === 'md' ? 'text-sm' : 'text-xs'} font-semibold truncate`}>
        {s.logoText || s.businessName || 'Your Business'}
      </span>
    </div>
  );
}

function StampGrid({ total, filled, color, size }: { total: number; filled: number; color: string; size: number }) {
  const n = Math.min(total, 10);
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: n }, (_, i) => {
        const on = i < filled;
        const kind = i % 3;
        const px = { width: size, height: size };
        if (kind === 2) {
          return (
            <svg key={i} viewBox="0 0 24 24" style={px} fill="none" stroke={color}
              strokeWidth={4} strokeLinecap="round" opacity={on ? 1 : 0.3}>
              <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          );
        }
        return (
          <span key={i} style={{
            ...px,
            backgroundColor: on ? color : 'transparent',
            border: `2px solid ${color}`,
            borderRadius: kind === 1 ? '50%' : 4,
            opacity: on ? 1 : 0.3,
          }} />
        );
      })}
    </div>
  );
}

function QrBlock({ size, code = 'SF00042' }: { size: number; code?: string }) {
  return (
    <div className="bg-white rounded-lg p-2 flex flex-col items-center" style={{ width: size + 16 }}>
      <div style={{
        width: size, height: size,
        backgroundImage: 'repeating-conic-gradient(#000 0% 25%, #fff 0% 50%)',
        backgroundSize: `${Math.max(4, Math.round(size / 11))}px ${Math.max(4, Math.round(size / 11))}px`,
      }} />
      <div className="text-[8px] font-mono text-black mt-1 tracking-wide">{code}</div>
    </div>
  );
}

/** Apple Wallet: pass sheet on the iOS Wallet background. */
function ApplePass({ s }: { s: PreviewSettings }) {
  const bg = s.backgroundColor || '#f0ece1';
  const ink = s.cardTextColor || (isDark(bg) ? '#FFFFFF' : '#1d3458');
  const filled = Math.min(2, s.maxStamps);
  return (
    <div className="rounded-[22px] bg-[#F2F2F7] p-3 shadow-inner">
      {/* iOS status bar */}
      <div className="flex justify-between items-center px-1 pb-2 text-[9px] font-semibold text-gray-500">
        <span>9:41</span>
        <span className="flex items-center gap-0.5"><span className="w-3 h-1.5 rounded-[2px] border border-gray-400" /></span>
      </div>
      {/* the pass */}
      <div className="rounded-[16px] overflow-hidden shadow-md" style={{ backgroundColor: bg, color: ink }}>
        <div className="px-3.5 pt-3 pb-2 flex items-start justify-between gap-2">
          <Branding s={s} ink={ink} size="sm" />
          <div className="text-right leading-tight flex-shrink-0">
            <div className="text-[7px] font-bold tracking-wider" style={{ opacity: 0.65 }}>STAMPS LEFT</div>
            <div className="text-lg font-bold leading-none">{Math.max(0, s.maxStamps - filled)}</div>
          </div>
        </div>
        <div className="px-3.5 py-2">
          <StampGrid total={s.maxStamps} filled={filled} color={ink} size={18} />
        </div>
        <div className="px-3.5 pb-2 flex justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[7px] font-bold tracking-wider" style={{ opacity: 0.65 }}>MEMBER</div>
            <div className="text-[11px] truncate">Lucky Müller</div>
          </div>
          <div className="min-w-0 text-right">
            <div className="text-[7px] font-bold tracking-wider" style={{ opacity: 0.65 }}>REWARD</div>
            <div className="text-[11px] truncate">{s.offerTitle || 'Buy 6, get 1 free'}</div>
          </div>
        </div>
        <div className="flex justify-center pb-3 pt-1"><QrBlock size={72} /></div>
      </div>
      <div className="text-center text-[9px] text-gray-400 pt-2">Apple Wallet</div>
    </div>
  );
}

/** Google Wallet: card on the dark Wallet app surface. */
function GooglePass({ s }: { s: PreviewSettings }) {
  const bg = s.backgroundColor || '#f0ece1';
  const ink = s.cardTextColor || (isDark(bg) ? '#FFFFFF' : '#1d3458');
  const filled = Math.min(2, s.maxStamps);
  return (
    <div className="rounded-[22px] bg-[#202124] p-3">
      <div className="flex justify-between items-center px-1 pb-2 text-[9px] font-semibold text-gray-400">
        <span>9:41</span><span>Wallet</span>
      </div>
      <div className="rounded-[16px] overflow-hidden shadow-lg" style={{ backgroundColor: bg, color: ink }}>
        {/* Google puts the issuer row in a tinted strip at the top */}
        <div className="px-3.5 py-2 flex items-center justify-between gap-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.10)' }}>
          <Branding s={s} ink={ink} size="sm" />
          <span className="text-[8px] font-medium flex-shrink-0" style={{ opacity: 0.7 }}>LOYALTY</span>
        </div>
        <div className="px-3.5 pt-3 pb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[7px] font-bold tracking-wider" style={{ opacity: 0.65 }}>MEMBER</div>
            <div className="text-[12px] font-medium truncate">Lucky Müller</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[7px] font-bold tracking-wider" style={{ opacity: 0.65 }}>STAMPS LEFT</div>
            <div className="text-lg font-bold leading-none">{Math.max(0, s.maxStamps - filled)}</div>
          </div>
        </div>
        <div className="px-3.5 pb-2">
          <StampGrid total={s.maxStamps} filled={filled} color={ink} size={18} />
        </div>
        <div className="px-3.5 pb-2">
          <div className="text-[7px] font-bold tracking-wider" style={{ opacity: 0.65 }}>REWARD</div>
          <div className="text-[11px] truncate">{s.offerTitle || 'Buy 6, get 1 free'}</div>
        </div>
        <div className="flex justify-center pb-3 pt-1"><QrBlock size={72} /></div>
      </div>
      <div className="text-center text-[9px] text-gray-500 pt-2">Google Wallet</div>
    </div>
  );
}

export function WalletLivePreview({ settings }: { settings: PreviewSettings }) {
  return (
    <div className="bg-[#F7F7F5] border notion-border rounded-lg p-4 mb-5">
      <p className="text-sm font-medium text-[#37352F]">This is how your card will look</p>
      <p className="text-xs text-gray-500 mb-4">Updates live as you change colours. Press Save to apply it to real cards.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
        <ApplePass s={settings} />
        <GooglePass s={settings} />
      </div>
    </div>
  );
}
