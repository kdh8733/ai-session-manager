/**
 * bookmarks.js — Bookmarks panel
 */

const Bookmarks = (() => {
  const listEl  = document.getElementById('bookmarks-list');
  const searchInput = document.getElementById('bm-search');
  const tagInput    = document.getElementById('bm-tag');

  async function load(q = '', tag = '') {
    const params = new URLSearchParams();
    if (q)   params.set('q', q);
    if (tag) params.set('tag', tag);
    const items = await API.get(`/api/bookmarks/?${params}`);
    _render(items);
  }

  function _render(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.innerHTML = '<div style="padding:20px;color:var(--text-dim)">북마크가 없습니다.</div>';
      return;
    }
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'bm-item';
      el.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:8px">
          <div style="flex:1">
            <div class="fav-meta">${_esc(item.session_id.slice(0,8))}… · turn ${item.turn_index}</div>
            <div class="fav-title" style="margin-top:2px">${_esc(item.snippet || '(no snippet)')}</div>
            <div style="margin-top:4px">${(item.tags || []).map(t => `<span class="tag">${_esc(t)}</span>`).join('')}</div>
          </div>
          <button class="btn-micro" data-remove="${_esc(item.id)}">✕</button>
        </div>
        <div style="margin-top:8px">
          ${(item.comments || []).map((c, i) => `
            <div class="note-item">
              <span class="note-item-text">${_esc(c.text)}</span>
              <button class="btn-micro" data-delete-comment="${i}" data-bid="${_esc(item.id)}">✕</button>
            </div>
          `).join('')}
          <div style="display:flex;gap:6px;margin-top:6px">
            <input type="text" class="comment-input" placeholder="댓글 추가..." data-bid="${_esc(item.id)}"
              style="flex:1;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:var(--radius);font-size:12px" />
            <button class="btn-micro btn-add-comment" data-bid="${_esc(item.id)}">＋</button>
          </div>
        </div>
      `;
      listEl.appendChild(el);
    });

    listEl.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', async e => {
        await API.del(`/api/bookmarks/${e.target.dataset.remove}`);
        _reload();
      });
    });

    listEl.querySelectorAll('[data-delete-comment]').forEach(btn => {
      btn.addEventListener('click', async e => {
        const bid = e.target.dataset.bid;
        const idx = parseInt(e.target.dataset.deleteComment, 10);
        await API.del(`/api/bookmarks/${bid}/comments/${idx}`);
        _reload();
      });
    });

    listEl.querySelectorAll('.btn-add-comment').forEach(btn => {
      btn.addEventListener('click', async e => {
        const bid = e.target.dataset.bid;
        const input = listEl.querySelector(`input.comment-input[data-bid="${bid}"]`);
        const text = input?.value.trim();
        if (!text) return;
        await API.post(`/api/bookmarks/${bid}/comments`, { text });
        _reload();
      });
    });
  }

  function _reload() {
    load(searchInput.value.trim(), tagInput.value.trim());
  }

  let _timer = null;
  function _onInput() {
    clearTimeout(_timer);
    _timer = setTimeout(_reload, 300);
  }
  searchInput.addEventListener('input', _onInput);
  tagInput.addEventListener('input', _onInput);

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { load };
})();
