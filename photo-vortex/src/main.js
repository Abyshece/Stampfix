import { CONFIG } from './config.js';
import { Engine } from './engine.js';
import { PhotoStore, computeYears } from './photos.js';
import { makeDemoPhotos } from './demo.js';
import { TornadoWorld } from './worlds/tornado.js';
import { TunnelWorld } from './worlds/tunnel.js';
import { Viewer } from './viewer.js';
import { Ambience } from './audio.js';
import * as G from './google.js';

const $ = (s) => document.querySelector(s);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const WORLDS = { tornado: TornadoWorld, tunnel: TunnelWorld };

const state = {
  world: 'tornado',
  photos: [],
  years: [],
  source: 'demo',
  started: false,
  user: null,
  year: null,
  autoplay: !reducedMotion,
  sessionId: null,
  pick: null,
};

const engine = new Engine($('#stage'));
const store = new PhotoStore(engine.renderer);
const ambience = new Ambience();
const viewer = new Viewer($('#viewer'), {
  list: () => state.photos,
  getRect: (photo) => engine.screenRectOf(engine.world?.meshFor(photo)),
  colorOf: (photo) => state.years.find((y) => y.year === photo.year)?.color,
  onShow: (photo) => {
    const w = engine.world;
    if (w?.onViewerShow) w.onViewerShow(photo);
    else w?.focus(w.meshFor(photo));
  },
  onClose: () => {
    const w = engine.world;
    if (w?.onViewerClose) w.onViewerClose();
    else w?.unfocus();
    engine.targetTimeScale = 1;
  },
});

// ---- photos and worlds ---------------------------------------------------------

function setPhotos(photos, source) {
  photos.sort((a, b) => a.date - b.date);
  state.photos = photos;
  state.years = computeYears(photos);
  state.source = source;
  store.setPhotos(photos, state.years);
  mountWorld(state.world);
  renderRail();
  renderSource();
}

function loadOrder() {
  // Load what the world shows first: the newest photos sit at the top of the tornado,
  // the oldest at the start of the tunnel.
  return state.world === 'tornado' ? state.photos.slice().reverse() : state.photos;
}

function mountWorld(name) {
  const W = WORLDS[name];
  const w = new W(state.photos, state.years, {
    reducedMotion,
    store,
    compact: CONFIG.compact,
    onMode: () => updateHud(),
    onFocus: (photo) => showFocusBar(photo),
    onOpen: (photo, mesh) => openViewer(photo, mesh),
  });
  showFocusBar(null);
  w.autoplay = state.autoplay;
  engine.setWorld(w);
  if (state.started) w.begin();
  store.prioritize(w.priorityOrder ? w.priorityOrder() : loadOrder());
  ambience.setWorld(name);
  state.year = null;
  updateHud();
}

let switching = false;
async function switchWorld(name) {
  if (name === state.world || switching) return;
  switching = true;
  document.querySelectorAll('[data-world]').forEach((b) => {
    const on = b.dataset.world === name;
    b.classList.toggle('is-on', on);
    b.setAttribute(b.getAttribute('role') === 'tab' ? 'aria-selected' : 'aria-checked', String(on));
  });
  $('#fade').classList.add('is-on');
  await wait(380);
  state.world = name;
  mountWorld(name);
  await wait(60);
  $('#fade').classList.remove('is-on');
  switching = false;
}

function start() {
  if (state.started) return;
  state.started = true;
  $('#intro').classList.add('is-leaving');
  setTimeout(() => { $('#intro').hidden = true; }, 700);
  $('#hudTop').hidden = false;
  $('#rail').hidden = false;
  $('#hint').hidden = false;
  engine.targetShift = 0;
  engine.world?.begin();
  updateHud();
  quietHintLater();
}

// ---- HUD ---------------------------------------------------------------------------

function renderRail() {
  $('#rail').innerHTML = state.years.slice().reverse().map((y) =>
    `<button class="yr" type="button" data-year="${y.year}" style="--c:${y.color}" aria-label="Go to ${y.year}, ${y.count} photos"><i></i><span>${y.year}</span><em>${y.count}</em></button>`,
  ).join('');
  state.year = null;
}

function renderSource() {
  const label = $('#sourceLabel');
  const av = $('#avatar');
  if (state.source === 'google') {
    label.textContent = `${state.photos.length} from Google Photos`;
    av.hidden = !state.user?.picture;
    if (state.user?.picture) av.src = state.user.picture;
  } else {
    label.textContent = 'Sample photos';
    av.hidden = true;
  }
  $('#sourceIcon').hidden = !av.hidden;
  $('#btnSource').setAttribute('aria-label', label.textContent);
}

function updateHud() {
  const w = engine.world;
  if (!w) return;
  const tornado = state.world === 'tornado';
  const eye = $('#btnEye');
  eye.hidden = !tornado;
  eye.classList.toggle('is-on', Boolean(w.inEye));
  eye.querySelector('span').textContent = w.inEye ? 'Step outside' : 'Step inside';
  const play = $('#btnPlay');
  play.setAttribute('aria-pressed', String(state.autoplay));
  play.setAttribute('aria-label', state.autoplay ? 'Pause the movie' : 'Play the movie');
  const hints = tornado
    ? (w.focusT
      ? ['Arrow keys move along the wall', 'Scroll in to open the photo', 'Scroll out to step back']
      : w.inEye
        ? ['You are inside the wall', 'Drag to look around', 'Scroll to ride the pole through time']
        : coarse
          ? ['Swipe up to descend through the years', 'Pinch to zoom', 'Tap any photo']
          : ['Scroll to descend through the years', 'Drag to circle', 'Pinch or Ctrl+scroll to zoom', 'Click any photo'])
    : ['Scroll to fly faster or back up', 'Move to steer your gaze', 'Click a photo or a year gate'];
  $('#hint').innerHTML = hints.map((h) => `<span>${h}</span>`).join('');
  showHint();
}

let hintTimer = 0;
function showHint() {
  $('#hint').classList.remove('is-quiet');
  quietHintLater();
}
function quietHintLater() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => $('#hint').classList.add('is-quiet'), 9000);
}

let badgeTimer = 0;
function onYearChange(year) {
  document.querySelectorAll('.yr').forEach((b) => b.classList.toggle('is-now', Number(b.dataset.year) === year));
  const now = document.querySelector('.yr.is-now');
  now?.scrollIntoView({ block: 'nearest' });
  if (!state.started || year == null) return;
  const badge = $('#yearBadge');
  badge.textContent = year;
  badge.style.setProperty('--c', state.years.find((y) => y.year === year)?.color || '#fff');
  badge.classList.add('is-on');
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => badge.classList.remove('is-on'), 2600);
}

let lastFlash = 0;
engine.onFrame = () => {
  store.tick();
  const w = engine.world;
  if (!w) return;
  const f = (w.flash || 0) * 0.22;
  if (Math.abs(f - lastFlash) > 0.003) { $('#flash').style.opacity = f.toFixed(3); lastFlash = f; }
  const y = w.currentYear();
  if (y !== state.year) { state.year = y; onYearChange(y); }
  ambience.setSpeed(w.speed());
};

setInterval(() => {
  const w = engine.world;
  if (w?.priorityOrder && store.atlasQueue.length) store.prioritize(w.priorityOrder());
}, 900);

store.onProgress = (done, total) => {
  const p = $('#progress');
  p.querySelector('i').style.width = `${(done / Math.max(1, total)) * 100}%`;
  p.classList.toggle('is-done', done >= total);
};

function toast(msg, ms = 4200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}

// ---- input on the 3D stage ---------------------------------------------------------

const stage = $('#stage');
let down = null;
let hoverQueued = false;
let lastPointer = null;

const touches = new Map();
let pinch = 0;
const pinchDist = () => {
  const p = [...touches.values()];
  return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
};

stage.addEventListener('pointerdown', (e) => {
  if (viewer.isOpen) return;
  stage.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { pinch = pinchDist(); down = null; return; }
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, type: e.pointerType };
});

stage.addEventListener('pointermove', (e) => {
  lastPointer = e;
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size >= 2) {
    const d = pinchDist();
    if (pinch && d && state.started) engine.world?.onZoom?.(d / pinch);
    pinch = d;
    return;
  }
  if (down && e.pointerId === down.id) {
    const dx = e.clientX - down.lx;
    const dy = e.clientY - down.ly;
    down.lx = e.clientX;
    down.ly = e.clientY;
    down.moved += Math.abs(dx) + Math.abs(dy);
    if (down.moved > 6) {
      stage.classList.add('is-grabbing');
      if (state.started) engine.world?.onDrag(dx, dy, down.type);
    }
    return;
  }
  if (e.pointerType === 'mouse' && state.started) {
    engine.world?.onPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  }
  if (!hoverQueued) {
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      if (!state.started || viewer.isOpen || down || !lastPointer || lastPointer.pointerType !== 'mouse') return;
      const hit = engine.pick(lastPointer.clientX, lastPointer.clientY);
      engine.world?.setHover(hit);
      stage.classList.toggle('is-pointing', Boolean(hit));
    });
  }
});

function endPointer(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = 0;
  if (!down || e.pointerId !== down.id) return;
  const click = down.moved <= 6;
  down = null;
  stage.classList.remove('is-grabbing');
  if (click && e.type === 'pointerup') onStageClick(e.clientX, e.clientY);
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

function openViewer(photo, mesh) {
  if (!photo || viewer.isOpen) return;
  engine.targetTimeScale = 0.25;
  viewer.open(photo, engine.screenRectOf(mesh));
}

function showFocusBar(photo) {
  const bar = $('#focusBar');
  if (!photo) { bar.hidden = true; updateHud(); return; }
  bar.querySelector('.fb-date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(photo.date);
  bar.querySelector('.fb-meta').textContent = photo.name;
  bar.style.setProperty('--c', state.years.find((y) => y.year === photo.year)?.color || '#fff');
  bar.hidden = false;
  updateHud();
}

function onStageClick(x, y) {
  if (!state.started) return;
  const hit = engine.pick(x, y);
  if (!hit) return;
  const w = engine.world;
  const kind = hit.userData.kind;
  if (kind === 'photo') {
    w.setHover(null);
    openViewer(hit.userData.photo, hit);
    w.focus(hit);
  } else if (kind === 'tile') {
    w.setHover(null);
    w.focusTile(hit.userData.i);
    updateHud();
  } else if (kind === 'hero') {
    openViewer(hit.userData.photo, hit);
  } else if (kind === 'year') {
    w.onYearClick(hit.userData.year);
    updateHud();
  } else if (kind === 'restart') {
    w.onRestart?.();
  }
}

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!state.started || viewer.isOpen) return;
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  engine.world?.onWheel(Math.max(-240, Math.min(240, d)), e.ctrlKey);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !state.started || viewer.isOpen || !$('#sheet').hidden) return;
  if (e.target.closest?.('input, textarea')) return;
  const w = engine.world;
  if (w.focusT) {
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (steps[e.key]) { w.step(...steps[e.key]); e.preventDefault(); return; }
    if (e.key === 'Escape') { w.unfocus(); e.preventDefault(); return; }
    if (e.key === 'Enter') { w.openHero(); e.preventDefault(); return; }
  }
  if (e.key === 'ArrowDown' || e.key === 'PageDown') w.onWheel(160);
  else if (e.key === 'ArrowUp' || e.key === 'PageUp') w.onWheel(-160);
  else if (e.key === 'ArrowLeft') w.onDrag(-60, 0);
  else if (e.key === 'ArrowRight') w.onDrag(60, 0);
  else if (e.key === ' ' && e.target === document.body) togglePlay();
  else if (e.key === 'e' && state.world === 'tornado') { w.setEye(!w.inEye); updateHud(); }
  else if (e.key === '1') switchWorld('tornado');
  else if (e.key === '2') switchWorld('tunnel');
  else return;
  e.preventDefault();
});

// ---- buttons ---------------------------------------------------------------------------

function togglePlay() {
  state.autoplay = !state.autoplay;
  if (engine.world) engine.world.autoplay = state.autoplay;
  updateHud();
}

document.querySelectorAll('[data-world]').forEach((b) => b.addEventListener('click', () => switchWorld(b.dataset.world)));
$('#rail').addEventListener('click', (e) => {
  const b = e.target.closest('.yr');
  if (b) engine.world?.flyToYear(Number(b.dataset.year));
});
$('#btnEye').addEventListener('click', () => {
  const w = engine.world;
  if (w?.setEye) { w.setEye(!w.inEye); updateHud(); }
});
$('#btnPlay').addEventListener('click', togglePlay);
$('#fbOpen').addEventListener('click', () => engine.world?.openHero?.());
$('#fbBack').addEventListener('click', () => engine.world?.unfocus?.());
$('#fbPrev').addEventListener('click', () => engine.world?.step?.(-1, 0));
$('#fbNext').addEventListener('click', () => engine.world?.step?.(1, 0));
$('#btnSound').addEventListener('click', async () => {
  const on = await ambience.toggle();
  $('#btnSound').setAttribute('aria-pressed', String(on));
  $('#btnSound').setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
});
$('#btnDemo').addEventListener('click', start);
$('#btnGoogle').addEventListener('click', connectGoogle);
$('#btnSource').addEventListener('click', () => openSheet('source'));

// ---- Google Photos flow ----------------------------------------------------------------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function openSheet(kind, data = {}) {
  const card = $('#sheetCard');
  const origin = esc(location.origin);
  const who = state.user
    ? `<div class="who">${state.user.picture ? `<img src="${esc(state.user.picture)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(state.user.name)}</b><span>Signed in with Google</span></div></div>`
    : '';
  const views = {
    preview: `
      <h2 id="sheetTitle">Google sign-in lives on the full site</h2>
      <p>This preview runs on sample photos only, because it can't open Google's sign-in window. Run Photo Vortex from its folder (see the README) to connect your own Google Photos.</p>
      <div class="sheet-actions"><button class="btn primary small" data-do="demo">Explore the samples</button></div>`,
    setup: `
      <h2 id="sheetTitle">One step before Google Photos works</h2>
      <p>This copy of Photo Vortex doesn't have a Google sign-in key yet. Whoever runs the site adds it once:</p>
      <ol>
        <li>In Google Cloud, turn on the <b>Photos Picker API</b>.</li>
        <li>Create an OAuth client of type <b>Web application</b> and add <code>${origin}</code> as an authorized JavaScript origin.</li>
        <li>Paste the client ID into <code>src/config.js</code> and reload.</li>
      </ol>
      <p>The README has the full walk-through.</p>
      <div class="sheet-actions"><button class="btn primary small" data-do="demo">Use sample photos for now</button><button class="btn ghost small" data-do="close">Close</button></div>`,
    busy: `<div class="spinner" aria-hidden="true"></div><h2 id="sheetTitle">${esc(data.title || 'One moment')}</h2><p>${esc(data.text || '')}</p>
      ${data.cancel ? '<div class="sheet-actions"><button class="btn ghost small" data-do="cancel">Cancel</button></div>' : ''}`,
    signed: `
      ${who}
      <h2 id="sheetTitle">Now choose your photos</h2>
      <p>Google opens its own Google Photos window. Select as many photos as you like, up to 2,000, then press <b>Done</b>. Photo Vortex only ever sees the ones you pick.</p>
      <div class="sheet-actions"><button class="btn primary small" data-do="choose">Choose photos</button><button class="btn ghost small" data-do="close">Not now</button></div>`,
    waiting: `
      <div class="spinner" aria-hidden="true"></div>
      <h2 id="sheetTitle">Pick your photos in the Google window</h2>
      <p>When you press Done there, your vortex starts building here.</p>
      <div class="sheet-actions"><button class="btn ghost small" data-do="reopen">Open the Google window again</button><button class="btn ghost small" data-do="cancel">Cancel</button></div>`,
    error: `
      <h2 id="sheetTitle">That didn't work</h2>
      <p>${esc(data.message || 'Something went wrong.')}</p>
      <div class="sheet-actions"><button class="btn primary small" data-do="${data.retry || 'connect'}">Try again</button><button class="btn ghost small" data-do="demo">Use sample photos</button></div>`,
    source: `
      ${who}
      <h2 id="sheetTitle">Your photos</h2>
      <p>${state.source === 'google'
        ? `You're looking at ${state.photos.length} photos you picked from Google Photos.`
        : 'You are looking at sample photos. Connect Google Photos to see your own.'}</p>
      <div class="sheet-actions">
        ${state.source === 'google' && G.hasToken()
          ? '<button class="btn primary small" data-do="choose">Pick different photos</button>'
          : '<button class="btn primary small" data-do="connect">Connect Google Photos</button>'}
        ${state.source === 'google' ? '<button class="btn ghost small" data-do="samples">Switch to sample photos</button>' : ''}
        <button class="btn ghost small" data-do="close">Close</button>
      </div>`,
  };
  card.innerHTML = views[kind];
  $('#sheet').hidden = false;
  card.querySelector('button')?.focus();
}

function closeSheet() { $('#sheet').hidden = true; }

$('#sheet').addEventListener('click', (e) => {
  if (e.target === $('#sheet')) { if (!state.pick) closeSheet(); return; }
  const act = e.target.closest('[data-do]')?.dataset.do;
  if (!act) return;
  if (act === 'close') closeSheet();
  if (act === 'demo') { closeSheet(); start(); }
  if (act === 'samples') { closeSheet(); setPhotos(makeDemoPhotos(), 'demo'); }
  if (act === 'connect') connectGoogle();
  if (act === 'choose') choosePhotos();
  if (act === 'reopen') openPicker();
  if (act === 'cancel') cancelPick();
});

async function connectGoogle() {
  if (CONFIG.preview) return openSheet('preview');
  if (!G.isConfigured()) return openSheet('setup');
  try {
    const signing = G.signIn(); // straight from the click, so the popup isn't blocked
    openSheet('busy', { title: 'Signing in with Google', text: 'Finish in the Google window that just opened.' });
    await signing;
    state.user = await G.getUser().catch(() => null);
    openSheet('signed');
  } catch (err) {
    openSheet('error', { message: err.message });
  }
}

function openPicker() {
  if (!state.pick?.uri) return;
  const w = window.open(state.pick.uri, 'pv-picker', 'popup,width=1040,height=780');
  if (!w) toast('Your browser blocked the Google window. Allow pop-ups for this site.');
}

async function choosePhotos() {
  if (!G.hasToken()) return connectGoogle();
  // Open the window now, inside the click, then point it at the picker once it exists.
  const popup = window.open('', 'pv-picker', 'popup,width=1040,height=780');
  const ac = new AbortController();
  state.pick = { ac, uri: null };
  openSheet('busy', { title: 'Opening Google Photos', text: 'Getting the picker ready.', cancel: true });
  try {
    const session = await G.createSession();
    state.sessionId = session.id;
    state.pick.uri = `${session.pickerUri}/autoclose`;
    if (popup && !popup.closed) popup.location.href = state.pick.uri;
    else openPicker();
    openSheet('waiting');
    await G.waitForSelection(session, ac.signal);
    openSheet('busy', { title: 'Bringing in your photos', text: 'Reading what you picked.' });
    let items = await G.listMediaItems(session.id, (n) => {
      const p = $('#sheetCard p');
      if (p) p.textContent = `${n} photos found so far.`;
    });
    if (!items.length) throw new Error('No photos were picked. Choose at least one photo and press Done.');
    if (items.length > CONFIG.maxPhotos) {
      const step = items.length / CONFIG.maxPhotos;
      items = Array.from({ length: CONFIG.maxPhotos }, (_, i) => items[Math.floor(i * step)]);
      toast(`Showing ${CONFIG.maxPhotos} of the photos you picked, spread across all your years.`, 6000);
    }
    const photos = G.toPhotos(items);
    state.pick = null;
    closeSheet();
    setPhotos(photos, 'google');
    start();
  } catch (err) {
    const aborted = err.name === 'AbortError';
    try { if (popup && !popup.closed) popup.close(); } catch { /* cross-origin */ }
    state.pick = null;
    if (aborted) closeSheet();
    else openSheet('error', { message: err.message, retry: err instanceof G.AuthError ? 'connect' : 'choose' });
  }
}

function cancelPick() {
  state.pick?.ac.abort();
  state.pick = null;
  closeSheet();
}

window.addEventListener('pagehide', () => G.deleteSession(state.sessionId));

// ---- boot --------------------------------------------------------------------------------

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('400 160px "Instrument Serif"'),
        document.fonts.load('500 34px Inter'),
      ]),
      wait(1800),
    ]);
  } catch { /* fonts are optional */ }
  if (G.isConfigured()) G.preloadGis().catch(() => {});
  engine.targetShift = innerWidth > 900 ? innerWidth * 0.17 : 0;
  engine.shift = engine.targetShift;
  engine.applyShift();
  setPhotos(makeDemoPhotos(), 'demo');
  window.addEventListener('resize', () => { if (!state.started) engine.targetShift = innerWidth > 900 ? innerWidth * 0.17 : 0; });
  if (location.hash === '#tunnel') switchWorld('tunnel');
  if (new URLSearchParams(location.search).has('autostart')) start();
}

boot();
window.photoVortex = { engine, state }; // handy for poking around in the browser console
