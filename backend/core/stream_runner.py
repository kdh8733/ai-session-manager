from __future__ import annotations

"""
Stream session runner: spawns claude CLI directly (no tmux) and streams
stdout over a WebSocket.

Supports --continue {session_id} for resuming a previous session.
"""
import subprocess
import threading
import uuid
from pathlib import Path

from backend.utils.platform import claude_bin_path

# Active stream processes: session_id → subprocess.Popen
_procs: dict[str, subprocess.Popen] = {}
_lock = threading.Lock()


def start(
    cfg: dict,
    project_dir: str = "",
    prompt: str = "",
    continue_id: str | None = None,
) -> str:
    """Spawn a claude CLI process and return a stream session ID."""
    session_id = str(uuid.uuid4())
    claude = claude_bin_path(cfg)

    cmd = [claude, "--output-format", "stream-json", "--print"]
    if continue_id:
        cmd += ["--continue", continue_id]
    if prompt:
        cmd.append(prompt)

    cwd = project_dir if project_dir and Path(project_dir).is_dir() else None

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=cwd,
        text=True,
        bufsize=1,
    )

    with _lock:
        _procs[session_id] = proc

    return session_id


def handle_ws(ws, session_id: str):
    """Stream process stdout to the WebSocket client."""
    with _lock:
        proc = _procs.get(session_id)

    if not proc:
        ws.send('{"error":"session not found"}')
        return

    try:
        for line in proc.stdout:
            if not ws.connected:
                break
            ws.send(line)
    except Exception:
        pass
    finally:
        proc.wait()
        with _lock:
            _procs.pop(session_id, None)
