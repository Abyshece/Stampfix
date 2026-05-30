import { useState, useEffect } from 'react';
import { FileText, Loader2, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ComplianceData {
  country: 'DE' | 'CA' | null;
  legal_entity_name: string;
  business_address: string;
  de_register_number: string;
  de_vat_id: string;
  ca_business_number: string;
}

/**
 * Compliance / billing-info panel inside Settings.
 *
 * Collects the legal entity name, registered address, and the country-
 * specific business registration identifiers required before we can
 * invoice the merchant (and required by law for B2B contracts in DE/CA).
 *
 * All fields are optional on the free tier — they only become required
 * when upgrading to Pro. The Upgrade modal will block checkout until
 * the country-specific minimum is filled.
 */
export function ComplianceSettings({ merchantId }: { merchantId: string }) {
  const [data, setData] = useState<ComplianceData>({
    country: null,
    legal_entity_name: '',
    business_address: '',
    de_register_number: '',
    de_vat_id: '',
    ca_business_number: '',
  });
  const [originalCountry, setOriginalCountry] = useState<'DE' | 'CA' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Load existing values once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: row, error } = await supabase
        .from('merchants')
        .select('country, legal_entity_name, business_address, de_register_number, de_vat_id, ca_business_number')
        .eq('id', merchantId)
        .maybeSingle();
      if (cancelled) return;
      if (error) console.warn('[compliance] load failed:', error);
      if (row) {
        setData({
          country: (row.country as 'DE' | 'CA' | null) ?? null,
          legal_entity_name: row.legal_entity_name ?? '',
          business_address: row.business_address ?? '',
          de_register_number: row.de_register_number ?? '',
          de_vat_id: row.de_vat_id ?? '',
          ca_business_number: row.ca_business_number ?? '',
        });
        setOriginalCountry((row.country as 'DE' | 'CA' | null) ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [merchantId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({
          legal_entity_name: data.legal_entity_name.trim() || null,
          business_address: data.business_address.trim() || null,
          de_register_number: data.de_register_number.trim() || null,
          de_vat_id: data.de_vat_id.trim() || null,
          ca_business_number: data.ca_business_number.trim() || null,
        })
        .eq('id', merchantId);
      if (error) throw error;
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border notion-border p-6 flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // Country is set at signup and shouldn't be changed casually (it
  // affects compliance behaviour, banking, and tax). Show it as
  // read-only here; if a merchant genuinely needs to change country,
  // they can email support.
  const country = originalCountry;

  return (
    <div className="bg-white rounded-lg border notion-border p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-500" /> Business Registration
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Required before upgrading to Pro. Used on invoices and for tax purposes.
        </p>
      </div>

      {country && (
        <div className="bg-[#F7F7F5] border notion-border rounded-md p-3 text-xs text-gray-600 flex items-center gap-2">
          <span className="text-lg">{country === 'DE' ? '🇩🇪' : '🇨🇦'}</span>
          <span>Country: <strong>{country === 'DE' ? 'Germany' : 'Canada'}</strong>. To change, contact support.</span>
        </div>
      )}

      <Field
        label="Legal entity name"
        hint="Full registered name (e.g. 'Acme Coffee GmbH' or 'Acme Coffee Ltd.')"
        value={data.legal_entity_name}
        onChange={(v) => setData({ ...data, legal_entity_name: v })}
        placeholder="Acme Coffee GmbH"
      />

      <Field
        label="Registered business address"
        hint="The address on your business registration."
        value={data.business_address}
        onChange={(v) => setData({ ...data, business_address: v })}
        placeholder="Friedrichstraße 123, 10117 Berlin, Germany"
        multiline
      />

      {country === 'DE' && (
        <>
          <Field
            label="Handelsregister number"
            hint="Commercial register entry, e.g. 'HRB 123456'."
            value={data.de_register_number}
            onChange={(v) => setData({ ...data, de_register_number: v })}
            placeholder="HRB 123456"
          />
          <Field
            label="VAT ID (USt-IdNr.)"
            hint="Required for reverse-charge B2B invoicing within the EU."
            value={data.de_vat_id}
            onChange={(v) => setData({ ...data, de_vat_id: v })}
            placeholder="DE123456789"
          />
        </>
      )}

      {country === 'CA' && (
        <Field
          label="Business Number (BN)"
          hint="9-digit CRA business number, optionally with the program suffix (e.g. 'RT0001' for GST/HST)."
          value={data.ca_business_number}
          onChange={(v) => setData({ ...data, ca_business_number: v })}
          placeholder="123456789 RT0001"
        />
      )}

      <div className="flex items-center justify-between pt-2 border-t notion-border">
        <div className="text-xs text-gray-400">
          {savedAt ? (
            <span className="text-green-600 flex items-center gap-1">
              <Check className="w-3 h-3" /> Saved
            </span>
          ) : (
            <>Changes are saved manually.</>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#37352F] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

function Field({
  label, hint, value, onChange, placeholder, multiline,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium block">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
      )}
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}
