"""Favorites persistence: ~/.config/claude-manager/favorites.json"""
import json
import time
import uuid
from pathlib import Path
from backend.core import config as cfg_mod

_FILE = cfg_mod.CONFIG_DIR / "favorites.json"


def _load() -> list[dict]:
    if _FILE.exists():
        try:
            return json.loads(_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return []


def _save(data: list[dict]) -> None:
    cfg_mod.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def all() -> list[dict]:
    return _load()


def search(q: str) -> list[dict]:
    q = q.lower()
    return [
        item for item in _load()
        if q in item.get("title", "").lower()
        or q in item.get("project", "").lower()
        or any(q in n.get("text", "").lower() for n in item.get("notes", []))
    ]


def add(session_id: str, title: str = "", project: str = "") -> dict:
    data = _load()
    item = {
        "session_id": session_id,
        "title": title,
        "project": project,
        "added_at": time.time(),
        "notes": [],
    }
    data.append(item)
    _save(data)
    return item


def remove(session_id: str) -> None:
    data = [item for item in _load() if item["session_id"] != session_id]
    _save(data)


def add_note(session_id: str, text: str) -> dict:
    data = _load()
    note = {"id": str(uuid.uuid4()), "text": text, "created_at": time.time()}
    for item in data:
        if item["session_id"] == session_id:
            item.setdefault("notes", []).append(note)
            break
    _save(data)
    return note


def delete_note(session_id: str, note_index: int) -> None:
    data = _load()
    for item in data:
        if item["session_id"] == session_id:
            notes = item.get("notes", [])
            if 0 <= note_index < len(notes):
                notes.pop(note_index)
            break
    _save(data)
