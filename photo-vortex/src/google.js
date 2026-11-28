import { CONFIG } from './config.js';
import { makePhoto } from './photos.js';

// Google sign-in (Google Identity Services) and the Google Photos Picker API.
//
// Since March 2025 Google no longer lets apps read a user's whole library. Instead the
// user picks photos in Google's own picker window, and the app reads only those.
// https://developers.google.com/photos/picker/guides/get-started-picker

const PICKER = 'https://photospicker.googleapis.com/v1';
const PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const SCOPES = `openid email profile ${PHOTOS_SCOPE}`;

let token = null;
let tokenExpires = 0;
let gis = null;
let relayOk = null; // null = untested, true/false once we know

export const isConfigured = () => Boolean(CONFIG.googleClientId) && !CONFIG.preview;
export const hasToken = () => Boolean(token) && Date.now() < tokenExpires;

export class AuthError extends Error {}

export function preloadGis() {
  if (gis) return gis;
  gis = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gis = null; reject(new Error('Google sign-in could not load. Check your connection or any content blocker, then try again.')); };
    document.head.append(s);
  });
  return gis;
}

// Must be called straight from a click so the browser allows Google's popup.
export function signIn() {
  if (!window.google?.accounts?.oauth2) return preloadGis().then(requestToken);
  return requestToken();
}

function requestToken() {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: SCOPES,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(r, PHOTOS_SCOPE)) {
          return reject(new Error('Google Photos access was not allowed. Sign in again and tick the Google Photos box.'));
        }
        token = r.access_token;
        tokenExpires = Date.now() + (Number(r.expires_in || 3600) - 60) * 1000;
        resolve();
      },
      error_callback: (e) => reject(new Error(
        e?.type === 'popup_closed' ? 'The Google window was closed before sign-in finished.'
          : e?.type === 'popup_failed_to_open' ? 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
            : e?.message || 'Google sign-in did not finish.',
      )),
    });
    client.requestAccessToken();
  });
}

export async function getUser() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return { name: u.name || u.email || 'Google user', picture: u.picture || '' };
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token, () => {});
  token = null;
  tokenExpires = 0;
}

const relayUrl = (u) => `${CONFIG.proxyPath}?u=${encodeURIComponent(u)}`;

async function call(url, opts = {}) {
  if (!hasToken()) throw new AuthError('Your Google sign-in has expired. Connect again to continue.');
  const init = {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body,
    signal: opts.signal,
  };
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    res = await fetch(relayUrl(url), init); // the API blocked the browser (CORS): go through our relay
  }
  if (res.status === 401) throw new AuthError('Your Google sign-in has expired. Connect again to continue.');
  if (!res.ok) {
    let msg = `Google Photos said no (${res.status}).`;
    try { const j = await res.json(); if (j?.error?.message) msg = j.error.message; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

const ms = (d, fallback) => {
  const n = parseFloat(String(d || ''));
  return Number.isFinite(n) ? n * 1000 : fallback;
};

const sleep = (t, signal) => new Promise((resolve, reject) => {
  const id = setTimeout(resolve, t);
  signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
});

export const createSession = () => call(`${PICKER}/sessions`, { method: 'POST', body: '{}' });

export function deleteSession(id) {
  if (!id || !hasToken()) return;
  call(`${PICKER}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
}

// Poll until the user presses Done in the picker window.
export async function waitForSelection(session, signal) {
  let s = session;
  const started = Date.now();
  const timeout = ms(s.pollingConfig?.timeoutIn, 30 * 60e3);
  while (!s.mediaItemsSet) {
    await sleep(Math.max(1000, ms(s.pollingConfig?.pollInterval, 3000)), signal);
    s = await call(`${PICKER}/sessions/${encodeURIComponent(session.id)}`, { signal });
    if (Date.now() - started > timeout) throw new Error('The Google Photos picker timed out. Please try again.');
  }
  return s;
}

export async function listMediaItems(sessionId, onCount) {
  const out = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ sessionId, pageSize: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await call(`${PICKER}/mediaItems?${q}`);
    out.push(...(r.mediaItems || []));
    onCount?.(out.length);
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return out;
}

// Photo bytes need the access token, and Google's photo servers don't allow
// browser requests, so they go through the same-origin relay when it is there.
async function fetchMedia(url) {
  const headers = { Authorization: `Bearer ${token}` };
  if (relayOk !== false) {
    try {
      const r = await fetch(relayUrl(url), { headers });
      if (r.headers.get('x-pv-relay')) {
        relayOk = true;
        if (r.status === 401) throw new AuthError('Your Google sign-in has expired. Connect again to continue.');
        if (!r.ok) throw new Error(`photo ${r.status}`);
        return r.blob();
      }
      relayOk = false;
    } catch (e) {
      if (e instanceof AuthError || relayOk) throw e;
      relayOk = false;
    }
  }
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`photo ${r.status}`);
  return r.blob();
}

const fullCache = new Map(); // keep the most recent full-size photos in memory
function remember(key, url) {
  fullCache.set(key, url);
  while (fullCache.size > 40) {
    const [k, u] = fullCache.entries().next().value;
    URL.revokeObjectURL(u);
    fullCache.delete(k);
  }
}

export function toPhotos(items) {
  return items
    .filter((it) => it?.mediaFile?.baseUrl)
    .map((it) => {
      const f = it.mediaFile;
      const m = f.mediaFileMetadata || {};
      const w = Number(m.width) || 0;
      const h = Number(m.height) || 0;
      const base = f.baseUrl;
      let thumb = null;
      return makePhoto({
        id: it.id,
        date: new Date(it.createTime || Date.now()),
        name: f.filename || 'Photo',
        aspect: w && h ? w / h : 4 / 3,
        aspectKnown: Boolean(w && h),
        isVideo: it.type === 'VIDEO',
        source: 'google',
        thumbSrc: () => (thumb ||= fetchMedia(`${base}=w400-h400`).then((b) => URL.createObjectURL(b))),
        fullSrc: async () => {
          if (fullCache.has(it.id)) return fullCache.get(it.id);
          const u = URL.createObjectURL(await fetchMedia(`${base}=w2048-h2048`));
          remember(it.id, u);
          return u;
        },
      });
    });
}
