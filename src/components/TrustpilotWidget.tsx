import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    Trustpilot?: { loadFromElement: (el: HTMLElement | null, forceReload?: boolean) => void };
  }
}

// TrustBox — "Review Collector". IDs from your Trustpilot Business account.
export function TrustpilotWidget() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The bootstrap script (in index.html) loads async; force it to hydrate
    // this element once we've mounted (needed in a client-rendered SPA).
    if (window.Trustpilot && ref.current) window.Trustpilot.loadFromElement(ref.current, true);
  }, []);

  return (
    <section className="py-8 bg-white border-y border-gray-100">
      <div className="max-w-3xl mx-auto px-6">
        <div
          ref={ref}
          className="trustpilot-widget"
          data-locale="en-US"
          data-template-id="56278e9abfbbba0bdcd568bc"
          data-businessunit-id="6a7f3b2b59d5f36121bfa279"
          data-style-height="52px"
          data-style-width="100%"
          data-token="c1b7251d-50ca-4d28-a169-cb09dd757579"
        >
          <a href="https://www.trustpilot.com/review/stampfix.app" target="_blank" rel="noopener">Trustpilot</a>
        </div>
      </div>
    </section>
  );
}
