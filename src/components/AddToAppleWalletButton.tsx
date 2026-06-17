import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * "Add to Apple Wallet" button. Shown on iOS (where Apple Wallet exists).
 *
 * Uses supabase.functions.invoke() so we don't touch the protected
 * supabaseUrl / supabaseKey properties. The edge function returns a
 * signed .pkpass binary; we turn it into a blob URL and navigate to it —
 * iOS Safari recognises the application/vnd.apple.pkpass type and opens
 * the "Add to Wallet" sheet automatically.
 */
export function AddToAppleWalletButton({ cardId }: { cardId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show on iOS / iPadOS / Mac (Apple Wallet platforms).
  const isApple = typeof navigator !== 'undefined'
    && /iPhone|iPad|iPod|Macintosh/i.test(navigator.userAgent);
  if (!isApple) return null;

  const handleAdd = async () => {
    setLoading(true);
    setError(null);
    try {
      // invoke() injects the project URL, anon apikey, and the user's
      // bearer token automatically. We ask for the raw response so we
      // can read the .pkpass as a binary blob.
      const { data, error: fnError } = await supabase.functions.invoke(
        'generate-apple-pass',
        { body: { cardId } },
      );

      if (fnError) {
        throw new Error(fnError.message || 'Failed to generate pass');
      }

      // data is a Blob when the function returns a binary body.
      const blob = data instanceof Blob
        ? data
        : new Blob([data], { type: 'application/vnd.apple.pkpass' });

      const url = URL.createObjectURL(blob);
      // Navigating to the blob URL triggers the iOS "Add to Wallet" sheet.
      window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add to Apple Wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleAdd}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-900 disabled:opacity-60 transition w-full"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <> Add to Apple Wallet</>
        )}
      </button>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
