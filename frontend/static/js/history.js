/**
 * history.js — History viewer panel
 *
 * - Loads session list from GET /api/history/
 * - Renders turns: user/assistant, markdown, code highlighting, thinking blocks
 * - Token stats per turn
 * - Bookmark button on each turn
 * - Search bar filters session list
 */

const HistoryViewer = (() => {
  const list = document.getElementById('history-list');
  const viewer = document.getElementById('history-viewer');
  const searchInput = document.getElementById('history-search');

  let _sessions = [];
  let _activeSession = null;

  async function load() {
    const sessions = await API.get('/api/history/');
    _sessions = sessions;
    _render(sessions);
  }

  function _render(sessions) {
    list.innerHTML = '';
    sessions.forEach(s => {
      const el = document.createElement('div');
      el.className = 'history-session' + (s.session_id === _activeSession ? ' active' : '');
      el.innerHTML = `
        <div class="history-title">${_esc(s.title || s.first_prompt || s.session_id)}</div>
        <div class="history-meta">${_esc(s.cwd ? s.cwd.split('/').pop() || s.cwd : '')} · ${s.turn_count} turns · ${_fmtDate(s.updated_at)}</div>
      `;
      el.addEventListener('click', () => _openSession(s));
      list.appendChild(el);
    });
  }

  async function _openSession(s) {
    _activeSession = s.session_id;
    // update active class
    list.querySelectorAll('.history-session').forEach(el => el.classList.remove('active'));
    list.querySelector(`[data-id="${s.session_id}"]`)?.classList.add('active');

    viewer.innerHTML = '<div style="padding:20px;color:var(--text-dim)">불러오는 중...</div>';

    const turns = await API.get(`/api/history/${s.session_id}`);
    _renderTurns(s, turns);
  }

  function _renderTurns(session, turns) {
    viewer.innerHTML = `
      <div style="padding:16px 0 8px;border-bottom:1px solid var(--border);margin-bottom:16px;">
        <h3>${_esc(session.title || session.first_prompt || session.session_id)}</h3>
        <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${_esc(session.cwd)}</div>
      </div>
    `;

    turns.forEach((turn, idx) => {
      const el = _buildTurnEl(turn, idx, session.session_id);
      viewer.appendChild(el);
    });
  }

  function _buildTurnEl(turn, idx, sessionId) {
    const el = document.createElement('div');
    el.className = 'turn';

    // Header
    const headerEl = document.createElement('div');
    headerEl.className = 'turn-header';

    const roleEl = document.createElement('span');
    roleEl.className = `turn-role ${turn.role}`;
    roleEl.textContent = turn.role === 'user' ? 'User' : 'Assistant';

    const tsEl = document.createElement('span');
    tsEl.textContent = turn.timestamp ? _fmtDate(new Date(turn.timestamp).getTime() / 1000) : '';

    // Bookmark button
    const bmBtn = document.createElement('button');
    bmBtn.className = 'btn-micro';
    bmBtn.title = '북마크';
    bmBtn.textContent = '🔖';
    bmBtn.style.marginLeft = 'auto';
    bmBtn.addEventListener('click', () => _addBookmark(sessionId, idx, turn.text));

    headerEl.append(roleEl, tsEl, bmBtn);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'turn-body';
    bodyEl.innerHTML = _renderMarkdown(turn.text || '');

    // Thinking blocks
    if (turn.thinking && turn.thinking.length > 0) {
      const details = document.createElement('details');
      details.className = 'turn-thinking';
      const summary = document.createElement('summary');
      summary.textContent = `💭 Thinking (${turn.thinking.length})`;
      details.appendChild(summary);
      const pre = document.createElement('pre');
      pre.textContent = turn.thinking.join('\n\n---\n\n');
      details.appendChild(pre);
      bodyEl.appendChild(details);
    }

    // Tool calls
    if (turn.tool_calls && turn.tool_calls.length > 0) {
      const toolEl = document.createElement('div');
      toolEl.className = 'turn-tools';
      toolEl.textContent = '🔧 ' + turn.tool_calls.map(t => t.name).join(', ');
      bodyEl.appendChild(toolEl);
    }

    // Token info (assistant only)
    if (turn.usage && (turn.usage.input_tokens || turn.usage.output_tokens)) {
      const u = turn.usage;
      const tokenEl = document.createElement('div');
      tokenEl.className = 'turn-token-info';
      tokenEl.innerHTML = `
        <span>↑ ${_fmtNum(u.input_tokens)}</span>
        <span>↓ ${_fmtNum(u.output_tokens)}</span>
        ${u.cache_creation_input_tokens ? `<span>💾w ${_fmtNum(u.cache_creation_input_tokens)}</span>` : ''}
        ${u.cache_read_input_tokens ? `<span>💾r ${_fmtNum(u.cache_read_input_tokens)}</span>` : ''}
        ${turn.model ? `<span style="margin-left:auto">${_esc(turn.model)}</span>` : ''}
      `;
      bodyEl.appendChild(tokenEl);
    }

    el.append(headerEl, bodyEl);
    return el;
  }

  function _addBookmark(sessionId, turnIndex, snippet) {
    API.post('/api/bookmarks/', {
      session_id: sessionId,
      turn_index: turnIndex,
      snippet: (snippet || '').slice(0, 200),
      tags: [],
    }).then(() => {
      State.emit('bookmarkAdded');
    });
  }

  // ── Search ──────────────────────────────────────────────────────
  let _searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      if (!q) {
        _render(_sessions);
      } else {
        API.get(`/api/history/search?q=${encodeURIComponent(q)}`).then(results => {
          _render(results);
        });
      }
    }, 300);
  });

  // ── Helpers ─────────────────────────────────────────────────────
  function _renderMarkdown(text) {
    if (typeof marked === 'undefined') return `<pre>${_esc(text)}</pre>`;
    const html = marked.parse(text, { gfm: true, breaks: true });
    // highlight code blocks after render
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    wrapper.querySelectorAll('pre code').forEach(el => {
      if (typeof hljs !== 'undefined') hljs.highlightElement(el);
    });
    return wrapper.innerHTML;
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _fmtDate(epoch) {
    if (!epoch) return '';
    const d = new Date(epoch * 1000);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function _fmtNum(n) {
    return (n || 0).toLocaleString();
  }

  return { load };
})();
