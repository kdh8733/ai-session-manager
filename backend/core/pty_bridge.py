"""
PTY bridge: WebSocket <-> tmux attach-session via ptyprocess.

Architecture:
  - On WS connect: send scrollback, then spawn `tmux attach -t {sid}`
  - Reader thread: pty output → WS
  - Main thread: WS input → pty
  - On WS disconnect: kill the attach process (tmux session stays alive)
  - Single-writer: each new attach kills previous attach processes for that session
"""
import json
import os
import signal
import subprocess
import threading

import ptyprocess

from backend.core.tmux_session import capture_pane, _session_exists
from backend.utils.platform import tmux_bin


# Track active attach PIDs per session for single-writer enforcement
_active_attaches: dict[str, int] = {}
_attach_lock = threading.Lock()


def handle(ws, session_id: str):
    """Bridge a WebSocket connection to a tmux session."""
    if not _session_exists(session_id):
        try:
            ws.send("\x1b[31m[Session not found]\x1b[0m\r\n")
        except Exception:
            pass
        return

    # Single-writer: kill any existing attach for this session
    _kill_existing_attach(session_id)

    # 1. Send scrollback first
    try:
        scrollback = capture_pane(session_id)
        if scrollback:
            ws.send(scrollback)
    except Exception:
        pass

    # 2. Spawn tmux attach-session via ptyprocess
    try:
        pty = ptyprocess.PtyProcess.spawn(
            [tmux_bin(), "attach-session", "-t", session_id],
            dimensions=(50, 220),
        )
    except Exception as exc:
        try:
            ws.send(f"\x1b[31m[Failed to attach: {exc}]\x1b[0m\r\n")
        except Exception:
            pass
        return

    # Track this attach
    with _attach_lock:
        _active_attaches[session_id] = pty.pid

    stop = threading.Event()

    # 3. Reader thread: pty → WS
    def reader():
        while not stop.is_set():
            try:
                data = pty.read(1024)
                if not data:
                    break
                ws.send(data.decode("utf-8", errors="replace"))
            except EOFError:
                break
            except Exception:
                if stop.is_set():
                    break
                continue
        stop.set()

    reader_thread = threading.Thread(target=reader, daemon=True)
    reader_thread.start()

    # 4. Main thread: WS → pty
    try:
        while not stop.is_set():
            try:
                msg = ws.receive(timeout=1)
            except Exception:
                break

            if msg is None:
                continue

            if isinstance(msg, str):
                # Check for resize messages
                if msg.startswith("{"):
                    try:
                        obj = json.loads(msg)
                        if obj.get("type") == "resize":
                            cols = obj.get("cols", 220)
                            rows = obj.get("rows", 50)
                            pty.setwinsize(rows, cols)
                            # Also resize the tmux window
                            try:
                                subprocess.run(
                                    [tmux_bin(), "resize-window", "-t", session_id,
                                     "-x", str(cols), "-y", str(rows)],
                                    capture_output=True, timeout=5,
                                )
                            except Exception:
                                pass
                            continue
                    except json.JSONDecodeError:
                        pass
                pty.write(msg.encode("utf-8"))
            elif isinstance(msg, bytes):
                pty.write(msg)
    finally:
        stop.set()

        # Cleanup: terminate the attach process
        try:
            pty.terminate(force=True)
        except Exception:
            pass

        with _attach_lock:
            if _active_attaches.get(session_id) == pty.pid:
                _active_attaches.pop(session_id, None)

        reader_thread.join(timeout=2)


def _kill_existing_attach(session_id: str) -> None:
    """Kill any existing tmux attach process for this session."""
    with _attach_lock:
        pid = _active_attaches.pop(session_id, None)
    if pid:
        try:
            os.kill(pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
