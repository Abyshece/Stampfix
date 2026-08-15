import { Instagram } from 'lucide-react';

// Your handle:
const IG_URL = 'https://instagram.com/stampfix';

// Loads /public/instagram/01.PNG … 46.PNG (leading zero, uppercase .PNG).
// Change COUNT if you add/remove images. Any that 404 hide automatically.
const COUNT = 46;
const imgs = Array.from({ length: COUNT }, (_, i) => `/instagram/${String(i + 1).padStart(2, '0')}.PNG`);
const row = [...imgs, ...imgs]; // duplicated for a seamless infinite loop

export function InstaCarousel() {
  return (
    <section className="py-20 bg-[#FAFAF8] overflow-hidden">
      <style>{`
        @keyframes ig-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .ig-track { animation: ig-marquee 90s linear infinite; }
        .ig-track:hover { animation-play-state: paused; }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 mb-8 flex items-center gap-2">
        <Instagram className="w-5 h-5 text-[#37352F]" />
        <h2 className="text-2xl md:text-3xl font-serif-display font-semibold text-[#37352F]">From our Instagram</h2>
      </div>

      <div className="relative">
        <div className="ig-track flex gap-4 w-max">
          {row.map((src, i) => (
            <a
              key={i}
              href={IG_URL}
              target="_blank"
              rel="noopener"
              className="flex-shrink-0 w-56 aspect-square rounded-xl overflow-hidden bg-gray-100"
            >
              <img
                src={src}
                alt="Stampfix on Instagram"
                loading="lazy"
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.parentElement!.style.display = 'none'; }}
              />
            </a>
          ))}
        </div>
      </div>

      <div className="text-center mt-8">
        <a href={IG_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-medium text-[#37352F] hover:underline">
          <Instagram className="w-4 h-4" /> Follow us on Instagram
        </a>
      </div>
    </section>
  );
}
