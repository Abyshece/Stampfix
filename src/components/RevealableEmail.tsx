import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Renders an email masked as `s•••@gmail.com` until the user clicks it.
 *
 * Why this exists: GDPR allows the merchant to see customer emails
 * (they're the data controller), but defaults-to-hidden is a courtesy
 * to customers AND reduces shoulder-surfing risk at the counter
 * (cashier's screen visible to other customers). The merchant can
 * always reveal by clicking.
 *
 * No revelation event is logged because the data is already visible
 * to this user — masking is purely a UI convention.
 */
export function RevealableEmail({ email, className = '' }: { email: string; className?: string }) {
  const [revealed, setRevealed] = useState(false);

  if (!email) return <span className={className}>—</span>;

  // Mask: keep first char + everything after @
  const at = email.indexOf('@');
  const masked = at > 0
    ? `${email[0]}${'•'.repeat(Math.max(2, Math.min(at - 1, 4)))}${email.substring(at)}`
    : '•••';

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); setRevealed(!revealed); }}
      className={`inline-flex items-center gap-1 hover:text-[#37352F] transition group ${className}`}
      title={revealed ? 'Hide email' : 'Click to reveal email'}
    >
      <span className={revealed ? '' : 'font-mono'}>{revealed ? email : masked}</span>
      {revealed
        ? <EyeOff className="w-3 h-3 opacity-0 group-hover:opacity-50 transition" />
        : <Eye className="w-3 h-3 opacity-30 group-hover:opacity-60 transition" />
      }
    </button>
  );
}
