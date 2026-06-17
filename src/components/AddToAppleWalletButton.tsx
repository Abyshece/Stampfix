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
          <>
            <svg className="w-4 h-4" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
              <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
            </svg>
            Add to Apple Wallet
          </>
        )}
      </button>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
