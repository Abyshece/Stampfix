// Runs on stampfix.app. Tells the admin panel the phone is installed, and passes
// its "show this Instagram page" requests to the extension. Nothing else.
(() => {
  const IG_URL = /^https:\/\/(www\.instagram\.com|instagram\.com|ig\.me)\//;
  document.documentElement.dataset.stampfixPhone = chrome.runtime.getManifest().version;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'stampfix-phone:open' || typeof d.url !== 'string' || !IG_URL.test(d.url)) return;
    const answer = (r) => window.postMessage({ type: 'stampfix-phone:opened', id: d.id ?? null, ok: !!r?.ok, panel: !!r?.panel }, location.origin);
    try {
      chrome.runtime.sendMessage({ type: 'open', url: d.url }, (r) => { void chrome.runtime.lastError; answer(r); });
    } catch {
      answer(null); // the extension was updated or removed: reload the page
    }
  });
})();
