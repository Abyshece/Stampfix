// Minimal imitations of the custom dropdowns job sites use, for testing.
// 1) Workday-style: <button aria-haspopup="listbox" data-options="A|B|C">Select One</button>
// 2) Type-ahead: <input role="combobox" data-options="A|B|C"> (list filters as you type)
(function () {
  let open = null;
  function close() { if (open) { open.remove(); open = null; } }
  function place(list, anchor) {
    const r = anchor.getBoundingClientRect();
    list.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.bottom + scrollY + 2}px;background:#fff;border:1px solid #999;min-width:${r.width}px;max-height:220px;overflow:auto;z-index:1000;margin:0;padding:0;list-style:none`;
  }
  function showList(anchor, items, onPick) {
    close();
    const list = document.createElement('ul');
    list.setAttribute('role', 'listbox');
    list.id = anchor.id + '-listbox';
    for (const it of items) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.textContent = it;
      li.style.padding = '4px 8px';
      li.addEventListener('mousedown', (e) => e.preventDefault());
      li.addEventListener('click', () => { onPick(it); close(); });
      list.append(li);
    }
    place(list, anchor);
    document.body.append(list);
    open = list;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[aria-haspopup="listbox"]');
    if (b) {
      e.preventDefault();
      if (open) { close(); return; }
      showList(b, b.dataset.options.split('|'), (v) => { b.textContent = v; b.dataset.value = v; });
      return;
    }
    if (!e.target.closest('[role="listbox"]') && !e.target.matches('input[role="combobox"]')) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  function comboUpdate(inp) {
    const q = inp.value.toLowerCase();
    if (inp.dataset.async && q.length < 2) { close(); return; }
    const items = inp.dataset.options.split('|').filter((o) => o.toLowerCase().includes(q));
    const go = () => showList(inp, items.length ? items : [], (v) => { inp.value = ''; inp.dataset.value = v; const chip = document.getElementById(inp.id + '-chosen'); if (chip) chip.textContent = v; });
    if (inp.dataset.async) setTimeout(go, 400); else go();
  }
  document.addEventListener('input', (e) => { if (e.target.matches('input[role="combobox"][data-options]')) comboUpdate(e.target); });
  document.addEventListener('mousedown', (e) => { if (e.target.matches('input[role="combobox"][data-options]') && !e.target.dataset.async) comboUpdate(e.target); });
})();
