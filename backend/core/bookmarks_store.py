"""Bookmarks persistence: ~/.config/claude-manager/bookmarks.json"""
import json
import time
import uuid
from backend.core import config as cfg_mod

_FILE = cfg_mod.CONFIG_DIR / "bookmarks.json"


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


def search(q: str = "", tag: str = "") -> list[dict]:
    q = q.lower()
    tag = tag.lower()
    results = []
    for item in _load():
        if q and q not in item.get("snippet", "").lower() \
                and not any(q in c.get("text", "").lower() for c in item.get("comments", [])):
            continue
        if tag and tag not in [t.lower() for t in item.get("tags", [])]:
            continue
        results.append(item)
    return results


def add(session_id: str, turn_index: int, snippet: str = "", tags: list[str] = None) -> dict:
    data = _load()
    item = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "turn_index": turn_index,
        "snippet": snippet,
        "tags": tags or [],
        "comments": [],
        "created_at": time.time(),
    }
    data.append(item)
    _save(data)
    return item


def remove(bookmark_id: str) -> None:
    data = [item for item in _load() if item["id"] != bookmark_id]
    _save(data)


def add_comment(bookmark_id: str, text: str) -> dict:
    data = _load()
    comment = {"id": str(uuid.uuid4()), "text": text, "created_at": time.time()}
    for item in data:
        if item["id"] == bookmark_id:
            item.setdefault("comments", []).append(comment)
            break
    _save(data)
    return comment


def delete_comment(bookmark_id: str, comment_index: int) -> None:
    data = _load()
    for item in data:
        if item["id"] == bookmark_id:
            comments = item.get("comments", [])
            if 0 <= comment_index < len(comments):
                comments.pop(comment_index)
            break
    _save(data)
