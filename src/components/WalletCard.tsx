import { useState } from 'react';
import QRCode from 'react-qr-code';
import type { Campaign, UserCard } from '../types';
import { getSaveToWalletUrl } from '../services/googleWallet';
import { Loader2, X, ShieldAlert } from 'lucide-react';

interface WalletCardProps {
  card: UserCard;
  campaign: Campaign;
  /** Disable the "Save to Google Wallet" button (e.g. in design previews). */
  disableSave?: boolean;
}

export function WalletCard({ card, campaign, disableSave }: WalletCardProps) {
  const stamps = Array.from({ length: campaign.maxStamps }, (_, i) => i + 1);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSaveToWallet = async () => {
    if (disableSave) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const url = await getSaveToWalletUrl(card, campaign);
      // Open in a new tab; on Android this hands off to Google Wallet.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not generate wallet pass');
    } finally {
      setIsLoading(false);
    }
  };

  // Dynamic Styles based on branding
  const getPatternStyle = (): React.CSSProperties => {
    const patternColor = 'rgba(0,0,0,0.03)';
    if (campaign.cardPattern === 'dots') {
      return {
        backgroundImage: `radial-gradient(${patternColor} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
      };
    }
    if (campaign.cardPattern === 'grid') {
      return {
        backgroundImage: `linear-gradient(${patternColor} 1px, transparent 1px), linear-gradient(90deg, ${patternColor} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
      };
    }
    return {};
  };

  // Optimize Grid Layout based on stamp count to prevent elongation
  const getGridSettings = (count: number) => {
    if (count <= 6) return { cols: 'grid-cols-3', gap: 'gap-6', size: 'w-14 h-14', text: 'text-xl', icon: 'text-xl' };
    if (count <= 9) return { cols: 'grid-cols-3', gap: 'gap-4', size: 'w-12 h-12', text: 'text-lg', icon: 'text-lg' };
    return { cols: 'grid-cols-4', gap: 'gap-3', size: 'w-10 h-10', text: 'text-sm', icon: 'text-sm' };
  };

  const layout = getGridSettings(campaign.maxStamps);

  return (
    <div className="w-full space-y-4">
      {/* Error modal */}
      {errorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setErrorMsg(null)}></div>
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setErrorMsg(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mb-4 border border-yellow-100">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Couldn't add to Google Wallet</h3>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">{errorMsg}</p>
            <button
              onClick={() => setErrorMsg(null)}
              className="w-full bg-[#37352F] text-white py-2.5 rounded-md font-medium text-sm"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Card Container */}
      <div
        className="relative rounded-[20px] overflow-hidden shadow-xl transition-transform hover:scale-[1.01] duration-300 flex flex-col bg-white text-gray-900 border border-gray-200 h-[540px]"
      >
        <div className="absolute inset-0 pointer-events-none" style={getPatternStyle()} />

        {/* Header */}
        <div className="relative p-5 pb-2 flex justify-between items-start z-10 shrink-0">
          <div className="flex items-center gap-3">
            {campaign.logoImage ? (
              <img src={campaign.logoImage} alt="Logo" className="w-10 h-10 object-contain rounded-full bg-gray-50 border border-gray-100" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-lg shadow-sm text-black">
                {campaign.customIcon || '🏷️'}
              </div>
            )}
            <h2 className="text-xs font-bold uppercase tracking-widest max-w-[140px] leading-tight text-gray-900">
              {campaign.businessName}
            </h2>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-400 uppercase font-bold tracking-widest mb-0.5">Stamps</div>
            <div className="text-2xl font-bold leading-none tracking-tight">{card.currentStamps}</div>
          </div>
        </div>

        {/* Stamps Grid */}
        <div className="relative px-4 flex-1 z-10 flex flex-col justify-center items-center min-h-0">
          <div className={`grid ${layout.cols} ${layout.gap}`}>
            {stamps.map((num) => {
              const isStamped = num <= card.currentStamps;
              return (
                <div key={num} className="flex flex-col items-center justify-center">
                  <div className={`relative ${layout.size} flex items-center justify-center transition-all duration-300`}>
                    {isStamped ? (
                      <div className={`w-full h-full rounded-full bg-black text-white flex items-center justify-center shadow-md animate-in zoom-in duration-300 ${layout.icon}`}>
                        <div className="font-bold">{campaign.customIcon || <span>✔</span>}</div>
                      </div>
                    ) : (
                      <div className={`w-full h-full rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center font-bold text-gray-300 ${layout.text}`}>
                        {num}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-center shrink-0">
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100 truncate max-w-[200px]">
              {campaign.offerTitle}
            </span>
          </div>
        </div>

        {/* Footer / QR */}
        <div className="relative bg-gray-50 border-t border-gray-100 px-5 py-5 z-10 shrink-0">
          <div className="mb-4 flex justify-between items-end">
            <div>
              <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold block mb-1">Holder</label>
              <div className="text-xs font-bold tracking-tight text-gray-900 truncate max-w-[120px]">{card.customerName}</div>
            </div>
            <div className="text-right">
              <label className="text-[9px] uppercase tracking-widest text-gray-400 font-bold block mb-1">Joined</label>
              <div className="text-[10px] font-mono text-gray-500">{new Date(card.joinedAt).toLocaleDateString()}</div>
            </div>
          </div>

          <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 mx-auto w-fit">
            <QRCode value={JSON.stringify({ cardId: card.id })} size={100} fgColor="#000000" style={{ display: 'block' }} />
          </div>
        </div>
      </div>

      {/* Save to Google Wallet Button - Google's official styling */}
      {!disableSave && (
        <button
          onClick={handleSaveToWallet}
          disabled={isLoading}
          className="w-full bg-black text-white rounded-[12px] h-[48px] flex items-center justify-center gap-3 hover:bg-gray-800 transition shadow-lg active:scale-95 duration-150 disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <GoogleGLogo className="w-5 h-5" />
          )}
          <div className="text-left leading-none">
            <div className="text-[8px] font-medium uppercase tracking-wide opacity-70">Add to</div>
            <div className="text-[13px] font-semibold tracking-tight">Google Wallet</div>
          </div>
        </button>
      )}
    </div>
  );
}

// Inline Google "G" logo as SVG so we don't depend on an external asset.
function GoogleGLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
