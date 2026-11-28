// Photo Vortex settings.
//
// To turn on "Connect Google Photos", create an OAuth client (type: Web application)
// in Google Cloud, enable the Photos Picker API, and paste the client ID below.
// Step-by-step instructions are in README.md.

const preview = Boolean(globalThis.PV_PREVIEW); // true only in the claude.ai preview build
const small = typeof innerWidth === 'number' && Math.min(innerWidth, innerHeight) < 700;

export const CONFIG = {
  googleClientId: '', // e.g. '1234567890-abc123.apps.googleusercontent.com'

  // Same-origin relay that fetches photo bytes from Google (they can't be read from the
  // browser directly). Served by server.js locally and by api/google.js on Vercel.
  proxyPath: '/api/google',

  // How many photos go into the 3D world. Google's picker allows up to 2,000 per pick;
  // phones get fewer to keep GPU memory in check.
  maxPhotos: small ? 700 : 2000,
  thumbSize: small ? 256 : 320,
  compact: small,

  demoCount: small ? 600 : 1200,
  demoSource: preview ? 'local' : 'picsum', // 'local' reads demo/<id>.jpg next to the page
  preview,
};
