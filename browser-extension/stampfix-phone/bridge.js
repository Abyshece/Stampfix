// Runs on stampfix.app. Tells the admin panel the phone is installed, and passes
// its "show this Instagram page" requests (with the message to type in, if
// any) to the extension. Nothing else.
(() => {
  const IG_URL = /^https:\/\/(www\.instagram\.com|instagram\.com|ig\.me)\//;
  document.documentElement.dataset.stampfixPhone = chrome.runtime.getManifest().version;
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'stampfix-phone:open' || typeof d.url !== 'string' || !IG_URL.test(d.url)) return;
    const answer = (r) => window.postMessage({ type: 'stampfix-phone:opened', id: d.id ?? null, ok: !!r?.ok, panel: !!r?.panel }, location.origin);
    // The message to type into the chat (the send queue), if any.
    const text = typeof d.text === 'string' && d.text.trim() ? d.text.slice(0, 4000) : null;
    try {
      chrome.runtime.sendMessage({ type: 'open', url: d.url, text }, (r) => { void chrome.runtime.lastError; answer(r); });
    } catch {
      answer(null); // the extension was updated or removed: reload the page
    }
  });
})();
