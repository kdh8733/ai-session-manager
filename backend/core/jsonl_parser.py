from __future__ import annotations

"""
JSONL parser for Claude CLI history files.

Key rules (from ROADMAP):
  - json.loads(line, strict=False)  — thinking blocks contain control chars
  - f.readline() loop — never `for line in f:` (conflicts with f.tell())
  - Path recovery: read cwd field, don't reverse-decode the directory name
"""
import json
import os
from pathlib import Path
from typing import Iterator

from backend.core import config as cfg_mod
from backend.utils.platform import normalize_path


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _iter_lines(path: Path) -> Iterator[dict]:
    """Yield parsed JSON objects from a JSONL file."""
    with open(path, "r", encoding="utf-8") as f:
        while True:
            line = f.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line, strict=False)
            except json.JSONDecodeError:
                pass


def _hidden_sessions() -> set[str]:
    hidden_file = cfg_mod.CONFIG_DIR / "hidden_sessions.json"
    if hidden_file.exists():
        try:
            return set(json.loads(hidden_file.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            pass
    return set()


def _save_hidden_sessions(hidden: set[str]) -> None:
    cfg_mod.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    (cfg_mod.CONFIG_DIR / "hidden_sessions.json").write_text(
        json.dumps(sorted(hidden), indent=2), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def list_all_sessions(cfg: dict) -> list[dict]:
    """
    Scan ~/.claude/projects/ and return session metadata for each JSONL.
    Recovers project path from cwd field inside the JSONL.
    """
    claude_dir = Path(cfg.get("claude_dir", Path.home() / ".claude"))
    projects_dir = claude_dir / "projects"
    project_dirs = [Path(normalize_path(d)) for d in cfg.get("project_dirs", [])]
    hidden = _hidden_sessions()

    sessions = []
    if not projects_dir.exists():
        return sessions

    for jsonl_file in sorted(projects_dir.rglob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True):
        session_id = jsonl_file.stem
        if session_id in hidden:
            continue

        meta = _extract_metadata(jsonl_file)
        if not meta:
            continue

        # scope filter
        cwd = Path(meta.get("cwd", ""))
        if project_dirs and not any(
            _is_subpath(cwd, pd) for pd in project_dirs
        ):
            continue

        # skip plugin paths
        if ".claude/plugins" in str(jsonl_file):
            continue

        sessions.append({
            "session_id": session_id,
            "cwd": str(cwd),
            "title": meta.get("title", ""),
            "first_prompt": meta.get("first_prompt", ""),
            "model": meta.get("model", ""),
            "created_at": meta.get("created_at", 0),
            "updated_at": jsonl_file.stat().st_mtime,
            "turn_count": meta.get("turn_count", 0),
        })

    return sessions


def get_turns(cfg: dict, session_id: str) -> list[dict]:
    """Parse and return all conversation turns for a session."""
    path = _find_jsonl(cfg, session_id)
    if not path:
        return []

    turns = []
    for obj in _iter_lines(path):
        msg_type = obj.get("type", "")

        if msg_type == "user":
            turns.append(_parse_user_turn(obj))
        elif msg_type == "assistant":
            turns.append(_parse_assistant_turn(obj))
        elif msg_type == "summary":
            pass  # skip summary lines
        # other types (system, tool_result) handled inside turns

    return turns


def search(cfg: dict, query: str) -> list[dict]:
    """Full-text search across all JSONL sessions."""
    if not query:
        return []
    q = query.lower()
    results = []
    for session in list_all_sessions(cfg):
        session_id = session["session_id"]
        path = _find_jsonl(cfg, session_id)
        if not path:
            continue
        for obj in _iter_lines(path):
            text = _extract_text(obj)
            if q in text.lower():
                results.append({
                    "session_id": session_id,
                    "title": session.get("title", ""),
                    "cwd": session.get("cwd", ""),
                    "snippet": text[:200],
                })
                break  # one hit per session is enough
    return results


def set_hidden(session_id: str, hidden: bool) -> None:
    current = _hidden_sessions()
    if hidden:
        current.add(session_id)
    else:
        current.discard(session_id)
    _save_hidden_sessions(current)


# ---------------------------------------------------------------------------
# Turn parsers
# ---------------------------------------------------------------------------

def _parse_user_turn(obj: dict) -> dict:
    content = obj.get("message", {}).get("content", "")
    if isinstance(content, list):
        text = " ".join(
            c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"
        )
    else:
        text = str(content)

    return {
        "role": "user",
        "text": text,
        "timestamp": obj.get("timestamp", ""),
    }


def _parse_assistant_turn(obj: dict) -> dict:
    message = obj.get("message", {})
    content = message.get("content", [])
    usage = message.get("usage", {})
    model = message.get("model", "")

    text_parts = []
    tool_calls = []
    thinking_blocks = []

    for block in (content if isinstance(content, list) else []):
        btype = block.get("type", "")
        if btype == "text":
            text_parts.append(block.get("text", ""))
        elif btype == "thinking":
            thinking_blocks.append(block.get("thinking", ""))
        elif btype == "tool_use":
            tool_calls.append({
                "name": block.get("name", ""),
                "input": block.get("input", {}),
            })

    return {
        "role": "assistant",
        "text": "\n".join(text_parts),
        "thinking": thinking_blocks,
        "tool_calls": tool_calls,
        "model": model,
        "usage": {
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
            "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        },
        "timestamp": obj.get("timestamp", ""),
    }


# ---------------------------------------------------------------------------
# Metadata extraction (first pass, fast)
# ---------------------------------------------------------------------------

def _extract_metadata(path: Path) -> dict | None:
    """Extract session metadata from the first few lines of a JSONL file."""
    meta = {"cwd": "", "title": "", "first_prompt": "", "model": "", "created_at": 0, "turn_count": 0}
    try:
        with open(path, "r", encoding="utf-8") as f:
            turn_count = 0
            while True:
                line = f.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line, strict=False)
                except json.JSONDecodeError:
                    continue

                obj_type = obj.get("type", "")

                if obj_type in ("user", "assistant"):
                    turn_count += 1

                if not meta["cwd"] and obj.get("cwd"):
                    meta["cwd"] = obj["cwd"]
                    meta["created_at"] = _ts_to_epoch(obj.get("timestamp", ""))

                if obj_type == "summary" and obj.get("summary"):
                    meta["title"] = obj["summary"]

                # custom-title entry
                if obj.get("type") == "custom-title":
                    meta["title"] = obj.get("value", "")

                if not meta["first_prompt"] and obj_type == "user":
                    content = obj.get("message", {}).get("content", "")
                    if isinstance(content, list):
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                meta["first_prompt"] = c.get("text", "")[:200]
                                break
                    else:
                        meta["first_prompt"] = str(content)[:200]

                if not meta["model"] and obj_type == "assistant":
                    meta["model"] = obj.get("message", {}).get("model", "")

            meta["turn_count"] = turn_count
    except OSError:
        return None
    return meta


def _extract_text(obj: dict) -> str:
    content = obj.get("message", {}).get("content", "")
    if isinstance(content, list):
        return " ".join(
            c.get("text", "") or c.get("thinking", "")
            for c in content if isinstance(c, dict)
        )
    return str(content)


def _find_jsonl(cfg: dict, session_id: str) -> Path | None:
    claude_dir = Path(cfg.get("claude_dir", Path.home() / ".claude"))
    for p in (claude_dir / "projects").rglob(f"{session_id}.jsonl"):
        return p
    return None


def _is_subpath(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def _ts_to_epoch(ts: str) -> float:
    if not ts:
        return 0.0
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.timestamp()
    except (ValueError, AttributeError):
        return 0.0
