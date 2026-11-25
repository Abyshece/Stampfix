// Our own website statistics (Admin > Website insights).
//
// Runs only when all of this is true:
//   - the visitor allowed "Website statistics" in the cookie banner;
//   - the page is part of the public website (pages register themselves with
//     useSiteInsightsPage: the landing page, marketing and legal pages, the
//     signup form) and is shown on stampfix.app, not inside a frame;
//   - this browser isn't ours (it opened the admin panel) or a shop's (a
//     Stampfix shop signed in here).
// It keeps a random visitor id (13 months) and the current visit (30 minutes
// without activity) in localStorage, and sends to our own database
// (site_track): which pages were seen, for how long, how far down, what was
// clicked (button and link text, and where on the page), the feature video,
// form steps (never what's typed), rage and dead clicks. No names, no form
// contents, no IP address. Withdrawing consent stops it and forgets the ids.

import { useEffect } from 'react';
import { getCookieConsent } from './cookieConsent';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const VISITOR = 'sf_ins_visitor';
const SESSION = 'sf_ins_session';
/** '1': this browser isn't counted (it opened the admin panel); '0': counted on purpose. */
export const INSIGHTS_IGNORE = 'sf_ins_ignore';
/** '1': a Stampfix shop signed in on this browser: not a visitor we count. */
const SHOP = 'sf_ins_shop';
const HOSTS = ['stampfix.app', 'www.stampfix.app'];
const GAP = 30 * 60_000;              // a visit ends after 30 minutes without activity
const VISITOR_TTL = 395 * 86_400_000;  // 13 months
const IDLE = 5 * 60_000;               // no mouse, key, scroll or touch for 5 minutes: not engaged
const MAX_VIEW = 30 * 60_000;
const FLUSH_EVERY = 15_000;
const PATH_OK = /^\/[A-Za-z0-9/_.~%-]{0,199}$/;

type Source = 'direct' | 'search' | 'social' | 'referral' | 'email' | 'campaign';
type Device = 'mobile' | 'tablet' | 'desktop';
type Session = {
  id: string; start: number; last: number; seq: number; land: string; isNew: boolean;
  src: Source; ref: string | null; us: string | null; um: string | null; uc: string | null; dev: Device; lang: string | null;
};
type Section = { el: Element; v: number; m: number };
type Page = {
  id: string; path: string; seq: number; start: number; lastTick: number;
  engaged: number; visible: number; scroll: number; height: number; actions: number; clicks: number; events: number;
  sections: Section[]; forms: Map<string, number>; videos: WeakMap<HTMLMediaElement, Set<number>>;
};
type Ev = { id: string; pv: string; k: string; l?: string | null; href?: string | null; sel?: string | null; rx?: number; ry?: number; fx?: number; fy?: number; n?: number; i?: boolean };
type TestHooks = { endpoint?: string };

let wanted: string | null = null;
let page: Page | null = null;
let session: Session | null = null;
let visitor: { id: string; isNew: boolean } | null = null;
let queue: Ev[] = [];
let ended: ReturnType<typeof pvPayload>[] = [];
let timer = 0;
let leaveTimer = 0;
let lastFlush = 0;
let lastInput = Date.now();
let inited = false;
let listening = false;

const test = (): TestHooks | null => (typeof window !== 'undefined' ? (window as unknown as { __SF_INSIGHTS_TEST__?: TestHooks }).__SF_INSIGHTS_TEST__ ?? null : null);
const endpoint = () => test()?.endpoint ?? (SUPA_URL ? `${SUPA_URL}/rest/v1/rpc/site_track` : null);
const store = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not kept */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* nothing */ } },
};
const uuid = (): string => {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch { /* below */ }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const norm = (s: string | null | undefined, n = 80) => { const t = (s ?? '').replace(/\s+/g, ' ').trim(); return t ? t.slice(0, n) : null; };

function allowed(): boolean {
  if (typeof window === 'undefined' || !endpoint()) return false;
  if (!test()) {
    if (!HOSTS.includes(location.hostname) || navigator.webdriver) return false;
  }
  if (window.top !== window) return false;
  if (!getCookieConsent()?.analytics) return false;
  try { if (localStorage.getItem(INSIGHTS_IGNORE) === '1' || localStorage.getItem(SHOP) === '1') return false; } catch { return false; }
  return true;
}

// ---- Where the visit came from -------------------------------------------------------------

const isHost = (h: string, list: string[]) => list.some((d) => h === d || h.endsWith(`.${d}`));
const SOCIAL = ['facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'lnkd.in', 'twitter.com', 't.co', 'x.com', 'pinterest.com', 'reddit.com', 'tiktok.com', 'youtube.com', 'whatsapp.com', 'threads.net'];
const SEARCH = ['bing.com', 'duckduckgo.com', 'search.yahoo.com', 'ecosia.org', 'baidu.com', 'startpage.com', 'qwant.com', 'search.brave.com', 'yandex.ru', 'yandex.com'];
const SOCIAL_UTM = /^(facebook|fb|instagram|ig|linkedin|twitter|x|tiktok|pinterest|reddit|youtube|threads)$/i;

function origin(): Pick<Session, 'src' | 'ref' | 'us' | 'um' | 'uc'> {
  const q = new URLSearchParams(location.search);
  const us = norm(q.get('utm_source')), um = norm(q.get('utm_medium')), uc = norm(q.get('utm_campaign'));
  let ref: string | null = null;
  try {
    if (document.referrer) {
      const h = new URL(document.referrer).hostname.toLowerCase();
      if (h && h !== location.hostname && !HOSTS.includes(h)) ref = h;
    }
  } catch { /* none */ }
  let src: Source = 'direct';
  if (/mail|newsletter/i.test(`${um ?? ''} ${us ?? ''}`)) src = 'email';
  else if (ref && (/(^|\.)google\.[a-z.]+$/.test(ref) || isHost(ref, SEARCH))) src = 'search';
  else if (ref && isHost(ref, SOCIAL)) src = 'social';
  else if (us || um || uc) src = us && SOCIAL_UTM.test(us) ? 'social' : 'campaign';
  else if (ref) src = 'referral';
  return { src, ref, us, um, uc };
}
function device(): Device {
  const w = window.innerWidth;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (w < 640) return 'mobile';
  if (w < 1024 || (coarse && w < 1280)) return 'tablet';
  return 'desktop';
}
function language(): string | null {
  let l = '';
  try { l = localStorage.getItem('i18nextLng') ?? ''; } catch { /* below */ }
  l = (l || navigator.language || '').toLowerCase();
  const m = /^([a-z]{2})(?:-([a-z]{2}))?/.exec(l);
  return m ? (m[2] ? `${m[1]}-${m[2]}` : m[1]) : null;
}

// ---- The visitor and the visit -------------------------------------------------------------

function loadVisitor() {
  const now = Date.now();
  const v = store.get<{ id: string; ts: number }>(VISITOR);
  if (v?.id && now - v.ts < VISITOR_TTL) return { id: v.id, isNew: false };
  const id = uuid();
  store.set(VISITOR, { id, ts: now });
  return { id, isNew: true };
}
function loadSession(path: string, newVisitor: boolean): Session {
  const now = Date.now();
  const s = store.get<Session>(SESSION);
  if (s?.id && now - s.last < GAP) return s;
  return { id: uuid(), start: now, last: now, seq: 0, land: path, isNew: newVisitor, ...origin(), dev: device(), lang: language() };
}
const saveSession = () => { if (session) store.set(SESSION, session); };

// ---- One page ----------------------------------------------------------------------------------

function begin(path: string) {
  if (!allowed()) return;
  listen();
  const now = Date.now();
  visitor = loadVisitor();
  session = loadSession(path, visitor.isNew);
  session.seq += 1;
  session.last = now;
  saveSession();
  page = {
    id: uuid(), path, seq: session.seq, start: now, lastTick: now,
    engaged: 0, visible: 0, scroll: 0, height: 0, actions: 0, clicks: 0, events: 0,
    sections: [], forms: new Map(), videos: new WeakMap(),
  };
  lastInput = now;
  lastFlush = now - FLUSH_EVERY + 5000; // the first message goes after 5 seconds
  timer = window.setInterval(tick, 1000);
  const p = page;
  // Lazy parts of the page appear after a moment: measure then, and again later.
  window.setTimeout(() => { if (page === p) { scanSections(); measureScroll(); } }, 1500);
  window.setTimeout(() => { if (page === p) scanSections(); }, 5000);
}

function end() {
  if (!page) return;
  tick();
  measureScroll();
  ended.push(pvPayload(page));
  window.clearInterval(timer);
  timer = 0;
  page = null;
  flush();
}

function tick() {
  if (!page || !session) return;
  const now = Date.now();
  const dt = Math.min(Math.max(0, now - page.lastTick), 2000);
  page.lastTick = now;
  if (document.visibilityState === 'visible') {
    // Scrolling is measured as it happens, and once a second too (in case a frame was skipped).
    if (now - page.start > 1500) measureScroll();
    page.visible = Math.min(MAX_VIEW, page.visible + dt);
    for (const s of page.sections) if (inView(s.el)) s.v = Math.min(MAX_VIEW, s.v + dt);
    if (document.hasFocus() && now - lastInput < IDLE) {
      page.engaged = Math.min(MAX_VIEW, page.engaged + dt);
      session.last = now;
    }
  }
  if (now - lastFlush >= FLUSH_EVERY) flush();
}

function inView(el: Element) {
  const r = el.getBoundingClientRect();
  const h = window.innerHeight;
  const vis = Math.min(r.bottom, h) - Math.max(r.top, 0);
  return vis > 0 && (vis >= r.height * 0.5 || vis >= h * 0.5);
}
function measureScroll() {
  if (!page) return;
  const docH = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0);
  const vh = window.innerHeight;
  const bottom = window.scrollY + vh;
  const pct = docH <= vh + 2 || bottom >= docH - 2 ? 100 : Math.round((bottom / docH) * 100);
  page.scroll = Math.max(page.scroll, Math.min(100, Math.max(0, pct)));
  page.height = docH;
}

// The page's top-level sections (for "which parts get attention").
function scanSections() {
  if (!page) return;
  const all = [...document.querySelectorAll('section, [data-insight-section]')];
  const top = all.filter((el) => !el.parentElement?.closest('section, [data-insight-section]') && !el.closest('[data-insight-ignore]'));
  for (const el of top) {
    if (page.sections.length >= 40) break;
    if (!page.sections.some((s) => s.el === el)) page.sections.push({ el, v: 0, m: 0 });
  }
}
function sectionsOf(p: Page) {
  const live = p.sections.filter((s) => s.el.isConnected);
  live.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return live.map((s, i) => ({
    k: s.el.id && /^[A-Za-z][\w-]{0,30}$/.test(s.el.id) ? `#${s.el.id}` : `s${i + 1}`,
    h: norm(s.el.querySelector('h1, h2, h3')?.textContent, 80),
    v: Math.round(s.v), m: Math.round(s.m),
  }));
}
function pvPayload(p: Page) {
  return { id: p.id, seq: p.seq, path: p.path, e: Math.round(p.engaged), vis: Math.round(p.visible), sc: p.scroll, a: p.actions,
    h: p.height || undefined, w: window.innerWidth, sec: sectionsOf(p) };
}

// ---- What happens on the page ----------------------------------------------------------------

function push(e: Omit<Ev, 'id' | 'pv'>): Ev | null {
  if (!page || page.events >= 400) return null;
  page.events += 1;
  const ev: Ev = { id: uuid(), pv: page.id, ...e };
  queue.push(ev);
  return ev;
}

const INTERACTIVE = 'a[href], button, [role="button"], [role="tab"], [role="link"], [role="switch"], [role="menuitem"], summary, input, select, textarea, label, [data-insight]';
const FIELD = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea, label';

/** Where an element is on the page, as a CSS path the heatmap can find again. */
export function selectorOf(el: Element): string {
  const parts: string[] = [];
  let n: Element | null = el;
  let anchored = false;
  while (n && n !== document.body && n !== document.documentElement && parts.length < 14) {
    const tag = n.tagName.toLowerCase();
    if (n.id && /^[A-Za-z][\w-]{0,40}$/.test(n.id)) { parts.unshift(`${tag}#${n.id}`); anchored = true; break; }
    const parent: Element | null = n.parentElement;
    let part = tag;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === n!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(n) + 1})`;
    }
    parts.unshift(part);
    n = parent;
  }
  if (!anchored && n === document.body) parts.unshift('body');
  let sel = parts.join('>');
  while (sel.length > 300 && parts.length > 1) { parts.shift(); sel = parts.join('>'); }
  return sel;
}
function labelOf(el: Element): string | null {
  return norm(el.getAttribute('data-insight')) ?? norm(el.getAttribute('aria-label')) ?? norm(el.textContent)
    ?? norm(el.getAttribute('title')) ?? norm(el.querySelector('img')?.getAttribute('alt'));
}
function hrefOf(el: Element): string | null {
  if (!(el instanceof HTMLAnchorElement) || !el.href) return null;
  try {
    const u = new URL(el.href);
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') return u.protocol.slice(0, -1);
    return u.host === location.host ? `${u.pathname}${u.search}`.slice(0, 200) : u.host;
  } catch { return null; }
}
const fileOf = (src: string) => { try { return new URL(src, location.href).pathname.split('/').pop() || null; } catch { return null; } };

let burst: { t: number; x: number; y: number }[] = [];
let rageEv: Ev | null = null;
let deadCheck: { el: Element; cancel: () => void } | null = null;

function onClick(e: MouseEvent) {
  if (!page) return;
  const raw = e.target as Node | null;
  const target = raw instanceof Element ? raw : raw?.parentElement ?? null;
  if (!target || target.closest('[data-insight-ignore]')) return;
  const hit = target.closest(INTERACTIVE);
  const field = !!hit && hit.matches(FIELD);
  const action = !!hit && !field;
  if (action) page.actions += 1;
  // A keyboard "click" (Enter on a button) has no position.
  const pointer = e.detail > 0;
  const docW = Math.max(document.documentElement.scrollWidth, 1), docH = Math.max(document.documentElement.scrollHeight, 1);
  const px = e.clientX + window.scrollX, py = e.clientY + window.scrollY;
  const r = target.getBoundingClientRect();
  const pos = pointer ? {
    rx: r.width ? (e.clientX - r.left) / r.width : 0.5, ry: r.height ? (e.clientY - r.top) / r.height : 0.5,
    fx: px / docW, fy: py / docH,
  } : {};
  if (page.clicks < 300) {
    page.clicks += 1;
    push({ k: 'click', l: action ? labelOf(hit!) : null, href: action ? hrefOf(hit!) : null, sel: selectorOf(target), i: action, ...pos });
  }
  if (pointer) rage(target, px, py, pos);
  dead(target, hit, field, pos);
}

// Rage clicks: 3 or more clicks within a second, close together.
function rage(target: Element, x: number, y: number, pos: object) {
  const now = Date.now();
  if (burst.length && now - burst[burst.length - 1].t > 1000) { burst = []; rageEv = null; }
  burst = burst.filter((b) => now - b.t < 1000);
  burst.push({ t: now, x, y });
  const near = burst.filter((b) => Math.hypot(b.x - x, b.y - y) <= 30).length;
  if (near < 3) return;
  if (rageEv && queue.includes(rageEv)) rageEv.n = Math.max(rageEv.n ?? 3, near);
  else if (!rageEv) rageEv = push({ k: 'rage', l: norm(target.textContent, 60), sel: selectorOf(target), n: near, ...pos });
}

// Dead clicks: something that looks clickable, and nothing happens within a second.
function dead(target: Element, hit: Element | null, field: boolean, pos: object) {
  if (field || target.closest('video, audio, canvas, iframe, [data-insight-nodead]')) return;
  if (hit instanceof HTMLAnchorElement && hit.getAttribute('href')) return; // a link goes somewhere
  const looks = !!hit || getComputedStyle(target).cursor === 'pointer';
  if (!looks) return;
  if (deadCheck && deadCheck.el === target) return;
  deadCheck?.cancel();
  const url = location.href, y = window.scrollY;
  let changed = false;
  const scope = target.closest('section, [data-insight-section], main') ?? document.body;
  const mo = new MutationObserver(() => { changed = true; });
  mo.observe(scope, { subtree: true, childList: true, attributes: true, characterData: true });
  const top = new MutationObserver(() => { changed = true; });
  top.observe(document.body, { childList: true });
  const p = page;
  const t = window.setTimeout(() => {
    mo.disconnect(); top.disconnect(); deadCheck = null;
    if (page === p && !changed && location.href === url && Math.abs(window.scrollY - y) < 2) {
      push({ k: 'dead', l: norm((hit ?? target).textContent, 60), sel: selectorOf(target), ...pos });
    }
  }, 1000);
  deadCheck = { el: target, cancel: () => { window.clearTimeout(t); mo.disconnect(); top.disconnect(); deadCheck = null; } };
}

function onMedia(e: Event) {
  if (!page || !(e.target instanceof HTMLVideoElement)) return;
  const v = e.target;
  let marks = page.videos.get(v);
  if (!marks) { marks = new Set(); page.videos.set(v, marks); }
  const label = fileOf(v.currentSrc || v.querySelector('source')?.getAttribute('src') || '') ?? norm(v.getAttribute('aria-label'));
  const mark = (n: number) => { if (!marks!.has(n)) { marks!.add(n); push({ k: 'video', l: label, n }); } };
  if (e.type === 'play') mark(0);
  else if (e.type === 'ended') { mark(0); [25, 50, 75, 100].forEach(mark); }
  else if (Number.isFinite(v.duration) && v.duration > 0) {
    const pct = (v.currentTime / v.duration) * 100;
    [25, 50, 75].forEach((n) => { if (pct >= n) mark(n); });
    if (pct >= 99) mark(100);
  }
}

function onFocusIn(e: FocusEvent) {
  if (!page || !(e.target instanceof Element) || !e.target.matches('input, select, textarea')) return;
  const form = e.target.closest('[data-insight-form]');
  const name = form?.getAttribute('data-insight-form');
  if (!name || page.forms.has(name)) return;
  page.forms.set(name, Date.now());
  push({ k: 'form_start', l: name });
}

/** A form (marked data-insight-form="name") was sent ('submit') or went through ('done'). */
export function siteInsightsForm(name: string, step: 'submit' | 'done'): void {
  if (!page) return;
  if (step === 'submit') { push({ k: 'form_submit', l: name }); return; }
  const started = page.forms.get(name);
  push({ k: 'form_done', l: name, ...(started ? { n: Date.now() - started } : {}) });
  flush();
}

let lastMove = 0;
let lastSection: Section | null = null;
function onMove(e: MouseEvent) {
  lastInput = Date.now();
  if (!page) return;
  const now = lastInput;
  if (now - lastMove < 100) return;
  if (lastSection && now - lastMove < 1000) lastSection.m = Math.min(MAX_VIEW, lastSection.m + (now - lastMove));
  lastMove = now;
  const t = e.target instanceof Element ? e.target : null;
  lastSection = t ? page.sections.find((s) => s.el.contains(t)) ?? null : null;
}
let scrollQueued = false;
function onScroll() {
  lastInput = Date.now();
  if (!page || scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => { scrollQueued = false; measureScroll(); });
}
const onInput = () => { lastInput = Date.now(); };
function onHide() {
  if (document.visibilityState === 'hidden') { tick(); measureScroll(); flush(); }
  else if (page) page.lastTick = Date.now();
}
function onPageHide() { tick(); measureScroll(); flush(); }

function listen() {
  if (listening) return;
  listening = true;
  const o = { capture: true, passive: true } as const;
  window.addEventListener('click', onClick, true);
  window.addEventListener('mousemove', onMove, o);
  window.addEventListener('scroll', onScroll, o);
  for (const t of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(t, onInput, o);
  document.addEventListener('focusin', onFocusIn, true);
  for (const t of ['play', 'timeupdate', 'ended']) document.addEventListener(t, onMedia, true);
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
}

// ---- Sending ---------------------------------------------------------------------------------

function flush() {
  lastFlush = Date.now();
  if (!session || !visitor) return;
  const pv = [...ended, ...(page ? [pvPayload(page)] : [])].slice(-10);
  const ev = queue.splice(0, 80);
  ended = [];
  if (!pv.length && !ev.length) return;
  saveSession();
  const s = session;
  send({ p: {
    s: { id: s.id, v: visitor.id, new: s.isNew, land: s.land, src: s.src, ref: s.ref, us: s.us, um: s.um, uc: s.uc, dev: s.dev, lang: s.lang, d: Math.max(0, s.last - s.start) },
    pv, ev,
  } });
}
function send(body: unknown) {
  const url = endpoint();
  if (!url) return;
  const json = JSON.stringify(body);
  try {
    void fetch(url, {
      method: 'POST',
      keepalive: json.length < 60000,
      headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY ?? '', Authorization: `Bearer ${SUPA_KEY ?? ''}` },
      body: json,
    }).catch(() => { /* lost: statistics only */ });
  } catch { /* lost: statistics only */ }
}

// ---- Consent, and pages registering --------------------------------------------------------

function stopAndForget() {
  if (timer) window.clearInterval(timer);
  timer = 0; page = null; session = null; visitor = null; queue = []; ended = [];
  store.del(VISITOR);
  store.del(SESSION);
}
function onConsent() {
  if (!getCookieConsent()?.analytics) { stopAndForget(); return; }
  if (wanted && !page) begin(wanted);
}
function init() {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  window.addEventListener('sf-cookie-consent', onConsent);
  window.addEventListener('storage', (e) => { if (e.key === 'sf_cookie_consent_v1') onConsent(); });
}

export function cleanPath(path?: string | null): string | null {
  let p = (path ?? (typeof location !== 'undefined' ? location.pathname : '')).split(/[?#]/)[0].replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return PATH_OK.test(p) ? p : null;
}

function enter(path: string) {
  init();
  if (leaveTimer) { window.clearTimeout(leaveTimer); leaveTimer = 0; }
  if (page && page.path === path && wanted === path) return; // shown again right away (React's double effects)
  if (page) end();
  wanted = path;
  begin(path);
}
function leave(path: string) {
  if (wanted !== path) return;
  leaveTimer = window.setTimeout(() => { leaveTimer = 0; wanted = null; end(); }, 0);
}

/**
 * A public page registers itself while it shows (path: what to count it as,
 * else the address bar's path; null: not counted).
 */
export function useSiteInsightsPage(path?: string | null): void {
  useEffect(() => {
    if (path === null) return;
    const p = cleanPath(path);
    if (!p) return;
    enter(p);
    return () => leave(p);
  }, [path]);
}

// ---- Who isn't counted --------------------------------------------------------------------

/** The admin panel: this browser isn't counted, unless it was switched on on purpose. */
export function markAdminBrowser(): void {
  try { if (localStorage.getItem(INSIGHTS_IGNORE) === null) localStorage.setItem(INSIGHTS_IGNORE, '1'); } catch { /* fine */ }
  if (page) stopAndForget();
}
/** A Stampfix shop signed in on this browser: its visits aren't counted. */
export function markShopBrowser(): void {
  try { localStorage.setItem(SHOP, '1'); } catch { /* fine */ }
}
export const countingThisBrowser = (): boolean => { try { return localStorage.getItem(INSIGHTS_IGNORE) === '0'; } catch { return false; } };
export function setCountingThisBrowser(on: boolean): void {
  try { localStorage.setItem(INSIGHTS_IGNORE, on ? '0' : '1'); } catch { /* fine */ }
}
