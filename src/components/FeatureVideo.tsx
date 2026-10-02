import { useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * The 2-minute feature tour on the landing page. German visitors get the
 * German voice-over, everyone else the English one. Nothing is downloaded
 * until the visitor presses play (preload="none" + a poster image).
 */
export function FeatureVideo() {
  const { t, i18n } = useTranslation();
  const lang: 'en' | 'de' = (i18n.language || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
  return (
    <section id="tour" className="max-w-5xl mx-auto px-6 pt-20 pb-4 text-center">
      <p className="text-xs md:text-sm font-semibold uppercase tracking-widest text-gray-500 mb-3">{t('video.kicker')}</p>
      <h2 className="text-3xl md:text-5xl font-serif-display font-medium mb-4 tracking-tight text-balance">{t('video.heading')}</h2>
      <p className="text-lg text-gray-500 mb-10 max-w-2xl mx-auto text-pretty">{t('video.subtitle')}</p>
      {/* keyed by language so switching language starts fresh on the other video */}
      <Player key={lang} lang={lang} title={t('video.heading')} playLabel={t('video.play')} />
    </section>
  );
}

function Player({ lang, title, playLabel }: { lang: 'en' | 'de'; title: string; playLabel: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const play = () => {
    setStarted(true);
    void videoRef.current?.play().catch(() => { /* the visitor can still use the controls */ });
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border notion-border shadow-xl bg-[#F6F5F2] aspect-video">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full"
        poster={`/videos/stampfix-features-${lang}.jpg`}
        preload="none"
        playsInline
        controls={started}
        onPlay={() => setStarted(true)}
        aria-label={title}
      >
        <source src={`/videos/stampfix-features-${lang}.mp4`} type="video/mp4" />
      </video>
      {!started && (
        <button
          type="button"
          onClick={play}
          className="absolute inset-0 flex items-end justify-center pb-[3%] md:pb-[7%] bg-black/5 hover:bg-black/10 transition group"
          aria-label={playLabel}
        >
          <span className="flex items-center gap-2 md:gap-3 rounded-full bg-[#37352F] text-white pl-3.5 pr-4 py-2 md:pl-5 md:pr-6 md:py-4 shadow-lg group-hover:scale-105 transition">
            <Play className="w-3.5 h-3.5 md:w-6 md:h-6 fill-current" />
            <span className="text-xs md:text-base font-medium">{playLabel}</span>
          </span>
        </button>
      )}
    </div>
  );
}
