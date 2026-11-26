// Turns a shop's photo or video into what a Business page story shows,
// entirely in the shop's browser (no video server, no extra cost):
//   video: at most 10 seconds, at most 1280 px tall or wide, H.264 MP4 that
//          every phone plays. Sound is kept when this browser can encode AAC
//          (Safari, and Chrome or Edge on Mac, Windows and phones); otherwise
//          the story plays without sound.
//   photo: a JPEG at most 1080 x 1920.
// Each also gets a small square still for the round bubble.
// Mediabunny (MPL-2.0, used unmodified) is loaded only when a video is converted.

export const STORY_MAX_SECONDS = 10;
export const STORY_MAX_BYTES = 15 * 1024 * 1024;

export type StoryMediaErrorCode =
  | 'unsupported_browser' // no video encoding in this browser
  | 'unreadable'          // not an image or video we can open
  | 'cannot_decode'       // e.g. an iPhone (HEVC) video in a browser that can't play it
  | 'too_big'             // the result is over the upload limit
  | 'failed';

export class StoryMediaError extends Error {
  constructor(public code: StoryMediaErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface PreparedStoryMedia {
  kind: 'video' | 'photo';
  media: Blob;
  mediaType: 'video/mp4' | 'image/jpeg';
  poster: Blob;
  /** Videos only, in milliseconds. */
  durationMs: number | null;
  hasSound: boolean;
  width: number;
  height: number;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The largest size within a portrait 720x1280 box (or landscape 1280x720), never upscaled. */
export function storyVideoSize(w: number, h: number): { width: number; height: number } {
  const [maxW, maxH] = w >= h ? [1280, 720] : [720, 1280];
  const k = Math.min(1, maxW / w, maxH / h);
  return { width: even(w * k), height: even(h * k) };
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) => (canvas as HTMLCanvasElement).toBlob(
    (b) => (b ? resolve(b) : reject(new StoryMediaError('failed', 'toBlob'))), type, quality));
}

/** A square still, cropped from the middle. */
async function squareStill(source: CanvasImageSource, w: number, h: number, size = 360): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const x = c.getContext('2d');
  if (!x) throw new StoryMediaError('failed', 'canvas');
  const side = Math.min(w, h);
  x.drawImage(source, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
  return canvasToBlob(c, 'image/jpeg', 0.82);
}

async function preparePhoto(file: File): Promise<PreparedStoryMedia> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new StoryMediaError('unreadable', file.type || 'image');
  }
  const k = Math.min(1, 1080 / Math.min(bmp.width, bmp.height), 1920 / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * k), height = Math.round(bmp.height * k);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const x = c.getContext('2d');
  if (!x) throw new StoryMediaError('failed', 'canvas');
  x.drawImage(bmp, 0, 0, width, height);
  const media = await canvasToBlob(c, 'image/jpeg', 0.85);
  const poster = await squareStill(bmp, bmp.width, bmp.height);
  bmp.close();
  if (media.size > STORY_MAX_BYTES) throw new StoryMediaError('too_big');
  return { kind: 'photo', media, mediaType: 'image/jpeg', poster, durationMs: null, hasSound: false, width, height };
}

async function prepareVideo(file: File, onProgress?: (p: number) => void): Promise<PreparedStoryMedia> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') throw new StoryMediaError('unsupported_browser');
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    let track;
    try {
      track = await input.getPrimaryVideoTrack();
    } catch {
      throw new StoryMediaError('unreadable', file.type || 'video');
    }
    if (!track) throw new StoryMediaError('unreadable', 'no video track');
    if (!(await track.canDecode())) throw new StoryMediaError('cannot_decode', track.codec ?? 'unknown');

    const total = await input.computeDuration();
    const end = Math.min(total, STORY_MAX_SECONDS);
    if (!(end > 0.25)) throw new StoryMediaError('unreadable', 'too short');
    const { width, height } = storyVideoSize(track.displayWidth, track.displayHeight);
    if (!(await mb.canEncodeVideo('avc', { width, height }))) throw new StoryMediaError('unsupported_browser', 'avc');

    // The still for the bubble: a frame just after the start.
    const sink = new mb.CanvasSink(track, { width: 360, height: 360, fit: 'cover' });
    const frame = await sink.getCanvas(Math.min(0.5, end / 2));
    if (!frame) throw new StoryMediaError('cannot_decode', 'no frame');
    const poster = await canvasToBlob(frame.canvas, 'image/jpeg', 0.82);

    const keepSound = !!(await input.getPrimaryAudioTrack()) && await mb.canEncodeAudio('aac');
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input, output, tracks: 'primary', showWarnings: false,
      trim: { start: 0, end },
      video: { codec: 'avc', width, height, fit: 'contain', frameRate: 30, quality: mb.QUALITY_MEDIUM,
        forceTranscode: true, allowTransformationMetadata: false },
      audio: keepSound ? { codec: 'aac', numberOfChannels: 2, sampleRate: 48000, quality: mb.QUALITY_MEDIUM } : { discard: true },
    });
    if (!conversion.isValid) {
      const why = conversion.discardedTracks.map((d) => d.reason).join(',');
      throw new StoryMediaError(why.includes('undecodable') ? 'cannot_decode' : 'failed', why);
    }
    const hasSound = conversion.utilizedTracks.some((t) => t.isAudioTrack());
    if (onProgress) conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)));
    await conversion.execute();
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer) throw new StoryMediaError('failed', 'empty output');
    const media = new Blob([buffer], { type: 'video/mp4' });
    if (media.size > STORY_MAX_BYTES) throw new StoryMediaError('too_big');
    return { kind: 'video', media, mediaType: 'video/mp4', poster, durationMs: Math.round(end * 1000), hasSound, width, height };
  } catch (e) {
    if (e instanceof StoryMediaError) throw e;
    throw new StoryMediaError('failed', e instanceof Error ? e.message : String(e));
  } finally {
    try { input.dispose(); } catch { /* already closed */ }
  }
}

/** A photo or a video, ready to upload. Throws StoryMediaError. */
export async function prepareStoryMedia(file: File, onProgress?: (p: number) => void): Promise<PreparedStoryMedia> {
  const type = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|avif)$/.test(name)) return preparePhoto(file);
  if (type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|3gp)$/.test(name)) return prepareVideo(file, onProgress);
  throw new StoryMediaError('unreadable', type || name);
}
