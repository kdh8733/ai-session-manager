/**
 * favorites.js — Favorites panel
 */

const Favorites = (() => {
  const listEl  = document.getElementById('favorites-list');
  const searchInput = document.getElementById('fav-search');

  async function load(q = '') {
    const url = q ? `/api/favorites/?q=${encodeURIComponent(q)}` : '/api/favorites/';
    const items = await API.get(url);
    _render(items);
  }

  function _render(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<div style="padding:20px;color:var(--text-dim)">즐겨찾기가 없습니다.</div>';
      return;
    }
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'fav-item';
      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px">
          <div class="fav-title">${_esc(item.title || item.session_id)}</div>
          <button class="btn-micro" data-remove="${_esc(item.session_id)}" style="margin-left:auto">✕</button>
        </div>
        <div class="fav-meta">${_esc(item.project || '')}</div>
        <div class="notes-section" data-sid="${_esc(item.session_id)}">
          ${(item.notes || []).map((n, i) => `
            <div class="note-item">
              <span class="note-item-text">${_esc(n.text)}</span>
              <button class="btn-micro" data-delete-note="${i}" data-sid="${_esc(item.session_id)}">✕</button>
            </div>
          `).join('')}
          <div style="display:flex;gap:6px;margin-top:6px">
            <input type="text" class="note-input" placeholder="메모 추가..." style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:var(--radius);font-size:12px" data-sid="${_esc(item.session_id)}" />
            <button class="btn-micro btn-add-note" data-sid="${_esc(item.session_id)}">＋</button>
          </div>
        </div>
      `;
      listEl.appendChild(el);
    });

    // Event delegation
    listEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async e => {
        const sid = e.target.dataset.remove;
        await API.del(`/api/favorites/${sid}`);
        load();
      });
    });

    listEl.querySelectorAll('[data-delete-note]').forEach(btn => {
      btn.addEventListener('click', async e => {
        const sid = e.target.dataset.sid;
        const idx = parseInt(e.target.dataset.deleteNote, 10);
        await API.del(`/api/favorites/${sid}/notes/${idx}`);
        load();
      });
    });

    listEl.querySelectorAll('.btn-add-note').forEach(btn => {
      btn.addEventListener('click', async e => {
        const sid = e.target.dataset.sid;
        const input = listEl.querySelector(`input.note-input[data-sid="${sid}"]`);
        const text = input?.value.trim();
        if (!text) return;
        await API.post(`/api/favorites/${sid}/notes`, { text });
        load();
      });
    });
  }

  let _timer = null;
  searchInput.addEventListener('input', e => {
    clearTimeout(_timer);
    _timer = setTimeout(() => load(e.target.value.trim()), 300);
  });

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load };
})();
