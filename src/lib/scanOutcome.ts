import type { TFunction } from 'i18next';
import type { ScanCard, ScanResult } from './db';

/** What a stamp / redeem attempt from the dashboard actually did. */
export interface ScanOutcome {
  ok: boolean;
  action?: 'STAMP' | 'REDEEM';
  card?: ScanCard;
  /** Shown in the scan banner. The dashboard's celebration and wrong-shop
   *  overlay key off these exact English phrases ("Stamp Added", "Reward
   *  Unlocked!", "Reward Redeemed", "different café"). */
  message: string;
  /** The merchant closed the daily-limit prompt: nothing happened, show nothing. */
  cancelled?: boolean;
}

export function scanSuccessMessage(r: Extract<ScanResult, { ok: true }>): string {
  if (r.action === 'REDEEM') return 'Reward Redeemed';
  return r.card.currentStamps >= r.card.maxStamps ? 'Reward Unlocked!' : 'Stamp Added';
}

export function scanErrorMessage(error: string, t: TFunction): string {
  switch (error) {
    case 'not_found': return 'This card is from a different café';
    case 'blocked': return 'This card is blocked';
    case 'card_full': return t('dash.scan.errFull', { defaultValue: 'This card is already full — redeem the reward first.' });
    case 'not_full': return t('dash.scan.errNotFull', { defaultValue: 'This card isn’t full yet, so there’s no reward to redeem.' });
    case 'merchant_frozen': return t('dash.scan.errFrozen', { defaultValue: 'Stamping is temporarily disabled for this account. Please contact support.' });
    case 'merchant_inactive': return t('dash.scan.errInactive', { defaultValue: 'This account is not active.' });
    case 'not_signed_in': return t('dash.scan.errSignedOut', { defaultValue: 'You’ve been signed out. Please sign in again.' });
    default: return t('dash.shell.errStamp', { defaultValue: 'Stamp failed' });
  }
}
