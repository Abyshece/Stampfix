'use strict';

const $ = (id) => document.getElementById(id);

function h(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

async function init() {
  const { profile } = await chrome.storage.local.get(['profile']);
  const name = profile && [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  if (name || (profile && profile.email)) {
    $('who').textContent = name || profile.email;
  } else {
    $('who').textContent = 'No profile yet';
    $('fill').textContent = 'Set up my profile';
    $('fill').dataset.setup = '1';
  }
  try {
    const cmds = await chrome.commands.getAll();
    const c = cmds.find((x) => x.name === 'fill-page');
    $('shortcut').textContent = (c && c.shortcut) || 'not set';
  } catch (e) { /* ignore */ }
}

function showResult(r) {
  const box = $('result');
  box.hidden = false;
  box.textContent = '';
  if (r.error) {
    box.className = 'result warn';
    box.append(h('p', 'headline', r.error));
    return;
  }
  if (r.noProfile) {
    box.className = 'result warn';
    box.append(h('p', 'headline', 'Set up your profile first.'));
    return;
  }
  if (!r.fields) {
    box.className = 'result warn';
    box.append(h('p', 'headline', 'No form fields found on this page.'));
    box.append(h('p', 'sub', 'Open the application form itself (click Apply), then try again.'));
    return;
  }
  box.className = 'result ' + (r.filled.length ? 'ok' : 'warn');
  const n = r.filled.length;
  box.append(h('p', 'headline', `Filled ${n} field${n === 1 ? '' : 's'}`));
  const bits = [];
  if (r.kept) bits.push(`${r.kept} already had answers`);
  if (r.review.length) bits.push(`${r.review.length} left for you (amber)`);
  if (bits.length) box.append(h('p', 'sub', bits.join(' · ')));
  if (r.review.length) {
    const ul = h('ul', 'todo');
    for (const it of r.review.slice(0, 8)) {
      const li = h('li', it.required ? 'req' : '', it.label);
      if (it.required) li.title = 'Required';
      ul.append(li);
    }
    if (r.review.length > 8) ul.append(h('li', 'more', `+ ${r.review.length - 8} more`));
    box.append(ul);
  }
  box.append(h('p', 'sub', 'Check the form before you submit.'));
}

$('fill').addEventListener('click', async () => {
  const btn = $('fill');
  if (btn.dataset.setup) { chrome.runtime.openOptionsPage(); window.close(); return; }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  btn.disabled = true;
  btn.textContent = 'Filling…';
  const res = await chrome.runtime.sendMessage({ type: 'fill', tabId: tab.id, opts: { overwrite: $('overwrite').checked } });
  btn.disabled = false;
  btn.textContent = 'Autofill again';
  if (!res || !res.ok) showResult({ error: (res && res.error) || 'Something went wrong. Reload the page and try again.' });
  else showResult(res.result);
});

$('edit').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
