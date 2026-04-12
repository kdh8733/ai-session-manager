"""
session_store.py -- Persistent session metadata.

Survives full system reboots (unlike tmux options which vanish when tmux dies).
Stored at ~/.config/claude-manager/sessions.json.
"""
from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

from backend.utils.platform import config_dir

log = logging.getLogger(__name__)
_lock = threading.Lock()


def _path() -> Path:
    return config_dir() / "sessions.json"


def load() -> dict[str, dict]:
    """Return {session_id: {project_dir, display_name, jsonl_id}} or {}."""
    try:
        return json.loads(_path().read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write(data: dict) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def save(session_id: str, project_dir: str, display_name: str, jsonl_id: str = "") -> None:
    with _lock:
        data = load()
        data[session_id] = {
            "project_dir": project_dir,
            "display_name": display_name,
            "jsonl_id": jsonl_id,
        }
        _write(data)


def update_jsonl_id(session_id: str, jsonl_id: str) -> None:
    with _lock:
        data = load()
        if session_id in data:
            data[session_id]["jsonl_id"] = jsonl_id
            _write(data)


def remove(session_id: str) -> None:
    with _lock:
        data = load()
        if session_id in data:
            data.pop(session_id)
            _write(data)


def all_sessions() -> list[dict]:
    """Return list of stored session dicts (with 'id' key added)."""
    return [{"id": sid, **meta} for sid, meta in load().items()]
