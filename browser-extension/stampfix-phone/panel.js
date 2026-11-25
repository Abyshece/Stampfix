// The phone: shows the Instagram page the admin panel asked for (or Messages).
const HOME = 'https://www.instagram.com/direct/inbox/';
const IG_URL = /^https:\/\/(www\.instagram\.com|instagram\.com|ig\.me)\//;
const frame = document.getElementById('ig');

function go(url) {
  if (typeof url !== 'string' || !IG_URL.test(url)) return;
  frame.src = url;
}

chrome.storage.session.get('go').then(({ go: g }) => go(g && g.url ? g.url : HOME), () => go(HOME));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.go && changes.go.newValue) go(changes.go.newValue.url);
});
document.getElementById('back').addEventListener('click', () => history.back());
document.getElementById('home').addEventListener('click', () => go(HOME));
