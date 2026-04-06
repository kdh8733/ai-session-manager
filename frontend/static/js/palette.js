/**
 * palette.js — Command Palette (Ctrl+K)
 *
 * Searches projects and sessions, navigates to selected item.
 */

const Palette = (() => {
  const overlay  = document.getElementById('cmd-palette');
  const input    = document.getElementById('cmd-input');
  const results  = document.getElementById('cmd-results');
  let _items = [];
  let _selected = 0;

  function open() {
    _buildItems();
    overlay.classList.remove('hidden');
    input.value = '';
    input.focus();
    _filter('');
  }

  function close() {
    overlay.classList.add('hidden');
  }

  function _buildItems() {
    _items = [];
    const state = State.get();

    (state.projects || []).forEach(p => {
      _items.push({ type: 'project', label: p.name, sub: p.path, data: p });
    });

    (state.sessions || []).forEach(s => {
      _items.push({ type: 'session', label: s.display_name, sub: s.id, data: s });
    });

    // Also add history sessions
    (state.historySessions || []).forEach(s => {
      _items.push({ type: 'history', label: s.title || s.first_prompt || s.session_id, sub: s.cwd, data: s });
    });
  }

  function _filter(q) {
    const lower = q.toLowerCase();
    const filtered = q
      ? _items.filter(i => i.label.toLowerCase().includes(lower) || (i.sub || '').toLowerCase().includes(lower))
      : _items.slice(0, 20);

    results.innerHTML = '';
    _selected = 0;

    filtered.forEach((item, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="cmd-type">${item.type}</span>
        <span>${_esc(item.label)}</span>
        <span style="font-size:11px;color:var(--text-dim);margin-left:auto">${_esc(item.sub || '')}</span>
      `;
      if (idx === 0) li.classList.add('selected');
      li.addEventListener('click', () => _select(item));
      results.appendChild(li);
    });
  }

  function _select(item) {
    close();
    if (item.type === 'session') {
      App.openSession(item.data);
    } else if (item.type === 'project') {
      App.openProject(item.data);
    } else if (item.type === 'history') {
      App.showPanel('history');
      // Trigger history open
      HistoryViewer.load().then(() => {});
    }
  }

  function _moveSelection(dir) {
    const items = results.querySelectorAll('li');
    if (!items.length) return;
    items[_selected]?.classList.remove('selected');
    _selected = (_selected + dir + items.length) % items.length;
    items[_selected]?.classList.add('selected');
    items[_selected]?.scrollIntoView({ block: 'nearest' });
  }

  // Key bindings
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      overlay.classList.contains('hidden') ? open() : close();
    }
    if (!overlay.classList.contains('hidden')) {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowDown') { e.preventDefault(); _moveSelection(1); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); _moveSelection(-1); }
      if (e.key === 'Enter') {
        const items = results.querySelectorAll('li');
        if (items[_selected]) items[_selected].click();
      }
    }
  });

  input.addEventListener('input', e => _filter(e.target.value));

  // Close on backdrop click
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  // Button trigger
  document.getElementById('btn-cmd-palette').addEventListener('click', open);

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { open, close };
})();
