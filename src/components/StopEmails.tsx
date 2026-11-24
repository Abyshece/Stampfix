import { useEffect, useState } from 'react';
import { stopOutreachEmails } from '../lib/outreach';

/**
 * stampfix.app/stop-emails?t=<token>: the unsubscribe link from Stampfix's
 * outreach emails to shops. No login; the token is the authorisation.
 */
export function StopEmails() {
  const [state, setState] = useState<'loading' | 'done' | 'notfound' | 'error'>('loading');
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(token)) { setState('notfound'); return; }
    stopOutreachEmails(token).then((ok) => setState(ok ? 'done' : 'notfound')).catch(() => setState('error'));
  }, []);
  return (
    <div className="min-h-screen bg-[#FBFBFA] flex items-center justify-center p-6">
      <div className="max-w-sm w-full bg-white border border-[#E9E9E7] rounded-2xl p-8 text-center">
        <div className="text-lg font-semibold text-[#37352F]">
          {state === 'loading' && 'One moment…'}
          {state === 'done' && 'You’re unsubscribed'}
          {state === 'notfound' && 'This link doesn’t work'}
          {state === 'error' && 'Something went wrong'}
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {state === 'done' && 'Stampfix won’t email you again. Sorry for the bother.'}
          {state === 'notfound' && 'Reply “no thanks” to our email instead and we won’t email you again.'}
          {state === 'error' && 'Please try again, or reply “no thanks” to our email.'}
        </p>
        <a href="/" className="inline-block mt-6 text-sm text-gray-500 underline">stampfix.app</a>
      </div>
    </div>
  );
}
