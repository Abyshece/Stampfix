import { LegalPage } from './LegalPage';

/**
 * Canonical, dated sub-processor list referenced by our Data Processing
 * Agreement (DPA §7). Keep this current — the DPA points here as the live list.
 *
 * NOTE: confirm the Supabase project region before launch and adjust the
 * Supabase row accordingly (see the Data residency note).
 */
const SUBPROCESSORS: Array<{
  name: string;
  purpose: string;
  location: string;
  transfer: string;
}> = [
  {
    name: 'Supabase Inc.',
    purpose: 'Database, authentication, file storage',
    location: 'EU (Frankfurt) and/or Canada — depends on project region',
    transfer: 'Within EEA where the EU region is used; otherwise SCCs + Supabase DPA',
  },
  {
    name: 'Vercel Inc.',
    purpose: 'Application hosting and edge network',
    location: 'United States (global edge)',
    transfer: 'EU Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Plus Five Five, Inc. (Resend)',
    purpose: 'Transactional email delivery',
    location: 'United States',
    transfer: 'EU Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Stripe, Inc. / Stripe Payments Europe, Ltd.',
    purpose: 'Merchant subscription billing (payment data only; not cardholder loyalty data)',
    location: 'United States and EU (Ireland)',
    transfer: 'SCCs + Stripe DPA',
  },
  {
    name: 'Google LLC',
    purpose: 'Google Wallet pass generation and distribution (where the cardholder opts in)',
    location: 'United States',
    transfer: 'EU Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Apple Inc.',
    purpose: 'Apple Wallet pass distribution and push updates / APNs (where the cardholder opts in)',
    location: 'United States',
    transfer: 'EU Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Functional Software, Inc. (Sentry)',
    purpose: 'Error monitoring and diagnostics',
    location: 'United States',
    transfer: 'EU Standard Contractual Clauses (SCCs)',
  },
  {
    name: 'Cloudflare, Inc.',
    purpose: 'DDoS protection and Turnstile bot / abuse prevention',
    location: 'United States (global network)',
    transfer: 'EU Standard Contractual Clauses (SCCs)',
  },
];

export function Subprocessors() {
  return (
    <LegalPage title="Sub-processors" lastUpdated="24 June 2026">
      <p>
        Stampfix engages the third-party sub-processors below to process personal data on behalf of
        Merchants. This list is referenced by our{' '}
        <a href="/dpa" className="underline">Data Processing Agreement</a> (§7). Each sub-processor
        is bound by data-protection terms consistent with the DPA. We give Merchants 30 days’ notice
        before adding a new sub-processor and the opportunity to object on reasonable grounds.
      </p>

      <div className="overflow-x-auto border notion-border rounded-lg not-prose">
        <table className="w-full text-sm">
          <thead className="bg-[#F7F7F5] text-left text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Sub-processor</th>
              <th className="px-3 py-2 font-semibold">Purpose</th>
              <th className="px-3 py-2 font-semibold">Location</th>
              <th className="px-3 py-2 font-semibold">Transfer mechanism</th>
            </tr>
          </thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-t notion-border align-top">
                <td className="px-3 py-3 font-medium text-[#37352F] whitespace-nowrap">{s.name}</td>
                <td className="px-3 py-3 text-gray-600">{s.purpose}</td>
                <td className="px-3 py-3 text-gray-600">{s.location}</td>
                <td className="px-3 py-3 text-gray-600">{s.transfer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p>
        Stampfix itself is operated from Canada, which benefits from an EU adequacy decision for
        commercial organisations. International transfers are otherwise governed by the European
        Commission’s Standard Contractual Clauses (2021/914/EU) or an equivalent recognised
        mechanism, as described in the <a href="/dpa" className="underline">DPA</a> and{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>

      <p className="text-xs text-gray-400 pt-8 border-t notion-border mt-8">
        This document is a template provided for convenience and does not constitute legal advice.
        Have it reviewed by qualified counsel before relying on it.
      </p>
    </LegalPage>
  );
}
