/*
 * Job Autofill: background service worker.
 * Runs the filler in every frame of the active tab (application forms are
 * often embedded in an iframe), merges the per-frame results and shows a
 * short summary on the page.
 */

async function fillTab(tabId, opts = {}) {
  const tab = await chrome.tabs.get(tabId);
  if (!/^(https?|file):/i.test(tab.url || '')) {
    throw new Error("Chrome doesn't let extensions fill this kind of page. Open a job application and try again.");
  }

  // Skip embedded forms that are hidden on the page (e.g. a later step of a
  // card-style form): each frame reports which of its iframes can't be seen.
  const probe = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: hiddenFrameUrls });
  const hidden = new Set(probe.flatMap((r) => (r.result ? r.result.hidden : [])));
  const frameIds = probe.filter((r) => r.frameId === 0 || !(r.result && hidden.has(r.result.href))).map((r) => r.frameId);

  await chrome.scripting.executeScript({ target: { tabId, frameIds }, files: ['content/filler.js'] });
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds },
    func: (o) => (window.__jobAutofill ? window.__jobAutofill.run(o) : null),
    args: [opts],
  });

  const summary = { fields: 0, filled: [], review: [], kept: 0, noProfile: false, error: null };
  for (const r of results) {
    const v = r && r.result;
    if (!v) continue;
    if (v.error) summary.error = v.error;
    if (v.noProfile) summary.noProfile = true;
    summary.fields += v.fields || 0;
    summary.kept += v.kept || 0;
    summary.filled.push(...(v.filled || []));
    summary.review.push(...(v.review || []));
  }
  summary.review.sort((a, b) => Number(b.required) - Number(a.required));

  await chrome.scripting
    .executeScript({ target: { tabId, frameIds: [0] }, func: showToast, args: [toastText(summary)] })
    .catch(() => {});
  return summary;
}

// Runs inside every frame: lists the iframes on this page that a person can't see.
function hiddenFrameUrls() {
  const hidden = [];
  for (const f of document.querySelectorAll('iframe,frame')) {
    let visible = f.getClientRects().length > 0;
    if (visible && f.checkVisibility) visible = f.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    if (visible) {
      const r = f.getBoundingClientRect();
      visible = r.width > 2 && r.height > 2;
    }
    if (!visible) {
      try { hidden.push(new URL(f.getAttribute('src') || 'about:blank', location.href).href); } catch (e) { /* ignore */ }
    }
  }
  return { href: location.href, hidden };
}

function toastText(s) {
  if (s.error) return { tone: 'warn', title: s.error, body: '' };
  if (s.noProfile) return { tone: 'warn', title: 'Set up your profile first', body: 'Click the Job Autofill icon, then "Edit my profile".' };
  if (!s.fields) return { tone: 'warn', title: 'No form fields found on this page', body: 'If the form is on another step, open it and try again.' };
  const left = s.review.length;
  return {
    tone: s.filled.length ? 'ok' : 'warn',
    title: `Filled ${s.filled.length} field${s.filled.length === 1 ? '' : 's'}`,
    body: left ? `${left} left for you, outlined in amber. Check everything before you submit.` : 'Check everything before you submit.',
  };
}

// Runs inside the page (top frame).
function showToast(msg) {
  const ID = '__jaf_toast';
  const old = document.getElementById(ID);
  if (old) old.remove();
  const host = document.createElement('div');
  host.id = ID;
  host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .t{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#111827;color:#f9fafb;
       border-radius:10px;padding:12px 14px 12px 12px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;gap:10px;
       max-width:340px;align-items:flex-start;animation:in .18s ease-out}
    .dot{width:10px;height:10px;border-radius:50%;margin-top:5px;flex:none}
    .ok .dot{background:#22c55e}.warn .dot{background:#f59e0b}
    b{display:block;font-weight:600}
    span{color:#d1d5db;font-size:13px}
    button{all:unset;cursor:pointer;color:#9ca3af;margin-left:6px;font-size:16px;line-height:1}
    @keyframes in{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}`;
  const box = document.createElement('div');
  box.className = 't ' + (msg.tone || 'ok');
  const dot = document.createElement('div');
  dot.className = 'dot';
  const text = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = msg.title;
  text.append(b);
  if (msg.body) {
    const s = document.createElement('span');
    s.textContent = msg.body;
    text.append(s);
  }
  const x = document.createElement('button');
  x.textContent = '×';
  x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', () => host.remove());
  box.append(dot, text, x);
  root.append(style, box);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 6000);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'fill') {
    fillTab(msg.tabId, msg.opts || {})
      .then((r) => sendResponse({ ok: true, result: r }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'fill-page') return;
  const target = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!target) return;
  try {
    const r = await fillTab(target.id, {});
    const n = r.filled.length;
    await chrome.action.setBadgeBackgroundColor({ color: '#16a34a', tabId: target.id });
    await chrome.action.setBadgeText({ text: n ? String(n) : '', tabId: target.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: target.id }).catch(() => {}), 8000);
  } catch (e) {
    // Pages Chrome protects (settings, the Web Store) can't be filled.
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
  // Resume, cover letter, certificates and start date are attached / entered per company.
  await chrome.storage.local.remove(['file_resume', 'file_coverLetter', 'file_certificates']);
  const { profile } = await chrome.storage.local.get('profile');
  if (profile && ('availableStartDate' in profile || 'availability' in profile)) {
    delete profile.availableStartDate;
    delete profile.availability;
    await chrome.storage.local.set({ profile });
  }
});

// Exposed for automated tests.
self.fillTab = fillTab;
