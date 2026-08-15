import { useRef } from 'react';
import { Instagram, ChevronLeft, ChevronRight } from 'lucide-react';

// TODO: set your Instagram handle URL:
const IG_URL = 'https://instagram.com/stampfix';

// TODO: drop your exported post images into /public/instagram/ and list them.
// Any that 404 are hidden automatically, so it's safe to add/remove freely.
const POSTS: { img: string; link: string }[] = [
  { img: '/instagram/post1.jpg', link: IG_URL },
  { img: '/instagram/post2.jpg', link: IG_URL },
  { img: '/instagram/post3.jpg', link: IG_URL },
  { img: '/instagram/post4.jpg', link: IG_URL },
  { img: '/instagram/post5.jpg', link: IG_URL },
  { img: '/instagram/post6.jpg', link: IG_URL },
];

export function InstaCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 288, behavior: 'smooth' });

  return (
    <section className="py-20 bg-[#FAFAF8]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <Instagram className="w-5 h-5 text-[#37352F]" />
            <h2 className="text-2xl md:text-3xl font-serif-display font-semibold text-[#37352F]">From our Instagram</h2>
          </div>
          <div className="flex gap-2">
            <button onClick={() => scroll(-1)} className="p-2 rounded-full border border-gray-200 hover:bg-white transition" aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => scroll(1)} className="p-2 rounded-full border border-gray-200 hover:bg-white transition" aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div ref={scrollRef} className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2" style={{ scrollbarWidth: 'none' }}>
          {POSTS.map((p, idx) => (
            <a
              key={idx}
              href={p.link}
              target="_blank"
              rel="noopener"
              className="snap-start flex-shrink-0 w-64 aspect-square rounded-xl overflow-hidden bg-gray-100 group"
            >
              <img
                src={p.img}
                alt={`Stampfix on Instagram, post ${idx + 1}`}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => { e.currentTarget.parentElement!.style.display = 'none'; }}
              />
            </a>
          ))}
        </div>

        <div className="text-center mt-8">
          <a href={IG_URL} target="_blank" rel="noopener" className="inline-flex items-center gap-2 text-sm font-medium text-[#37352F] hover:underline">
            <Instagram className="w-4 h-4" /> Follow us on Instagram
          </a>
        </div>
      </div>
    </section>
  );
}
