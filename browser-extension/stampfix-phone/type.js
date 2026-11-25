// Runs in Instagram pages, but only does something in the Stampfix Phone's own
// Instagram frame (its outer page is this extension's panel). When the phone
// asks, it waits for the chat's message box and types the message in, the way
// pasting does. It never presses Send: you do.
(() => {
  const mine = `chrome-extension://${chrome.runtime.id}`;
  const anc = location.ancestorOrigins;
  if (window.top === window || !anc || anc.length !== 1 || anc[0] !== mine) return;

  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const valueOf = (el) => ('value' in el && typeof el.value === 'string' ? el.value : el.innerText || el.textContent || '');
  const holds = (el, text) => norm(valueOf(el)).includes(norm(text).slice(0, 40));
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 20 && r.height > 8 && getComputedStyle(el).visibility !== 'hidden'; };
  const LABEL = /message|nachricht|mensaje|messaggio|mensagem|bericht|wiadomo/i;

  // The chat's message box: Instagram's editor (a contenteditable textbox), else a textarea.
  function box() {
    const all = [...document.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"][aria-label], textarea')].filter(visible);
    const named = all.filter((el) => LABEL.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-placeholder') || ''}`));
    const list = named.length ? named : all;
    return list[list.length - 1] || null;
  }

  function typeInto(el, text) {
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      set.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // Instagram's editor handles a paste like Cmd+V; if it ignores this one, type it.
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }

  let current = 0;
  async function run(job) {
    current = job.id;
    const until = Date.now() + 25000;
    let el = null;
    while (Date.now() < until && current === job.id) {
      el = box();
      if (el) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (current !== job.id) return;
    let ok = false;
    if (el) {
      if (!holds(el, job.text)) {
        typeInto(el, job.text);
        await new Promise((r) => setTimeout(r, 200));
        if (!holds(el, job.text) && !(el instanceof HTMLTextAreaElement)) {
          el.focus();
          document.execCommand('insertText', false, job.text);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      ok = holds(el, job.text);
    }
    window.parent.postMessage({ type: 'stampfix-phone:typed', id: job.id, ok, found: !!el }, mine);
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || e.origin !== mine) return;
    const d = e.data;
    if (d && d.type === 'stampfix-phone:type' && typeof d.text === 'string' && d.text.trim()) void run({ id: d.id, text: d.text.slice(0, 4000) });
  });
  window.parent.postMessage({ type: 'stampfix-phone:ready' }, mine);
})();
