export type MerchantCountry = 'DE' | 'CA' | null | undefined;

/**
 * Merchant-facing Pro pricing.
 *
 * Prices are shown in the currency the merchant is actually billed — see
 * supabase/functions/create-checkout-session (CA → CAD, DE → EUR, default EUR).
 * German prices are shown inclusive of VAT ("incl. USt.") per German pricing law
 * (Preisangabenverordnung).
 */
export function proPrice(country: MerchantCountry): {
  amount: string;    // headline amount, e.g. '€19.99' or 'CA$29.99'
  perMonth: string;  // amount + cadence, e.g. '€19.99/mo incl. USt.'
  note: string;      // billing sentence shown under the price
} {
  if (country === 'DE') {
    return {
      amount: '€19.99',
      perMonth: '€19.99/mo incl. USt.',
      note: 'Billed monthly in euros, incl. USt.',
    };
  }
  return {
    amount: 'CA$29.99',
    perMonth: 'CA$29.99/mo',
    note: country === 'CA'
      ? 'Billed monthly in Canadian dollars.'
      : 'Billed monthly in Canadian dollars — your bank converts to your local currency.',
  };
}

/** Numeric price + currency symbol, for calculators that do maths on the amount. */
export function proMonthly(country: MerchantCountry): {
  amount: number; symbol: string; vat: boolean;
} {
  if (country === 'DE') return { amount: 19.99, symbol: '€', vat: true };
  return { amount: 29.99, symbol: 'CA$', vat: false };
}
