/**
 * dir-browser.js — In-page directory browser modal.
 *
 * Usage: DirBrowser.open(callback)
 *   callback(path) is called when user selects a directory.
 */
const DirBrowser = (() => {
  const modal     = document.getElementById('modal-dir-browser');
  const listEl    = document.getElementById('db-list');
  const crumbEl   = document.getElementById('db-breadcrumb');
  const selectedEl = document.getElementById('db-selected');
  let _callback = null;
  let _currentPath = '';

  function open(callback) {
    _callback = callback;
    _currentPath = '';
    selectedEl.value = '';
    modal.classList.remove('hidden');
    _browse('');
  }

  function _close() {
    modal.classList.add('hidden');
    _callback = null;
  }

  document.getElementById('db-close')?.addEventListener('click', _close);
  document.getElementById('db-select')?.addEventListener('click', () => {
    const path = selectedEl.value.trim();
    if (path && _callback) _callback(path);
    _close();
  });

  // Close on backdrop click
  modal?.addEventListener('click', e => {
    if (e.target === modal) _close();
  });

  // Keyboard
  modal?.addEventListener('keydown', e => {
    if (e.key === 'Escape') _close();
  });

  async function _browse(path) {
    try {
      const data = await API.get('/api/browse?path=' + encodeURIComponent(path || ''));
      _currentPath = data.current || path || '';
      selectedEl.value = _currentPath;
      _renderBreadcrumb(_currentPath);
      _renderList(data);
    } catch (e) {
      listEl.innerHTML = '<div style="color:var(--red);padding:16px">디렉토리를 불러올 수 없습니다.</div>';
    }
  }

  function _renderBreadcrumb(p) {
    crumbEl.innerHTML = '';
    if (!p) {
      crumbEl.innerHTML = '<span style="color:var(--text-dim);font-size:13px">바로가기</span>';
      return;
    }
    const parts = p.split('/').filter(Boolean);

    // Root /
    const rootBtn = _crumbBtn('/', '/');
    crumbEl.appendChild(rootBtn);

    let acc = '';
    parts.forEach(part => {
      acc += '/' + part;
      const sep = document.createElement('span');
      sep.textContent = '›';
      sep.style.cssText = 'color:var(--text-dim);font-size:12px;margin:0 2px';
      crumbEl.appendChild(sep);
      crumbEl.appendChild(_crumbBtn(part, acc));
    });
  }

  function _crumbBtn(label, path) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = 'background:var(--surface);border:none;color:var(--accent);cursor:pointer;padding:3px 8px;border-radius:4px;font-size:13px;white-space:nowrap';
    btn.addEventListener('click', () => _browse(path));
    btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--border)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'var(--surface)'; });
    return btn;
  }

  function _renderList(data) {
    listEl.innerHTML = '';

    // Quick-access roots (when no path selected)
    if (!_currentPath) {
      data.dirs.forEach(d => {
        const el = document.createElement('div');
        el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px 20px;cursor:pointer;border-bottom:1px solid rgba(69,71,90,.3);font-size:14px';
        const icon = d.name.includes('drive') ? '💾' : d.name === '/' ? '🖥' : '🏠';
        el.innerHTML = '<span style="font-size:20px;width:28px;text-align:center">' + icon + '</span>'
          + '<span style="flex:1">' + _e(d.name) + '</span>'
          + '<span style="font-size:12px;color:var(--text-dim)">' + _e(d.path) + '</span>';
        el.addEventListener('click', () => _browse(d.path));
        el.addEventListener('mouseenter', () => { el.style.background = 'var(--surface)'; });
        el.addEventListener('mouseleave', () => { el.style.background = ''; });
        listEl.appendChild(el);
      });
      return;
    }

    // Parent (..)
    if (data.parent != null) {
      const up = _dirEntry('⬆', '..', data.parent, true);
      listEl.appendChild(up);
    }

    // Directories
    data.dirs.forEach(d => {
      const el = _dirEntry('📁', d.name, d.path, false);
      listEl.appendChild(el);
    });

    if (!data.dirs.length && data.parent != null) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:20px;color:var(--text-dim);text-align:center;font-size:13px';
      empty.textContent = '하위 디렉토리 없음';
      listEl.appendChild(empty);
    }
  }

  function _dirEntry(icon, name, path, isParent) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 20px;cursor:pointer;border-bottom:1px solid rgba(69,71,90,.3);font-size:14px';

    el.innerHTML = '<span style="font-size:18px;width:24px;text-align:center">' + icon + '</span>'
      + '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _e(name) + '</span>';

    if (isParent) {
      el.addEventListener('click', () => _browse(path));
    } else {
      // Single click: select, double click: enter
      el.addEventListener('click', () => {
        listEl.querySelectorAll('[data-selected]').forEach(s => {
          s.style.background = '';
          s.style.color = '';
          s.removeAttribute('data-selected');
        });
        el.setAttribute('data-selected', '1');
        el.style.background = 'var(--accent)';
        el.style.color = 'var(--bg)';
        selectedEl.value = path;
      });
      el.addEventListener('dblclick', () => _browse(path));
    }

    el.addEventListener('mouseenter', () => { if (!el.hasAttribute('data-selected')) el.style.background = 'var(--surface)'; });
    el.addEventListener('mouseleave', () => { if (!el.hasAttribute('data-selected')) el.style.background = ''; });
    return el;
  }

  function _e(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  return { open };
})();
