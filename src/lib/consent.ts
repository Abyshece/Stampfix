import { supabase } from './supabase';

export type ConsentDoc =
  | 'terms'
  | 'cardholder_terms'
  | 'privacy'
  | 'dpa'
  | 'withdrawal_waiver'
  | 'marketing_consent';

/**
 * Append an immutable consent record to `legal_consents` via the `log_consent`
 * RPC. The RPC captures the client IP + user-agent server-side (from request
 * headers) and bypasses RLS (SECURITY DEFINER), so the client only supplies the
 * metadata. Fire-and-forget: never blocks the UX, and a failure is swallowed so
 * it can never break signup.
 */
export async function logConsent(opts: {
  subjectType: 'merchant' | 'cardholder';
  document: ConsentDoc;
  version: string;
  userId?: string | null;
  cardId?: string | null;
  granted?: boolean;
  locale?: string | null;
}): Promise<void> {
  try {
    await supabase.rpc('log_consent', {
      p_subject_type: opts.subjectType,
      p_document: opts.document,
      p_version: opts.version,
      p_user_id: opts.userId ?? null,
      p_card_id: opts.cardId ?? null,
      p_granted: opts.granted ?? true,
      p_locale: opts.locale ?? (typeof navigator !== 'undefined' ? navigator.language : null),
    });
  } catch (e) {
    console.warn('[consent] log failed (non-blocking):', e);
  }
}

/** Current document versions — bump these when the wording changes. */
export const CONSENT_VERSIONS = {
  // v2.2: the free plan covers 5 Cardholders (was 10).
  terms: 'ToS_v2.2_2026-11',
  cardholder_terms: 'CardholderTerms_v1_2026-08',
  privacy: 'Privacy_v1_2026-08',
  dpa: 'DPA_v1_2026-08',
  // v2: covers offers by email AND as wallet-card notifications (v1 named emails only).
  marketing: 'MarketingConsent_v2_2026-11',
} as const;
