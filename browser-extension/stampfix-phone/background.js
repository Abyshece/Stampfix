// Stampfix Phone: Instagram in Chrome's side panel, next to the Stampfix admin panel.
//
// Instagram tells browsers not to show it inside other pages (X-Frame-Options
// and Content-Security-Policy frame-ancestors). This extension removes those two
// headers for Instagram frames in its own panel:
//   - frames this extension opens (the panel), and frames outside any tab (the
//     side panel itself, so Back and reloads work there too);
//   - navigations Instagram starts inside its own frame (logging in, links).
//     Anywhere but the panel such a frame is logged out (Chrome doesn't send
//     Instagram's login cookie to frames inside other websites), so no website
//     can use this to act as you.
// Inside an extension's own page Chrome treats the embedded site as
// first-party, so your normal Instagram login works there.

const IG_URL = /^https:\/\/(www\.instagram\.com|instagram\.com|ig\.me)\//;
const IG_DOMAINS = ['instagram.com', 'ig.me'];
const LIFT = {
  type: 'modifyHeaders',
  responseHeaders: [
    { header: 'x-frame-options', operation: 'remove' },
    { header: 'content-security-policy', operation: 'remove' },
  ],
};

async function setup() {
  try { await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }); } catch (e) { console.warn('side panel', e); }
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1, priority: 1, action: LIFT,
        condition: { requestDomains: IG_DOMAINS, resourceTypes: ['sub_frame'], initiatorDomains: [chrome.runtime.id, ...IG_DOMAINS] },
      }],
    });
  } catch (e) { console.warn('frame rule', e); }
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [2],
      addRules: [{
        id: 2, priority: 1, action: LIFT,
        condition: { requestDomains: IG_DOMAINS, resourceTypes: ['sub_frame'], tabIds: [chrome.tabs.TAB_ID_NONE] },
      }],
    });
  } catch (e) { console.warn('panel rule', e); }
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
  chrome.storage.session.set({ go: { url: msg.url, at: Date.now() } })
    .then(() => opening)
    .then(async (opened) => reply({ ok: true, panel: opened || await phoneShowing(sender.tab.windowId) }), () => reply({ ok: false, panel: false }));
  return true;
});
