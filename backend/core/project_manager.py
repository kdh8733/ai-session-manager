"""
Project discovery and management.

Projects are derived from the cwd fields inside JSONL files — we never
reverse-decode the directory name encoding.
"""
import json
import subprocess
import time
from pathlib import Path

from backend.core import config as cfg_mod
from backend.core import jsonl_parser

# Simple in-process cache for git info: {path: (info, expires_at)}
_git_cache: dict[str, tuple[dict, float]] = {}
_GIT_TTL = 30  # seconds


def list_projects(cfg: dict) -> list[dict]:
    """Return discovered projects with git info."""
    hidden = _hidden_projects()
    order = _load_order()

    # Collect unique cwds from sessions
    sessions = jsonl_parser.list_all_sessions(cfg)
    cwd_set: dict[str, dict] = {}
    for s in sessions:
        cwd = s.get("cwd", "")
        if not cwd or cwd in cwd_set:
            continue
        cwd_set[cwd] = {"path": cwd, "session_count": 0}

    for s in sessions:
        cwd = s.get("cwd", "")
        if cwd in cwd_set:
            cwd_set[cwd]["session_count"] += 1

    projects = []
    for cwd, info in cwd_set.items():
        key = cwd
        projects.append({
            "key": key,
            "path": cwd,
            "name": Path(cwd).name,
            "hidden": key in hidden,
            "session_count": info["session_count"],
            "git": _git_info(cwd),
        })

    # Sort by user-defined order, then by path
    order_map = {k: i for i, k in enumerate(order)}
    projects.sort(key=lambda p: (order_map.get(p["key"], 9999), p["path"]))

    return projects


def set_hidden(project_key: str, hidden: bool) -> None:
    current = _hidden_projects()
    if hidden:
        current.add(project_key)
    else:
        current.discard(project_key)
    _save_hidden(current)


def save_order(order: list[str]) -> None:
    cfg_mod.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    (cfg_mod.CONFIG_DIR / "project_order.json").write_text(
        json.dumps(order, indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Git info
# ---------------------------------------------------------------------------

def _git_info(path: str) -> dict:
    now = time.time()
    if path in _git_cache:
        info, expires = _git_cache[path]
        if now < expires:
            return info

    info = _fetch_git_info(path)
    _git_cache[path] = (info, now + _GIT_TTL)
    return info


def _fetch_git_info(path: str) -> dict:
    try:
        branch = subprocess.check_output(
            ["git", "-C", path, "rev-parse", "--abbrev-ref", "HEAD"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip()
        status = subprocess.check_output(
            ["git", "-C", path, "status", "--porcelain"],
            stderr=subprocess.DEVNULL, text=True,
        )
        return {"branch": branch, "dirty": bool(status.strip())}
    except (subprocess.CalledProcessError, FileNotFoundError):
        return {"branch": "", "dirty": False}


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def _hidden_projects() -> set[str]:
    f = cfg_mod.CONFIG_DIR / "hidden_projects.json"
    if f.exists():
        try:
            return set(json.loads(f.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    return set()


def _save_hidden(hidden: set[str]) -> None:
    cfg_mod.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    (cfg_mod.CONFIG_DIR / "hidden_projects.json").write_text(
        json.dumps(sorted(hidden), indent=2), encoding="utf-8"
    )


def _load_order() -> list[str]:
    f = cfg_mod.CONFIG_DIR / "project_order.json"
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return []
