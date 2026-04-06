"""
tmux_session.py -- tmux-based session manager for Linux/WSL.

Each session is a tmux session named cm-{project}-{index}.
Metadata stored as tmux user options: @display_name, @jsonl_id.

Sessions persist across server restarts (tmux keeps them alive).
The PTY bridge attaches to tmux sessions via ptyprocess.
"""
import json
import os
import re
import shlex
import subprocess
import threading
import time
from pathlib import Path

from backend.core import session_state
from backend.utils.platform import config_dir, claude_data_dir, tmux_run, claude_bin_path

SESSION_PREFIX = "cm-"


# ---------------------------------------------------------------------------
# tmux helpers
# ---------------------------------------------------------------------------

def _tmux(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return tmux_run(*args, check=check)


def _tmux_get_option(session_id: str, option: str) -> str:
    """Read a tmux user option (@...) from a session."""
    try:
        r = _tmux("show-options", "-t", session_id, "-v", option, check=False)
        if r.returncode == 0:
            return r.stdout.strip()
    except Exception:
        pass
    return ""


def _tmux_set_option(session_id: str, option: str, value: str) -> None:
    """Set a tmux user option on a session."""
    try:
        _tmux("set-option", "-t", session_id, option, value, check=False)
    except Exception:
        pass


def _sanitize_name(name: str) -> str:
    """Replace characters that tmux treats specially."""
    return re.sub(r"[.\s/\\]", "_", name)


def _next_index(project: str) -> int:
    """Find the next available index for a project."""
    prefix = f"{SESSION_PREFIX}{project}-"
    existing = []
    try:
        r = _tmux("list-sessions", "-F", "#{session_name}", check=False)
        if r.returncode == 0:
            for name in r.stdout.strip().splitlines():
                if name.startswith(prefix):
                    suffix = name[len(prefix):]
                    if suffix.isdigit():
                        existing.append(int(suffix))
    except Exception:
        pass
    return max(existing, default=0) + 1


def _session_exists(session_id: str) -> bool:
    """Check if a tmux session exists."""
    r = _tmux("has-session", "-t", session_id, check=False)
    return r.returncode == 0


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_sessions(cfg: dict) -> list[dict]:
    """List all cm-* tmux sessions with metadata."""
    try:
        r = _tmux("list-sessions", "-F", "#{session_name}\t#{session_created}", check=False)
        if r.returncode != 0:
            return []
    except Exception:
        return []

    sessions = []
    for line in r.stdout.strip().splitlines():
        parts = line.split("\t", 1)
        name = parts[0]
        if not name.startswith(SESSION_PREFIX):
            continue

        created = float(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0

        display_name = _tmux_get_option(name, "@display_name") or name
        jsonl_id = _tmux_get_option(name, "@jsonl_id")
        project_dir = _tmux_get_option(name, "@project_dir")
        state = session_state.get(name)

        sessions.append({
            "id": name,
            "display_name": display_name,
            "jsonl_id": jsonl_id,
            "project_dir": project_dir,
            "created": created,
            "attached": _is_attached(name),
            "state": state,
        })

    return sessions


def create_session(
    cfg: dict,
    project_dir: str,
    display_name: str = "",
    skip_permissions: bool = True,
) -> dict:
    """Create a new tmux session running Claude CLI."""
    project = _sanitize_name(Path(project_dir).name or "default")
    idx = _next_index(project)
    session_id = f"{SESSION_PREFIX}{project}-{idx}"

    # Determine working directory
    cwd = project_dir if project_dir and Path(project_dir).is_dir() else str(Path.home())

    # Create tmux session (starts with a shell)
    _tmux(
        "new-session", "-d",
        "-s", session_id,
        "-x", "220", "-y", "50",
        "-c", cwd,
    )

    # Store metadata as tmux options
    _tmux_set_option(session_id, "@display_name", display_name or session_id)
    _tmux_set_option(session_id, "@project_dir", project_dir)

    # Build and send the claude command
    claude = claude_bin_path(cfg)
    cmd_parts = [claude]
    if display_name:
        cmd_parts += ["-n", display_name]
    if skip_permissions:
        cmd_parts.append("--dangerously-skip-permissions")

    cmd_str = " ".join(shlex.quote(p) for p in cmd_parts)
    _tmux("send-keys", "-t", session_id, cmd_str, "Enter")

    session_state.set(session_id, "running")

    # Bind JSONL asynchronously
    threading.Thread(
        target=_bind_jsonl,
        args=(cfg, session_id, project_dir),
        daemon=True,
    ).start()

    return {
        "id": session_id,
        "display_name": display_name or session_id,
        "jsonl_id": "",
        "project_dir": project_dir,
        "created": time.time(),
        "attached": False,
        "state": "running",
    }


def kill_session(cfg: dict, session_id: str) -> None:
    """Kill a tmux session."""
    _tmux("kill-session", "-t", session_id, check=False)
    session_state.remove(session_id)


def restart_claude(cfg: dict, session_id: str) -> None:
    """Send Ctrl-C to kill frozen Claude, then relaunch."""
    if not _session_exists(session_id):
        return
    # Send Ctrl-C
    _tmux("send-keys", "-t", session_id, "C-c", "")
    time.sleep(0.5)
    # Re-send claude command
    claude = claude_bin_path(cfg)
    _tmux("send-keys", "-t", session_id, claude, "Enter")
    session_state.set(session_id, "running")


def continue_session(cfg: dict, session_id: str, jsonl_id: str) -> dict:
    """Send claude --continue inside an existing tmux session."""
    if not _session_exists(session_id):
        return {"ok": False, "error": "session not found"}
    claude = claude_bin_path(cfg)
    if jsonl_id:
        cmd = f"{shlex.quote(claude)} --continue {shlex.quote(jsonl_id)}"
    else:
        cmd = f"{shlex.quote(claude)} --continue"
    _tmux("send-keys", "-t", session_id, cmd, "Enter")
    session_state.set(session_id, "running")
    return {"ok": True}


def get_session(session_id: str) -> dict | None:
    """Return session info dict if the tmux session exists."""
    if not _session_exists(session_id):
        return None
    return {
        "id": session_id,
        "display_name": _tmux_get_option(session_id, "@display_name") or session_id,
        "jsonl_id": _tmux_get_option(session_id, "@jsonl_id"),
        "project_dir": _tmux_get_option(session_id, "@project_dir"),
        "state": session_state.get(session_id),
    }


def rename_session(session_id: str, display_name: str) -> None:
    """Update the display name of a session."""
    _tmux_set_option(session_id, "@display_name", display_name)


def capture_pane(session_id: str, lines: int = 2000) -> str:
    """Capture the current pane content (scrollback) as text."""
    try:
        r = _tmux(
            "capture-pane", "-t", session_id, "-p",
            "-S", f"-{lines}",
            check=False,
        )
        if r.returncode == 0:
            return r.stdout
    except Exception:
        pass
    return ""


def cleanup_orphan_attaches() -> None:
    """Kill leftover tmux attach-session processes from previous server runs."""
    try:
        r = subprocess.run(
            ["pgrep", "-af", "tmux attach-session"],
            capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.strip().splitlines():
            parts = line.split(None, 1)
            if parts:
                try:
                    os.kill(int(parts[0]), 9)
                except (ProcessLookupError, ValueError, PermissionError):
                    pass
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_attached(session_id: str) -> bool:
    """Check if any client is attached to this session."""
    try:
        r = _tmux(
            "list-clients", "-t", session_id, "-F", "#{client_name}",
            check=False,
        )
        return r.returncode == 0 and bool(r.stdout.strip())
    except Exception:
        return False


def _bind_jsonl(cfg: dict, session_id: str, project_dir: str, timeout: int = 30) -> None:
    """Poll for matching JSONL file after session creation."""
    claude_dir = Path(cfg.get("claude_dir", "")) or claude_data_dir()
    projects_dir = claude_dir / "projects"
    deadline = time.time() + timeout
    seen: set[Path] = set()

    while time.time() < deadline:
        if not _session_exists(session_id):
            return
        if not projects_dir.exists():
            time.sleep(1)
            continue
        for jsonl_file in projects_dir.rglob("*.jsonl"):
            if jsonl_file in seen:
                continue
            seen.add(jsonl_file)
            try:
                cwd = _read_cwd_from_jsonl(jsonl_file)
                if cwd and _paths_match(cwd, project_dir):
                    _tmux_set_option(session_id, "@jsonl_id", jsonl_file.stem)
                    return
            except OSError:
                pass
        time.sleep(1)


def _read_cwd_from_jsonl(path: Path) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            line = f.readline()
            if not line:
                return ""
            return json.loads(line, strict=False).get("cwd", "")
    except (json.JSONDecodeError, OSError):
        return ""


def _paths_match(a: str, b: str) -> bool:
    """Compare two paths, resolving symlinks."""
    try:
        return Path(a).resolve() == Path(b).resolve()
    except Exception:
        return a == b
