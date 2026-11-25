// The phone: shows the Instagram page the admin panel asked for (or Messages),
// once you're logged in to Instagram.
const HOME = 'https://www.instagram.com/direct/inbox/';
const LOGIN = 'https://www.instagram.com/accounts/login/';
const IG_URL = /^https:\/\/(www\.instagram\.com|instagram\.com|ig\.me)\//;
const frame = document.getElementById('ig');
const loginBox = document.getElementById('login');
const logBox = document.getElementById('log');
const noteBox = document.getElementById('note');
const EXT = `chrome-extension://${chrome.runtime.id}`;

let wanted = HOME;      // the page the admin panel asked for last
let loggedOut = false;  // no Instagram login in this browser
let loggingIn = false;  // logging in inside the phone right now
let typeText = null;    // the message to type into the chat (the send queue)
let typeId = 0;

function show(url) { frame.src = url; }
function setLoggedOut(out) {
  loggedOut = out;
  loggingIn = false;
  loginBox.hidden = !out;
  if (!out) show(wanted);
}
function note(text, kind) {
  noteBox.textContent = text || '';
  noteBox.className = `note ${kind || ''}`;
  noteBox.hidden = !text;
}
function go(url, text) {
  if (typeof url !== 'string' || !IG_URL.test(url)) return;
  wanted = url;
  typeText = typeof text === 'string' && text.trim() ? text : null;
  typeId = Date.now();
  note(typeText ? 'Opening the chat and typing the message in…' : '', 'wait');
  if (!loggedOut && !loggingIn) show(url);
}

// The Instagram frame (type.js) says it's ready: give it the message to type.
// It answers whether the message is in the box; it never presses Send.
window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const d = e.data;
  if (d && d.type === 'stampfix-phone:ready' && typeText && Date.now() - typeId < 10 * 60e3) {
    frame.contentWindow.postMessage({ type: 'stampfix-phone:type', text: typeText, id: typeId }, '*');
  } else if (d && d.type === 'stampfix-phone:typed' && d.id === typeId) {
    if (d.ok) { typeText = null; note('Message typed in. Check it, then press Enter to send.', 'ok'); }
    else note(d.found ? 'Couldn’t type the message in. Click the message box and paste it (Cmd+V).' : 'Couldn’t find the message box. Paste the message yourself (Cmd+V).', 'warn');
  }
});

// Logged in? Instagram keeps its login in the "sessionid" cookie (only whether
// it exists is checked, never its value).
async function hasLogin() {
  try { return !!(await chrome.cookies.get({ url: 'https://www.instagram.com/', name: 'sessionid' })); } catch { return true; }
}
chrome.cookies.onChanged.addListener(({ cookie, removed, cause }) => {
  if (cookie.name !== 'sessionid' || !cookie.domain.endsWith('instagram.com')) return;
  if (!removed && (loggedOut || loggingIn)) setLoggedOut(false); // just logged in: open the chat
  else if (removed && cause !== 'overwrite') void hasLogin().then((ok) => { if (!ok) setLoggedOut(true); });
});

(async () => {
  try {
    const { go: g } = await chrome.storage.session.get('go');
    if (g && IG_URL.test(g.url)) {
      wanted = g.url;
      // Opened just now for this chat: type its message in too.
      if (typeof g.text === 'string' && g.text.trim() && Date.now() - (g.at || 0) < 2 * 60e3) { typeText = g.text; typeId = Date.now(); note('Opening the chat and typing the message in…', 'wait'); }
    }
  } catch { /* Messages */ }
  if (await hasLogin()) show(wanted); else setLoggedOut(true);
})();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'session') return;
  if (changes.go && changes.go.newValue) go(changes.go.newValue.url, changes.go.newValue.text);
  if (changes.log && !logBox.hidden) drawLog(changes.log.newValue || []);
});

document.getElementById('back').addEventListener('click', () => history.back());
document.getElementById('home').addEventListener('click', () => go(HOME));
document.getElementById('tab').addEventListener('click', () => { void chrome.tabs.create({ url: loggedOut ? LOGIN : wanted }); });
document.getElementById('login-tab').addEventListener('click', () => { void chrome.tabs.create({ url: LOGIN }); });
document.getElementById('login-here').addEventListener('click', () => { loggedOut = false; loggingIn = true; loginBox.hidden = true; show(LOGIN); });

// Details: what the phone loaded, and what Instagram answered.
function drawLog(entries) {
  logBox.textContent = '';
  if (!entries.length) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Nothing loaded yet.'; logBox.append(li); return;
  }
  for (const e of entries) {
    const li = document.createElement('li');
    li.textContent = `${new Date(e.at).toLocaleTimeString()}  ${e.url}  ${e.what}`;
    logBox.append(li);
  }
}
document.getElementById('details').addEventListener('click', async () => {
  logBox.hidden = !logBox.hidden;
  if (!logBox.hidden) { const { log = [] } = await chrome.storage.session.get('log'); drawLog(log); }
});
