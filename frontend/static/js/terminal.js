/**
 * terminal.js — Multi-session terminal manager.
 *
 * Each session gets its own:
 *   - div inside #xterm-container
 *   - xterm.Terminal instance
 *   - WebSocket connection
 *   - FitAddon
 *
 * Switching sessions just shows/hides divs — no data loss, no mixing.
 */

const TerminalMgr = (() => {
  // session_id → { div, term, ws, fitAddon, retries, intentionalClose }
  const _sessions = {};
  let _activeId = null;

  const container   = document.getElementById('xterm-container');
  const searchBar   = document.getElementById('terminal-search-bar');
  const searchInput = document.getElementById('term-search-input');
  const ctxMenu     = document.getElementById('ctx-menu');

  /**
   * Open (or switch to) a session terminal.
   */
  function open(sessionId) {
    // Hide current
    if (_activeId && _sessions[_activeId]) {
      _sessions[_activeId].div.style.display = 'none';
    }

    _activeId = sessionId;

    // Already exists? Just show it.
    if (_sessions[sessionId]) {
      const s = _sessions[sessionId];
      s.div.style.display = '';
      _delayFit(s);
      return;
    }

    // Create new session terminal
    _createSession(sessionId, container);

    // Connect WebSocket
    _connectWs(sessionId);
  }

  function _createSession(sessionId, parentEl) {
    const div = document.createElement('div');
    div.className = 'xterm-session';
    parentEl.appendChild(div);

    const TermClass = window.Terminal;
    if (!TermClass) {
      div.innerHTML = '<div style="color:#f38ba8;padding:20px">xterm.js not loaded</div>';
      _sessions[sessionId] = { div, term: null, ws: null, fitAddon: null };
      return;
    }

    const term = new TermClass({
      fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace",
      fontSize: 14,
      cursorBlink: true,
      theme: {
        background: '#1e1e2e',
        foreground: '#cdd6f4',
        cursor: '#f5e0dc',
        selectionBackground: '#45475a',
      },
      scrollback: 10000,
    });

    let fitAddon = null;
    if (window.FitAddon) {
      fitAddon = new window.FitAddon.FitAddon();
      term.loadAddon(fitAddon);
    }

    if (window.SearchAddon) {
      term.loadAddon(new window.SearchAddon.SearchAddon());
    }

    term.open(div);

    // Keystrokes → WS
    term.onData(data => {
      const s = _sessions[sessionId];
      if (s?.ws?.readyState === WebSocket.OPEN) s.ws.send(data);
    });

    // Ctrl+F
    term.attachCustomKeyEventHandler(evt => {
      if (evt.ctrlKey && evt.key === 'f' && evt.type === 'keydown') {
        searchBar.classList.toggle('hidden');
        if (!searchBar.classList.contains('hidden')) searchInput.focus();
        return false;
      }
      return true;
    });

    // Resize observer
    new ResizeObserver(() => {
      const s = _sessions[sessionId];
      if (!s?.fitAddon || !s.term) return;
      try {
        s.fitAddon.fit();
        if (s.ws?.readyState === WebSocket.OPEN) {
          s.ws.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
        }
      } catch(e) {}
    }).observe(div);

    // Right-click
    div.addEventListener('contextmenu', e => {
      e.preventDefault();
      ctxMenu.style.left = e.clientX + 'px';
      ctxMenu.style.top  = e.clientY + 'px';
      ctxMenu.classList.remove('hidden');
    });

    // Click to activate this session (for split mode)
    div.addEventListener('mousedown', () => {
      if (_activeId !== sessionId) {
        _activeId = sessionId;
        // Notify app of focus change
        if (window._onTerminalFocus) window._onTerminalFocus(sessionId);
      }
    });

    const entry = { div, term, ws: null, fitAddon, retries: 0, intentionalClose: false };
    _sessions[sessionId] = entry;

    _delayFit(entry);
  }

  function _delayFit(s) {
    setTimeout(() => {
      try {
        s.fitAddon?.fit();
        s.term?.focus();
      } catch(e) {}
    }, 50);
    // Second fit for layout settling
    setTimeout(() => {
      try { s.fitAddon?.fit(); } catch(e) {}
    }, 200);
  }

  function _connectWs(sessionId) {
    const s = _sessions[sessionId];
    if (!s) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal/${sessionId}`);
    s.ws = ws;

    ws.onopen = () => {
      s.retries = 0;
      if (s.fitAddon) {
        try { s.fitAddon.fit(); } catch(e) {}
        ws.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
      }
    };

    ws.onmessage = evt => {
      if (s.term) s.term.write(typeof evt.data === 'string' ? evt.data : new Uint8Array(evt.data));
    };

    ws.onclose = () => {
      if (s.intentionalClose) return;
      if (s.retries < 5) {
        s.retries++;
        setTimeout(() => _connectWs(sessionId), 1000);
      } else if (s.term) {
        s.term.writeln('\r\n\x1b[31m[Disconnected]\x1b[0m');
      }
    };

    ws.onerror = () => {};
  }

  /**
   * Close and destroy a session terminal.
   */
  function close(sessionId) {
    if (!sessionId) sessionId = _activeId;
    const s = _sessions[sessionId];
    if (!s) return;

    s.intentionalClose = true;
    if (s.ws) { s.ws.close(); s.ws = null; }
    if (s.term) { s.term.dispose(); s.term = null; }
    if (s.div) { s.div.remove(); }
    delete _sessions[sessionId];

    if (_activeId === sessionId) _activeId = null;
  }

  /**
   * Close all terminals.
   */
  function closeAll() {
    for (const id of Object.keys(_sessions)) close(id);
  }

  /**
   * Move a session's terminal div into a specific pane container.
   * Used for split-pane mode.
   */
  function openInPane(sessionId, paneEl) {
    if (!_sessions[sessionId]) {
      _createSession(sessionId, paneEl);
      _connectWs(sessionId);
    } else {
      const s = _sessions[sessionId];
      paneEl.appendChild(s.div);
      s.div.style.display = '';
    }

    const s = _sessions[sessionId];
    if (s?.div) {
      // Force layout recalculation with multiple fit passes
      _delayFit(s);
      setTimeout(() => {
        try {
          s.fitAddon?.fit();
          if (s.ws?.readyState === WebSocket.OPEN) {
            s.ws.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
          }
        } catch(e) {}
      }, 400);
    }
  }

  /**
   * Force re-fit all visible sessions (e.g. after split layout change).
   */
  function refitAll() {
    for (const [id, s] of Object.entries(_sessions)) {
      if (s.div && s.div.style.display !== 'none' && s.fitAddon) {
        try {
          s.fitAddon.fit();
          if (s.ws?.readyState === WebSocket.OPEN) {
            s.ws.send(JSON.stringify({ type: 'resize', cols: s.term.cols, rows: s.term.rows }));
          }
        } catch(e) {}
      }
    }
  }

  // Context menu handlers
  document.addEventListener('click', () => ctxMenu?.classList.add('hidden'));
  document.getElementById('ctx-permissions')?.addEventListener('click', () => {
    const s = _sessions[_activeId];
    if (s?.ws?.readyState === WebSocket.OPEN) s.ws.send('/permissions\n');
    ctxMenu.classList.add('hidden');
  });
  document.getElementById('ctx-paste')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      const s = _sessions[_activeId];
      if (s?.ws?.readyState === WebSocket.OPEN) s.ws.send(text);
    } catch(_) {}
    ctxMenu.classList.add('hidden');
  });

  // Search
  searchInput?.addEventListener('keydown', e => {
    if (e.key === 'Escape') searchBar.classList.add('hidden');
  });

  return { open, close, closeAll, openInPane, refitAll };
})();

const Terminal = TerminalMgr;
