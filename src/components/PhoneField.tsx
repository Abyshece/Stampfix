import { useState } from 'react';

/** Country dropdown (flag + dial code) followed by the phone-number field.
 *  Reports the combined value (e.g. "+49 170 1234567") up via onChange. */
const COUNTRIES = [
  { flag: '🇩🇪', code: '+49', name: 'Germany' },
  { flag: '🇨🇦', code: '+1',  name: 'Canada' },
  { flag: '🇺🇸', code: '+1',  name: 'United States' },
  { flag: '🇦🇹', code: '+43', name: 'Austria' },
  { flag: '🇨🇭', code: '+41', name: 'Switzerland' },
  { flag: '🇬🇧', code: '+44', name: 'United Kingdom' },
  { flag: '🇫🇷', code: '+33', name: 'France' },
  { flag: '🇳🇱', code: '+31', name: 'Netherlands' },
  { flag: '🇮🇹', code: '+39', name: 'Italy' },
  { flag: '🇪🇸', code: '+34', name: 'Spain' },
];

export function PhoneField({ onChange, onEnter }: { onChange: (v: string) => void; onEnter?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [number, setNumber] = useState('');
  const emit = (i: number, num: string) =>
    onChange(num.trim() ? `${COUNTRIES[i].code} ${num.trim()}` : '');
  return (
    <div className="flex gap-2">
      <select
        value={idx}
        onChange={(e) => { const i = Number(e.target.value); setIdx(i); emit(i, number); }}
        className="bg-[#F7F7F5] border notion-border rounded-md px-2 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        aria-label="Country code"
      >
        {COUNTRIES.map((c, i) => (
          <option key={i} value={i}>{c.flag} {c.code}</option>
        ))}
      </select>
      <input
        type="tel"
        value={number}
        onChange={(e) => { const n = e.target.value.replace(/[^\d\s]/g, ''); setNumber(n); emit(idx, n); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(); }}
        className="flex-1 min-w-0 bg-[#F7F7F5] border notion-border rounded-md px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder-gray-300"
        placeholder="170 1234567"
        aria-label="Phone number"
      />
    </div>
  );
}
