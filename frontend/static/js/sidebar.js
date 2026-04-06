/**
 * sidebar.js — Project tree, session list, context menus.
 * Each session gets a persistent random accent color.
 */

const Sidebar = (() => {
  const tree = document.getElementById('project-tree');
  const pctx = document.getElementById('project-ctx-menu');
  const sctx = document.getElementById('session-ctx-menu');
  let _ctxProject = null;
  let _ctxSession = null;

  // Session color palette — distinct, readable colors
  const SESSION_COLORS = [
    '#f38ba8', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5',
    '#89dceb', '#89b4fa', '#b4befe', '#cba6f7', '#f5c2e7',
    '#eba0ac', '#f2cdcd', '#74c7ec', '#a6adc8', '#f5e0dc',
  ];

  // Persistent color map: session_id → color
  const _colorMap = {};

  function _getSessionColor(sessionId) {
    if (!_colorMap[sessionId]) {
      // Hash-based deterministic color
      let hash = 0;
      for (let i = 0; i < sessionId.length; i++) {
        hash = ((hash << 5) - hash) + sessionId.charCodeAt(i);
        hash |= 0;
      }
      _colorMap[sessionId] = SESSION_COLORS[Math.abs(hash) % SESSION_COLORS.length];
    }
    return _colorMap[sessionId];
  }

  async function load() {
    const [projects, sessions] = await Promise.all([
      API.get('/api/projects/'),
      API.get('/api/sessions/'),
    ]);
    State.set({ projects, sessions });
    _render(projects, sessions);
  }

  function _render(projects, sessions) {
    tree.innerHTML = '';
    const activeId = State.get().activeSessionId;

    const byProj = {};
    sessions.forEach(s => {
      const m = s.id.match(/^cm-(.+)-\d+$/);
      const k = m ? m[1] : 'other';
      (byProj[k] = byProj[k] || []).push(s);
    });

    projects.filter(p => !p.hidden).forEach(p => {
      const el = document.createElement('div');

      // Project header
      const hdr = document.createElement('div');
      hdr.className = 'project-item';
      hdr.dataset.key = p.key;
      hdr.dataset.path = p.path;
      const git = p.git?.branch
        ? `<span class="project-git${p.git.dirty?' dirty':''}">${_e(p.git.branch)}${p.git.dirty?'*':''}</span>` : '';
      hdr.innerHTML = `<span>📁</span><span class="project-name">${_e(p.name)}</span>${git}`;

      hdr.addEventListener('click', () => { App.openProject(p); _setActive(p.key); });
      hdr.addEventListener('contextmenu', e => { e.preventDefault(); _showPctx(e, p); });
      el.appendChild(hdr);

      // Sessions under project
      (byProj[_san(p.name)] || []).forEach(s => {
        const se = document.createElement('div');
        const isActive = s.id === activeId;
        const color = _getSessionColor(s.id);
        se.className = 'session-item' + (isActive ? ' active' : '');
        se.dataset.sessionId = s.id;

        if (isActive) {
          se.style.borderLeft = `3px solid ${color}`;
          se.style.background = color + '18'; // 10% opacity
          se.style.color = color;
        }

        se.innerHTML = `<span class="session-color-dot" style="background:${color};width:8px;height:8px;border-radius:50%;flex-shrink:0"></span>
                        <span class="session-name">${_e(s.display_name||s.id)}</span>`;
        se.addEventListener('click', e => { e.stopPropagation(); App.openSession(s); });
        se.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); _showSctx(e, s); });
        el.appendChild(se);
      });

      tree.appendChild(el);
    });
  }

  function _setActive(key) {
    tree.querySelectorAll('.project-item').forEach(el => el.classList.toggle('active', el.dataset.key === key));
  }

  function highlightSession(sessionId) {
    // Clear all session highlights
    tree.querySelectorAll('.session-item').forEach(el => {
      el.classList.remove('active');
      el.style.borderLeft = '';
      el.style.background = '';
      el.style.color = '';
    });

    // Highlight the active one
    if (sessionId) {
      const el = tree.querySelector(`[data-session-id="${sessionId}"]`);
      if (el) {
        const color = _getSessionColor(sessionId);
        el.classList.add('active');
        el.style.borderLeft = `3px solid ${color}`;
        el.style.background = color + '18';
        el.style.color = color;
      }
    }
  }

  function getSessionColor(sessionId) {
    return _getSessionColor(sessionId);
  }

  function updateSessionBadge(sid, state) {
    const el = tree.querySelector(`[data-session-id="${sid}"] .session-badge`);
    if (el) el.className = `session-badge badge-${state}`;
  }

  // ── Project context menu ──────────────────────────────────────
  function _showPctx(e, p) {
    _hideAll();
    _ctxProject = p;
    pctx.style.left = e.clientX + 'px';
    pctx.style.top = e.clientY + 'px';
    pctx.classList.remove('hidden');
  }

  document.getElementById('pctx-new-session')?.addEventListener('click', () => {
    if (_ctxProject) App.openNewSessionModal(_ctxProject);
    _hideAll();
  });
  document.getElementById('pctx-hide-project')?.addEventListener('click', async () => {
    if (!_ctxProject) return;
    await API.post(`/api/projects/${encodeURIComponent(_ctxProject.key)}/hide`);
    _hideAll(); load();
  });
  document.getElementById('pctx-remove-project')?.addEventListener('click', async () => {
    if (!_ctxProject) return;
    const cfg = await API.get('/api/settings/');
    const dirs = (cfg.project_dirs || []).filter(d => d !== _ctxProject.path);
    await API.put('/api/settings/', { ...cfg, project_dirs: dirs });
    _hideAll(); load();
  });

  // ── Session context menu ──────────────────────────────────────
  function _showSctx(e, s) {
    _hideAll();
    _ctxSession = s;
    sctx.style.left = e.clientX + 'px';
    sctx.style.top = e.clientY + 'px';
    sctx.classList.remove('hidden');
  }

  document.getElementById('sctx-rename')?.addEventListener('click', async () => {
    if (!_ctxSession) return;
    const name = prompt('New session name:', _ctxSession.display_name || _ctxSession.id);
    if (name && name.trim()) {
      await API.post(`/api/sessions/${_ctxSession.id}/rename`, { display_name: name.trim() });
      load();
    }
    _hideAll();
  });

  document.getElementById('sctx-delete')?.addEventListener('click', async () => {
    if (!_ctxSession) return;
    if (confirm(`Delete session "${_ctxSession.display_name || _ctxSession.id}"?`)) {
      Terminal.close(_ctxSession.id);
      await API.del(`/api/sessions/${_ctxSession.id}`);
      load();
    }
    _hideAll();
  });

  function _hideAll() {
    pctx?.classList.add('hidden'); sctx?.classList.add('hidden');
    _ctxProject = null; _ctxSession = null;
  }
  document.addEventListener('click', _hideAll);
  document.getElementById('btn-refresh-projects')?.addEventListener('click', load);

  function _san(n) { return n.replace(/[.\s]/g, '_'); }
  function _e(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { load, updateSessionBadge, highlightSession, getSessionColor };
})();
