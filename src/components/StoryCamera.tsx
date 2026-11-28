import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, SwitchCamera, RotateCcw, Check, Loader2, Camera, Video } from 'lucide-react';
import { STORY_MAX_SECONDS } from '../lib/storyMedia';

// Take a story with the camera, right in the browser (laptop or phone): a
// photo, or a video of up to 10 seconds, always upright (9:16, like TikTok).
// A laptop camera films wide, so the middle of the picture is used. What you take goes through the same
// steps as a chosen file (see BusinessPageStories), so it is made small and
// uploaded the same way. Nothing leaves the device until "Use" is tapped.

type Mode = 'photo' | 'video';
type Facing = 'environment' | 'user';
type CamError = 'unsupported' | 'denied' | 'none' | 'failed' | 'noRecorder';

const ERRORS: Record<CamError, [string, string]> = {
  unsupported: ['dash.stories.camUnsupported', "This browser can't use the camera here. Choose a file instead."],
  denied: ['dash.stories.camDenied', 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'],
  none: ['dash.stories.camNone', 'No camera found on this device.'],
  failed: ['dash.stories.camFailed', "The camera couldn't start. Close other apps that use it and try again."],
  noRecorder: ['dash.stories.camNoRecorder', "This browser can't record video. Take a photo instead, or choose a file."],
};

/** The upright 9:16 part from the middle of a camera picture. */
function portraitCrop(w: number, h: number): { x: number; y: number; w: number; h: number } {
  const target = 9 / 16;
  if (w / h > target) { const cw = Math.round(h * target); return { x: Math.round((w - cw) / 2), y: 0, w: cw, h }; }
  const ch = Math.round(w / target);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * The recording format: H.264 MP4 where the browser records it (Safari, and
 * Chrome on most computers: a browser that records it also reads it), else
 * WebM (Chrome and Edge always read their own WebM back), else any MP4.
 * The story is converted to a small MP4 afterwards either way.
 */
function recorderType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return types.find((x) => { try { return MediaRecorder.isTypeSupported(x); } catch { return false; } }) ?? '';
}

export function StoryCamera({ onUse, onClose }: { onUse: (file: File) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const drawRef = useRef<number | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const [mode, setMode] = useState<Mode>('photo');
  const [facing, setFacing] = useState<Facing>('environment');
  const [canFlip, setCanFlip] = useState(false);
  const [status, setStatus] = useState<'starting' | 'live' | 'recording' | 'review' | 'error'>('starting');
  const [error, setError] = useState<CamError | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [taken, setTaken] = useState<{ file: File; url: string; kind: Mode } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  }, []);
  const stopTimer = () => { if (timer.current != null) { window.clearInterval(timer.current); timer.current = null; } };

  // Start (or restart) the camera for the chosen mode and side.
  useEffect(() => {
    if (taken) return;
    let cancelled = false;
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia) { setStatus('error'); setError('unsupported'); return; }
    setStatus('starting');
    setError(null);
    const video = { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } };
    const get = async (): Promise<MediaStream> => {
      if (mode === 'video') {
        try { return await md.getUserMedia({ video, audio: true }); } catch (e) {
          // No microphone, or it is blocked: record without sound.
          const name = (e as DOMException)?.name;
          if (name !== 'NotAllowedError' && name !== 'NotFoundError' && name !== 'NotReadableError') throw e;
          return md.getUserMedia({ video, audio: false });
        }
      }
      return md.getUserMedia({ video, audio: false });
    };
    get().then(async (s) => {
      if (cancelled) { s.getTracks().forEach((tr) => tr.stop()); return; }
      stopStream();
      streamRef.current = s;
      const v = videoRef.current;
      if (v) { v.srcObject = s; try { await v.play(); } catch { /* starts on its own when allowed */ } }
      setStatus('live');
      try {
        const devices = await md.enumerateDevices();
        if (!cancelled) setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1);
      } catch { /* fine */ }
    }).catch((e) => {
      if (cancelled) return;
      const name = (e as DOMException)?.name;
      setStatus('error');
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'none' : 'failed');
    });
    return () => { cancelled = true; };
  }, [mode, facing, taken, stopStream]);

  // Leaving: camera off, recording stopped, previews freed.
  useEffect(() => () => {
    stopTimer();
    if (drawRef.current != null) cancelAnimationFrame(drawRef.current);
    try { if (recRef.current?.state === 'recording') recRef.current.stop(); } catch { /* fine */ }
    stopStream();
  }, [stopStream]);
  useEffect(() => () => { if (taken) URL.revokeObjectURL(taken.url); }, [taken]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, []);

  const takePhoto = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const crop = portraitCrop(v.videoWidth, v.videoHeight);
    const k = Math.min(1, 1920 / crop.h);
    const c = document.createElement('canvas');
    c.width = even(crop.w * k); c.height = even(crop.h * k);
    const x = c.getContext('2d');
    if (!x) { setStatus('error'); setError('failed'); return; }
    x.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    c.toBlob((b) => {
      if (!b) { setStatus('error'); setError('failed'); return; }
      const file = new File([b], 'camera.jpg', { type: 'image/jpeg' });
      stopStream();
      setTaken({ file, url: URL.createObjectURL(file), kind: 'photo' });
      setStatus('review');
    }, 'image/jpeg', 0.92);
  };

  const stopDrawing = () => { if (drawRef.current != null) { cancelAnimationFrame(drawRef.current); drawRef.current = null; } };
  const startRecording = () => {
    const s = streamRef.current;
    const v = videoRef.current;
    const type = recorderType();
    if (!s || !v || !v.videoWidth || type === null) { setStatus('error'); setError('noRecorder'); return; }
    // The upright middle of the picture is drawn onto a canvas, and the canvas is recorded (with the sound).
    const crop = portraitCrop(v.videoWidth, v.videoHeight);
    const k = Math.min(1, 1280 / crop.h);
    const canvas = document.createElement('canvas');
    canvas.width = even(crop.w * k); canvas.height = even(crop.h * k);
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.captureStream !== 'function') { setStatus('error'); setError('noRecorder'); return; }
    const draw = () => { ctx.drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height); drawRef.current = requestAnimationFrame(draw); };
    draw();
    const out = canvas.captureStream(30);
    s.getAudioTracks().forEach((tr) => out.addTrack(tr));
    let rec: MediaRecorder;
    try { rec = type ? new MediaRecorder(out, { mimeType: type }) : new MediaRecorder(out); } catch { stopDrawing(); setStatus('error'); setError('noRecorder'); return; }
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.current.push(e.data); };
    rec.onstop = () => {
      stopTimer();
      stopDrawing();
      out.getVideoTracks().forEach((tr) => tr.stop());
      const mime = (rec.mimeType || type || 'video/webm').split(';')[0];
      const blob = new Blob(chunks.current, { type: mime });
      if (blob.size === 0) { setStatus('error'); setError('failed'); return; }
      const file = new File([blob], mime === 'video/mp4' ? 'camera.mp4' : 'camera.webm', { type: mime });
      stopStream();
      setTaken({ file, url: URL.createObjectURL(file), kind: 'video' });
      setStatus('review');
    };
    recRef.current = rec;
    rec.start(250);
    setElapsed(0);
    setStatus('recording');
    const started = Date.now();
    timer.current = window.setInterval(() => {
      const secs = (Date.now() - started) / 1000;
      setElapsed(Math.min(STORY_MAX_SECONDS, secs));
      if (secs >= STORY_MAX_SECONDS && rec.state === 'recording') rec.stop();
    }, 100);
  };
  const stopRecording = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };

  const retake = () => { setTaken(null); setElapsed(0); };
  const use = () => { if (taken) onUse(taken.file); };

  const mirror = facing === 'user';
  const pct = Math.min(1, elapsed / STORY_MAX_SECONDS);
  const R = 34, CIRC = 2 * Math.PI * R;

  return createPortal(
    <div className="fixed inset-0 z-[110] bg-black text-white flex flex-col" role="dialog" aria-modal="true"
      aria-label={t('dash.stories.camTitle', { defaultValue: 'Take a story' })} data-story-camera data-camera-status={status}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <button type="button" onClick={onClose} aria-label={t('dash.stories.camClose', { defaultValue: 'Close' })} data-camera-close
          className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><X className="w-5 h-5" /></button>
        <div className="text-sm font-semibold">{t('dash.stories.camTitle', { defaultValue: 'Take a story' })}</div>
        {canFlip && !taken && status !== 'recording' ? (
          <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} data-camera-flip
            aria-label={t('dash.stories.camFlip', { defaultValue: 'Switch camera' })}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><SwitchCamera className="w-5 h-5" /></button>
        ) : <span className="w-10 h-10" />}
      </div>

      <div className="relative flex-1 min-h-0 mx-4 flex items-center justify-center overflow-hidden">
        {/* An upright 9:16 frame, like a phone story. */}
        <div className={`relative h-full max-w-full aspect-[9/16] rounded-2xl overflow-hidden bg-neutral-900 ${status === 'error' ? 'hidden' : ''}`} data-camera-frame>
          {taken ? (
            taken.kind === 'photo'
              ? <img src={taken.url} alt="" className="absolute inset-0 w-full h-full object-cover" data-camera-review="photo" />
              : <video src={taken.url} className="absolute inset-0 w-full h-full object-cover" controls autoPlay loop playsInline data-camera-review="video" />
          ) : (
            <video ref={videoRef} muted playsInline autoPlay data-camera-live
              className={`absolute inset-0 w-full h-full object-cover ${mirror ? '-scale-x-100' : ''}`} />
          )}
        </div>
        {status === 'starting' && <Loader2 className="absolute w-8 h-8 animate-spin text-white/70" />}
        {status === 'error' && error && (
          <div className="relative max-w-sm text-center space-y-4" data-camera-error={error}>
            <Camera className="w-10 h-10 mx-auto text-white/50" />
            <p className="text-[15px] leading-relaxed text-white/90">{t(ERRORS[error][0], { defaultValue: ERRORS[error][1] })}</p>
            <div className="flex justify-center gap-2">
              {error === 'noRecorder' && (
                <button type="button" onClick={() => { setMode('photo'); setError(null); setStatus('starting'); }}
                  className="rounded-full bg-white text-black px-4 py-2 text-sm font-semibold">{t('dash.stories.camPhotoInstead', { defaultValue: 'Take a photo' })}</button>
              )}
              <button type="button" onClick={onClose} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">{t('dash.stories.camClose', { defaultValue: 'Close' })}</button>
            </div>
          </div>
        )}
        {status === 'recording' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold tabular-nums" data-camera-time>
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            0:{String(Math.floor(elapsed)).padStart(2, '0')} / 0:{String(STORY_MAX_SECONDS).padStart(2, '0')}
          </div>
        )}
      </div>

      <div className="px-4 pt-4 pb-8 space-y-4" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        {taken ? (
          <div className="flex items-center justify-center gap-3">
            <button type="button" onClick={retake} data-camera-retake
              className="inline-flex items-center gap-2 rounded-full bg-white/15 hover:bg-white/25 px-5 py-3 text-sm font-semibold">
              <RotateCcw className="w-4 h-4" />{t('dash.stories.camRetake', { defaultValue: 'Retake' })}
            </button>
            <button type="button" onClick={use} data-camera-use
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-5 py-3 text-sm font-semibold">
              <Check className="w-4 h-4" />{taken.kind === 'photo' ? t('dash.stories.camUsePhoto', { defaultValue: 'Use this photo' }) : t('dash.stories.camUseVideo', { defaultValue: 'Use this video' })}
            </button>
          </div>
        ) : status !== 'error' && (
          <>
            <div className="flex justify-center">
              <div className="inline-flex rounded-full bg-white/10 p-1 text-sm font-semibold" role="group">
                {(['photo', 'video'] as Mode[]).map((m) => (
                  <button key={m} type="button" disabled={status === 'recording'} onClick={() => setMode(m)} aria-pressed={mode === m} data-camera-mode={m}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 transition ${mode === m ? 'bg-white text-black' : 'text-white/80'}`}>
                    {m === 'photo' ? <Camera className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                    {m === 'photo' ? t('dash.stories.camPhoto', { defaultValue: 'Photo' }) : t('dash.stories.camVideo', { defaultValue: 'Video' })}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-center">
              <button type="button" disabled={status !== 'live' && status !== 'recording'} data-camera-shutter
                onClick={mode === 'photo' ? takePhoto : status === 'recording' ? stopRecording : startRecording}
                aria-label={mode === 'photo' ? t('dash.stories.camTake', { defaultValue: 'Take photo' })
                  : status === 'recording' ? t('dash.stories.camStop', { defaultValue: 'Stop' }) : t('dash.stories.camRecord', { defaultValue: 'Record' })}
                className="relative w-20 h-20 rounded-full flex items-center justify-center disabled:opacity-40">
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
                  <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" />
                  {status === 'recording' && <circle cx="40" cy="40" r={R} fill="none" stroke="#EF4444" strokeWidth="4" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} strokeLinecap="round" />}
                </svg>
                <span className={`block transition-all ${mode === 'video'
                  ? status === 'recording' ? 'w-7 h-7 rounded-md bg-red-500' : 'w-14 h-14 rounded-full bg-red-500'
                  : 'w-14 h-14 rounded-full bg-white'}`} />
              </button>
            </div>
            <p className="text-center text-xs text-white/60">
              {mode === 'photo' ? t('dash.stories.camHintPhoto', { defaultValue: 'Tap to take a photo.' })
                : t('dash.stories.camHintVideo', { n: STORY_MAX_SECONDS, defaultValue: 'Tap to record, tap again to stop. Up to {{n}} seconds.' })}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
