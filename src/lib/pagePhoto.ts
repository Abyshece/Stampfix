// Makes a header or profile photo for the Business page, in the shop's browser:
//   header:  at most 1600 px on the long side, the whole photo (the page crops
//            it to the banner);
//   profile: a 512 x 512 square from the middle.
// Both become JPEGs, so every phone shows them and they load fast.

import type { PagePhotoKind } from './businessPage';

export type PagePhotoPrepError = 'unreadable' | 'too_big' | 'failed';

export class PagePhotoPrepFailed extends Error {
  constructor(public code: PagePhotoPrepError) { super(code); }
}

const MAX_BYTES = 5 * 1024 * 1024;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new PagePhotoPrepFailed('failed'))), 'image/jpeg', quality));
}

/** A JPEG ready to upload. Throws PagePhotoPrepFailed. */
export async function preparePagePhoto(file: Blob, kind: PagePhotoKind): Promise<Blob> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PagePhotoPrepFailed('unreadable');
  }
  try {
    const c = document.createElement('canvas');
    const x = c.getContext('2d');
    if (!x) throw new PagePhotoPrepFailed('failed');
    if (kind === 'avatar') {
      const side = Math.min(bmp.width, bmp.height);
      const size = Math.min(512, side);
      c.width = size; c.height = size;
      x.fillStyle = '#FFFFFF';
      x.fillRect(0, 0, size, size);
      x.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
    } else {
      const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      x.drawImage(bmp, 0, 0, c.width, c.height);
    }
    const out = await toJpeg(c, kind === 'avatar' ? 0.88 : 0.85);
    if (out.size > MAX_BYTES) throw new PagePhotoPrepFailed('too_big');
    return out;
  } finally {
    bmp.close();
  }
}
