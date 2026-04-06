/**
 * app.js — Main orchestrator with split-pane support.
 */

const App = (() => {
  const tabBar = document.getElementById('tab-bar');
  const panels = document.querySelectorAll('.panel');
  const xtermRoot = document.getElementById('xterm-container');
  const stSession = document.getElementById('status-session');
  const stGit     = document.getElementById('status-git');
  const stModel   = document.getElementById('status-model');
  const stTokens  = document.getElementById('status-tokens');
  const stCost    = document.getElementById('status-cost');

  let _tabs = [];          // [{id, sessionId, label}]
  let _activeTabId = null;
  let _statsTimer = null;

  // Split pane: null = single, {left: sessionId, right: sessionId}
  let _split = null;

  // ── Init ───────────────────────────────────────────────────────
  async function init() {
    try {
      const cfg = await API.get('/api/settings/');
      if (!cfg.project_dirs?.length) { Settings.showOnboarding(); return; }
      await Sidebar.load();
      _subscribeSSE();
      showPanel('welcome');
      _loadRecent();
    } catch (e) { console.error(e); }
  }

  // ── Panels ─────────────────────────────────────────────────────
  function showPanel(name) {
    panels.forEach(p => p.classList.add('hidden'));
    const t = document.getElementById('panel-' + name);
    if (t) t.classList.remove('hidden');
    State.set({ activePanel: name });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.panel === name));
    if (name === 'history')   HistoryViewer.load();
    if (name === 'favorites') Favorites.load();
    if (name === 'bookmarks') Bookmarks.load();
    if (name === 'cost')      CostDashboard.load();
    if (name === 'settings')  Settings.load();
  }

  document.querySelectorAll('.nav-item[data-panel]').forEach(b =>
    b.addEventListener('click', () => showPanel(b.dataset.panel)));

  // ── Open session ───────────────────────────────────────────────
  function openSession(session) {
    State.set({ activeSessionId: session.id });
    showPanel('terminal');

    let tab = _tabs.find(t => t.sessionId === session.id);
    if (!tab) {
      tab = { id: 'tab-' + Date.now(), sessionId: session.id, label: session.display_name || session.id };
      _tabs.push(tab);
    }
    _activeTabId = tab.id;
    _renderTabs();

    if (_split) {
      // In split mode, open in right pane if left is already set
      if (_split.left && _split.left !== session.id) {
        _split.right = session.id;
      } else {
        _split.left = session.id;
      }
      _renderSplit();
    } else {
      Terminal.open(session.id);
    }

    _setStatus(session);
  }

  function openProject(p) { showPanel('history'); }

  // ── Tab bar (draggable for split) ──────────────────────────────
  function _renderTabs() {
    tabBar.innerHTML = '';
    _tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.id === _activeTabId ? ' active' : '');
      el.draggable = true;
      el.dataset.sessionId = tab.sessionId;
      el.innerHTML = '<span>' + _e(tab.label) + '</span><span class="tab-close" data-id="' + tab.id + '">✕</span>';

      el.addEventListener('click', e => {
        if (e.target.dataset.id) _closeTab(e.target.dataset.id);
        else _switchTab(tab.id);
      });

      // Drag for split pane
      el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', tab.sessionId);
        e.dataTransfer.effectAllowed = 'move';
      });

      tabBar.appendChild(el);
    });
  }

  function _switchTab(tabId) {
    _activeTabId = tabId;
    _renderTabs();
    const tab = _tabs.find(t => t.id === tabId);
    if (!tab) return;
    showPanel('terminal');
    if (!_split) Terminal.open(tab.sessionId);
    const sessions = State.get().sessions || [];
    _setStatus(sessions.find(x => x.id === tab.sessionId) || { id: tab.sessionId, display_name: tab.label });
  }

  function _closeTab(tabId) {
    const tab = _tabs.find(t => t.id === tabId);
    if (tab) {
      Terminal.close(tab.sessionId);
      if (_split) {
        if (_split.left === tab.sessionId) _split.left = null;
        if (_split.right === tab.sessionId) _split.right = null;
        if (!_split.left && !_split.right) _unsplit();
      }
    }
    _tabs = _tabs.filter(t => t.id !== tabId);
    if (_activeTabId === tabId) _activeTabId = _tabs.at(-1)?.id || null;
    _renderTabs();
    if (!_tabs.length) { showPanel('welcome'); _clearStatus(); }
    else if (_activeTabId) _switchTab(_activeTabId);
  }

  // ── Split pane ─────────────────────────────────────────────────
  // Drop zones on main panel
  const _dropLeft  = document.createElement('div');
  const _dropRight = document.createElement('div');
  _dropLeft.className = 'drop-zone drop-left hidden';
  _dropRight.className = 'drop-zone drop-right hidden';
  _dropLeft.textContent = '◀ Left';
  _dropRight.textContent = 'Right ▶';
  xtermRoot.parentElement.appendChild(_dropLeft);
  xtermRoot.parentElement.appendChild(_dropRight);

  // Show drop zones when dragging a tab
  document.addEventListener('dragover', e => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    _dropLeft.classList.remove('hidden');
    _dropRight.classList.remove('hidden');
  });
  document.addEventListener('dragend', () => {
    _dropLeft.classList.add('hidden');
    _dropRight.classList.add('hidden');
  });

  _dropLeft.addEventListener('dragover', e => { e.preventDefault(); _dropLeft.classList.add('drop-hover'); });
  _dropLeft.addEventListener('dragleave', () => _dropLeft.classList.remove('drop-hover'));
  _dropRight.addEventListener('dragover', e => { e.preventDefault(); _dropRight.classList.add('drop-hover'); });
  _dropRight.addEventListener('dragleave', () => _dropRight.classList.remove('drop-hover'));

  _dropLeft.addEventListener('drop', e => {
    e.preventDefault();
    _dropLeft.classList.add('hidden'); _dropRight.classList.add('hidden');
    const sid = e.dataTransfer.getData('text/plain');
    _doSplit(sid, 'left');
  });
  _dropRight.addEventListener('drop', e => {
    e.preventDefault();
    _dropLeft.classList.add('hidden'); _dropRight.classList.add('hidden');
    const sid = e.dataTransfer.getData('text/plain');
    _doSplit(sid, 'right');
  });

  function _doSplit(sessionId, side) {
    if (!_split) {
      // Current active goes to the other side
      const currentSid = _tabs.find(t => t.id === _activeTabId)?.sessionId;
      _split = { left: null, right: null };
      if (side === 'left') {
        _split.left = sessionId;
        _split.right = currentSid !== sessionId ? currentSid : null;
      } else {
        _split.right = sessionId;
        _split.left = currentSid !== sessionId ? currentSid : null;
      }
    } else {
      _split[side] = sessionId;
    }
    _renderSplit();
  }

  function _renderSplit() {
    if (!_split) return;
    xtermRoot.classList.add('split-mode');

    // Ensure both pane containers exist
    let leftPane = xtermRoot.querySelector('.split-left');
    let rightPane = xtermRoot.querySelector('.split-right');
    if (!leftPane) {
      leftPane = document.createElement('div');
      leftPane.className = 'split-left';
      xtermRoot.appendChild(leftPane);
    }
    if (!rightPane) {
      rightPane = document.createElement('div');
      rightPane.className = 'split-right';
      xtermRoot.appendChild(rightPane);
    }

    // Move session divs into panes
    if (_split.left) Terminal.openInPane(_split.left, leftPane);
    if (_split.right) Terminal.openInPane(_split.right, rightPane);
  }

  function _unsplit() {
    _split = null;
    xtermRoot.classList.remove('split-mode');
    const leftPane = xtermRoot.querySelector('.split-left');
    const rightPane = xtermRoot.querySelector('.split-right');
    leftPane?.remove();
    rightPane?.remove();
    // Re-open active session normally
    const tab = _tabs.find(t => t.id === _activeTabId);
    if (tab) Terminal.open(tab.sessionId);
  }

  // ── Terminal status line ────────────────────────────────────────
  function _setStatus(session) {
    stSession.textContent = session.display_name || session.id || '';
    const proj = (State.get().projects||[]).find(p => session.id?.startsWith('cm-' + p.name.replace(/[.\s]/g,'_')));
    stGit.textContent = proj?.git?.branch ? (proj.git.branch + (proj.git.dirty?' *':'')) : '';
    stModel.textContent = '';
    stTokens.textContent = '';
    stCost.textContent = '';

    if (_statsTimer) clearInterval(_statsTimer);
    _pollStats(session.id);
    _statsTimer = setInterval(() => _pollStats(session.id), 5000);
  }

  async function _pollStats(sid) {
    if (!sid) return;
    try {
      const s = await API.get('/api/sessions/' + sid + '/stats');
      const m = (s.model||'').replace(/^claude-/,'').replace(/-\d{8}$/,'');
      stModel.textContent = m || '';
      stTokens.textContent = s.total_tokens
        ? (_k(s.input_tokens) + ' in ' + _k(s.output_tokens) + ' out  ' + s.context_pct + '% ctx')
        : '';
      stCost.textContent = s.cost_usd ? ('$' + s.cost_usd.toFixed(4)) : '';
    } catch(e) {}
  }

  function _clearStatus() {
    if (_statsTimer) { clearInterval(_statsTimer); _statsTimer = null; }
    [stSession, stGit, stModel, stTokens, stCost].forEach(el => el.textContent = '');
  }

  function _k(n) { return n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n); }

  // ── New Session modal ──────────────────────────────────────────
  const nsModal = document.getElementById('modal-new-session');
  const nsSel   = document.getElementById('ns-project');
  const nsGroup = document.getElementById('ns-project-group');

  function openNewSessionModal(project) {
    if (project) {
      nsSel.innerHTML = '<option value="' + _e(project.path) + '">' + _e(project.name) + '</option>';
      nsGroup.style.display = 'none';
    } else {
      nsSel.innerHTML = (State.get().projects||[]).map(p => '<option value="' + _e(p.path) + '">' + _e(p.name) + '</option>').join('');
      nsGroup.style.display = '';
    }
    document.getElementById('ns-name').value = '';
    nsModal.classList.remove('hidden');
  }

  document.getElementById('ns-cancel')?.addEventListener('click', () => nsModal.classList.add('hidden'));
  document.getElementById('ns-create')?.addEventListener('click', async () => {
    nsModal.classList.add('hidden');
    const session = await API.post('/api/sessions/', {
      project_dir: nsSel.value,
      display_name: document.getElementById('ns-name').value.trim(),
      skip_permissions: document.getElementById('ns-skip-perm').checked,
    });
    await Sidebar.load();
    openSession(session);
  });

  // ── Add Project modal ──────────────────────────────────────────
  const apModal = document.getElementById('modal-add-project');
  const apPath  = document.getElementById('ap-path');

  document.getElementById('btn-add-project')?.addEventListener('click', () => {
    apPath.value = '';
    apModal.classList.remove('hidden');
    apPath.focus();
  });
  document.getElementById('ap-browse')?.addEventListener('click', () => {
    _openBrowsePopup(path => { apPath.value = path; });
  });
  document.getElementById('ap-cancel')?.addEventListener('click', () => apModal.classList.add('hidden'));
  document.getElementById('ap-add')?.addEventListener('click', async () => {
    const path = apPath.value.trim();
    if (!path) return;
    apModal.classList.add('hidden');
    const cfg = await API.get('/api/settings/');
    const dirs = cfg.project_dirs || [];
    if (!dirs.includes(path)) { dirs.push(path); await API.put('/api/settings/', { ...cfg, project_dirs: dirs }); }
    await Sidebar.load();
  });

  // ── Directory browser popup ───────────────────────────────────
  let _browseCallback = null;

  function _openBrowsePopup(callback) {
    _browseCallback = callback;
    const w = 650, h = 500;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    window.open('/browse', 'dir-browser', `width=${w},height=${h},left=${left},top=${top},resizable=yes`);
  }

  // Called by browse popup when user selects a directory
  window._onDirSelected = function(path) {
    if (_browseCallback) {
      _browseCallback(path);
      _browseCallback = null;
    }
  };

  // ── SSE ────────────────────────────────────────────────────────
  function _subscribeSSE() {
    const es = new EventSource('/api/events');
    es.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === 'session_state') Sidebar.updateSessionBadge(d.session_id, d.state);
      } catch(_) {}
    };
  }

  // ── Welcome ────────────────────────────────────────────────────
  async function _loadRecent() {
    const sessions = await API.get('/api/history/');
    State.set({ historySessions: sessions });
    const c = document.getElementById('recent-sessions');
    c.innerHTML = '';
    sessions.slice(0, 6).forEach(s => {
      const card = document.createElement('div');
      card.className = 'recent-card';
      card.innerHTML = '<div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
        + _e(s.title||s.first_prompt||s.session_id) + '</div>'
        + '<div style="font-size:11px;color:var(--text-dim);margin-top:4px">' + _e((s.cwd||'').split(/[\\/]/).pop()) + '</div>';
      card.addEventListener('click', () => showPanel('history'));
      c.appendChild(card);
    });
  }

  function _e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  document.addEventListener('DOMContentLoaded', init);

  return { init, showPanel, openSession, openProject, openNewSessionModal };
})();
