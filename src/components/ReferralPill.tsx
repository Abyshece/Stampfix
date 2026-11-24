import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gift, ChevronRight, X, Copy, Check, Mail, Share2 } from 'lucide-react';
import { Dialog, btnDark, btnLight } from './addonsUi';
import { getMyReferral, referralLink, type MyReferral } from '../lib/referrals';

const HIDE_KEY = 'stampfix_ref_pill_hidden_until';
const HIDE_DAYS = 14;

function hiddenNow(): boolean {
  try { return Number(localStorage.getItem(HIDE_KEY) ?? 0) > Date.now(); } catch { return false; }
}

/**
 * "Give a month, get a month": the coloured pill under the scanner and the
 * invite sheet it opens. Pro shops (paying or comped) see the invite; a
 * shop on the free plan sees it only when it was invited itself ("go Pro,
 * your 2nd month is free"). Shows nothing until the shop's referral loads,
 * so if anything is wrong with referrals the scanner screen is unchanged.
 */
export function ReferralPill({ isPro, onUpgrade, hide: hideNow = false }: {
  isPro: boolean; onUpgrade: () => void;
  /** Hidden while the camera is open, so the scanner keeps the whole height. */
  hide?: boolean;
}) {
  const { t } = useTranslation();
  const [ref, setRef] = useState<MyReferral | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(hiddenNow);

  useEffect(() => {
    let alive = true;
    getMyReferral().then((r) => { if (alive) setRef(r); }).catch(() => { /* no pill */ });
    return () => { alive = false; };
  }, []);

  if (!ref) return null;
  const invitedOffer = !isPro && ref.invited_by?.status === 'signed_up';
  if (!ref.can_invite && !invitedOffer) return null;

  const hide = () => {
    try { localStorage.setItem(HIDE_KEY, String(Date.now() + HIDE_DAYS * 86_400_000)); } catch { /* ignore */ }
    setHidden(true);
  };

  return (
    <>
      {!hidden && !hideNow && (
        <div className="mt-3 flex-shrink-0 flex items-center rounded-2xl sm:rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-sm" data-referral-pill>
          <button type="button" onClick={() => setOpen(true)}
            className="flex-1 min-w-0 flex items-center gap-2 pl-4 pr-2 py-2.5 text-left text-[13px] sm:text-sm font-medium leading-snug rounded-l-2xl sm:rounded-l-full active:opacity-90">
            <Gift className="w-4 h-4 shrink-0" />
            <span className="min-w-0 line-clamp-2" data-referral-pill-text>
              {invitedOffer
                ? t('dash.referral.pillInvited', { defaultValue: '{{name}} invited you: go Pro and your 2nd month is free', name: ref.invited_by!.name })
                : t('dash.referral.pill', { defaultValue: 'Invite a shop: you both get 1 month of Pro free' })}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0 opacity-80" />
          </button>
          <button type="button" onClick={hide} className="p-2 mr-1.5 rounded-full hover:bg-white/15 shrink-0"
            aria-label={t('dash.referral.hide', { defaultValue: 'Hide for now' })} title={t('dash.referral.hide', { defaultValue: 'Hide for now' })}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {open && <InviteSheet referral={ref} isPro={isPro} canInvite={ref.can_invite} onUpgrade={() => { setOpen(false); onUpgrade(); }} onClose={() => setOpen(false)} />}
    </>
  );
}

function InviteSheet({ referral, isPro, canInvite, onUpgrade, onClose }: {
  referral: MyReferral; isPro: boolean; canInvite: boolean; onUpgrade: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const link = referralLink(referral.code);
  const message = t('dash.referral.message', {
    defaultValue: 'I use Stampfix for our digital stamp card in Apple and Google Wallet. Sign up with my link and we both get a month of Pro free: {{link}}',
    link,
  });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* the link is selectable in the box */ }
  };
  const share = () => { navigator.share?.({ text: message }).catch(() => {}); };

  const status = (s: MyReferral['friends'][number]['status']) =>
    s === 'rewarded' ? t('dash.referral.stRewarded', { defaultValue: 'Went Pro: you both got a month' })
      : s === 'rejected' ? t('dash.referral.stRejected', { defaultValue: 'Didn’t count' })
        : t('dash.referral.stJoined', { defaultValue: 'Signed up, not on Pro yet' });

  return (
    <Dialog title={t('dash.referral.title', { defaultValue: 'Give a month, get a month' })} onClose={onClose}>
      <div className="px-5 pb-5 space-y-5" data-invite-sheet>
        {!isPro && referral.invited_by?.status === 'signed_up' && (
          <div className="rounded-xl bg-violet-50 border border-violet-100 p-4">
            <p className="text-sm text-violet-900">
              {t('dash.referral.invitedBox', { defaultValue: '{{name}} invited you. Go Pro now and your second month is free.', name: referral.invited_by.name })}
            </p>
            <button type="button" className={`${btnDark} mt-3`} onClick={onUpgrade}>{t('dash.referral.goPro', { defaultValue: 'Go Pro' })}</button>
          </div>
        )}
        {!canInvite && (
          <p className="text-xs text-gray-500">{t('dash.referral.proOnly', { defaultValue: 'Once you’re on Pro, you can invite other shops too: for every shop that goes Pro, you both get a month free.' })}</p>
        )}
        {canInvite && (<>

        <ol className="space-y-2.5 text-sm text-gray-700">
          {[
            t('dash.referral.step1', { defaultValue: 'Share your link with another shop owner.' }),
            t('dash.referral.step2', { defaultValue: 'They sign up and go Pro.' }),
            t('dash.referral.step3', { defaultValue: 'After their first payment, you both get 1 month of Pro free.' }),
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>

        <div>
          <div className="text-xs font-medium text-gray-500 mb-1.5">{t('dash.referral.yourLink', { defaultValue: 'Your link' })}</div>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t('dash.referral.yourLink', { defaultValue: 'Your link' })}
              className="flex-1 min-w-0 border notion-border rounded-lg px-3 py-2 text-sm bg-[#F7F7F5] text-[#37352F]" data-referral-link />
            <button type="button" className={btnDark} onClick={copy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? t('dash.referral.copied', { defaultValue: 'Copied' }) : t('dash.referral.copy', { defaultValue: 'Copy' })}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <a className={btnLight} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <a className={btnLight} href={`mailto:?subject=${encodeURIComponent(t('dash.referral.mailSubject', { defaultValue: 'A free month of Stampfix for you' }))}&body=${encodeURIComponent(message)}`}>
              <Mail className="w-4 h-4" /> {t('dash.referral.email', { defaultValue: 'Email' })}
            </a>
            {canShare && <button type="button" className={btnLight} onClick={share}><Share2 className="w-4 h-4" /> {t('dash.referral.share', { defaultValue: 'Share' })}</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border notion-border p-3">
            <div className="text-2xl font-semibold text-[#37352F] tabular-nums">{referral.friends.filter((f) => f.status !== 'rejected').length}</div>
            <div className="text-xs text-gray-500">{t('dash.referral.joined', { defaultValue: 'Shops joined' })}</div>
          </div>
          <div className="rounded-xl border notion-border p-3">
            <div className="text-2xl font-semibold text-[#37352F] tabular-nums">{referral.months_credited + referral.months_waiting}</div>
            <div className="text-xs text-gray-500">
              {t('dash.referral.months', { defaultValue: 'Free months' })}
              {referral.months_waiting > 0 && ` · ${t('dash.referral.waiting', { defaultValue: '{{n}} waiting', n: referral.months_waiting })}`}
            </div>
          </div>
        </div>

        {referral.friends.length > 0 && (
          <ul className="divide-y notion-border border notion-border rounded-xl">
            {referral.friends.map((f, i) => (
              <li key={i} className="px-3 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 break-words text-[#37352F]">{f.name}</span>
                <span className={`text-xs shrink-0 text-right ${f.status === 'rewarded' ? 'text-green-700' : 'text-gray-500'}`}>{status(f.status)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-gray-500 leading-relaxed">
          {t('dash.referral.fine', { defaultValue: 'The free month is a credit on your Stampfix bill and is used on your next payment. Up to 12 free months a year.' })}
        </p>
        </>)}
      </div>
    </Dialog>
  );
}
