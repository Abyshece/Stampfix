import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * Small ⓘ next to a heading that explains what a setting actually does.
 * Click to toggle (works on touch), hover to peek on desktop, Escape to close.
 */
export function InfoHint({ text, label }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const visible = open || hover;

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        aria-label={label ? `What is ${label}?` : 'More information'}
        aria-expanded={visible}
        className="text-gray-300 hover:text-gray-500 transition p-0.5 -m-0.5"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {visible && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-64 rounded-lg bg-[#37352F] text-white text-xs leading-relaxed px-3 py-2 shadow-xl font-normal normal-case tracking-normal"
        >
          {text}
        </span>
      )}
    </span>
  );
}
