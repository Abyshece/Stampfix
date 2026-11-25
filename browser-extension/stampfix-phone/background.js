// Stampfix Phone: Instagram in Chrome's side panel, next to the Stampfix admin panel.
//
// Inside the phone (frames in this extension's panel, which belong to no tab):
//   - Instagram's two "don't embed me" headers (X-Frame-Options, CSP) are
//     lifted, and its page requests are labelled as ordinary page loads
//     (Sec-Fetch-Dest: document), since Meta answers "embedded frame" requests
//     with an error page;
//   - Instagram is asked for its mobile site (an Android Chrome user agent),
//     like Chrome's own device mode, so the phone shows the real phone layout.
// Your normal Instagram tabs are not touched. Frames Instagram opens itself
// (logging in, links) get the same treatment; anywhere but the panel such a
// frame is logged out (Chrome doesn't send Instagram's login cookie to frames
// inside other websites), so no website can use this to act as you.
// Inside an extension's own page Chrome treats the embedded site as
// first-party, so your normal Instagram login works there.

const IG_URL = /^https:\/\/(www\.instagram\.com|instagram\.com|ig\.me)\//;
const IG_DOMAINS = ['instagram.com', 'ig.me'];
const MAJOR = (/Chrome\/(\d+)/.exec(navigator.userAgent) || [])[1] || '140';
const MOBILE_UA = `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${MAJOR}.0.0.0 Mobile Safari/537.36`;
const MOBILE = [
  { header: 'user-agent', operation: 'set', value: MOBILE_UA },
  { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
  { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' },
  { header: 'sec-ch-ua-platform-version', operation: 'remove' },
  { header: 'sec-ch-ua-model', operation: 'remove' },
  { header: 'sec-ch-ua-arch', operation: 'remove' },
  { header: 'sec-ch-ua-bitness', operation: 'remove' },
];
const AS_PAGE = [{ header: 'sec-fetch-dest', operation: 'set', value: 'document' }];
const LIFT = [
  { header: 'x-frame-options', operation: 'remove' },
  { header: 'content-security-policy', operation: 'remove' },
];
const NOT_FRAMES = ['xmlhttprequest', 'script', 'stylesheet', 'image', 'font', 'media', 'websocket', 'ping', 'other'];

async function setup() {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (e) { console.warn('side panel', e); }
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1, priority: 1,
        action: { type: 'modifyHeaders', responseHeaders: LIFT, requestHeaders: [...AS_PAGE, ...MOBILE] },
        condition: { requestDomains: IG_DOMAINS, resourceTypes: ['sub_frame'], initiatorDomains: [chrome.runtime.id, ...IG_DOMAINS] },
      }],
    });
  } catch (e) { console.warn('frame rule', e); }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [2, 3],
      addRules: [{
        id: 2, priority: 1,
        action: { type: 'modifyHeaders', responseHeaders: LIFT, requestHeaders: [...AS_PAGE, ...MOBILE] },
        condition: { requestDomains: [...IG_DOMAINS, 'www.facebook.com'], resourceTypes: ['sub_frame'], tabIds: [chrome.tabs.TAB_ID_NONE] },
      }, {
        id: 3, priority: 1,
        action: { type: 'modifyHeaders', requestHeaders: MOBILE },
        condition: { requestDomains: IG_DOMAINS, resourceTypes: NOT_FRAMES, tabIds: [chrome.tabs.TAB_ID_NONE] },
      }],
    });
  } catch (e) { console.warn('panel rules', e); }
}
chrome.runtime.onInstalled.addListener(() => { void setup(); });
chrome.runtime.onStartup.addListener(() => { void setup(); });
void setup();

// Is a phone showing in this window? (The side panel, or the phone opened as a tab.)
async function phoneShowing(windowId) {
  try {
    const found = await chrome.runtime.getContexts({
      contextTypes: ['SIDE_PANEL', 'TAB'],
      documentUrls: [chrome.runtime.getURL('panel.html')],
    });
    return found.some((c) => c.windowId === windowId || c.windowId === -1);
  } catch { return false; }
}

// The admin panel (through bridge.js) asks to show an Instagram page.
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'open' || typeof msg.url !== 'string' || !IG_URL.test(msg.url) || !sender.tab) return false;
  // Opening the panel must happen right away, while the click still counts.
  // Chrome may refuse (it wants a click on the extension itself); then the
  // page asks you to click the toolbar icon, and the panel opens on this page.
  let opening = Promise.resolve(false);
  try { opening = chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => true, () => false); } catch { /* older Chrome */ }
  const text = typeof msg.text === 'string' && msg.text.trim() ? msg.text.slice(0, 4000) : null;
  chrome.storage.session.set({ go: { url: msg.url, text, at: Date.now() } })
    .then(() => opening)
    .then(async (opened) => reply({ ok: true, panel: opened || await phoneShowing(sender.tab.windowId) }), () => reply({ ok: false, panel: false }));
  return true;
});

// "Details" in the phone: the last pages it loaded, with Instagram's answers
// (addresses only, without anything after "?"). Kept in this browser session only.
const short = (u) => { try { const x = new URL(u); return x.host + x.pathname; } catch { return String(u).slice(0, 80); } };
let log = [];
function note(d, what) {
  log = [{ at: Date.now(), url: short(d.url), what: String(what).slice(0, 120) }, ...log].slice(0, 25);
  chrome.storage.session.set({ log }).catch(() => {});
}
const WATCH = { urls: ['https://*.instagram.com/*', 'https://instagram.com/*', 'https://ig.me/*', 'https://www.facebook.com/*'], types: ['sub_frame'], tabId: chrome.tabs.TAB_ID_NONE };
chrome.webRequest.onBeforeRedirect.addListener((d) => note(d, `${d.statusCode} to ${short(d.redirectUrl)}`), WATCH);
chrome.webRequest.onCompleted.addListener((d) => note(d, d.statusCode), WATCH);
chrome.webRequest.onErrorOccurred.addListener((d) => note(d, d.error), WATCH);
