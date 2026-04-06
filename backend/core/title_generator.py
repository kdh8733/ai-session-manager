"""
Session title auto-generation using Claude API.

Priority: @display_name > JSONL custom-title > AI generated > first_prompt
Titles are cached in ~/.config/claude-manager/titles.json
"""
import json
import threading
from pathlib import Path

from backend.core import config as cfg_mod

_FILE = cfg_mod.CONFIG_DIR / "titles.json"
_lock = threading.Lock()


def _load_cache() -> dict:
    if _FILE.exists():
        try:
            return json.loads(_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {}


def _save_cache(cache: dict) -> None:
    cfg_mod.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _FILE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


def get_title(session_id: str, first_prompt: str, custom_title: str = "") -> str:
    """Return the best available title for a session."""
    if custom_title:
        return custom_title

    with _lock:
        cache = _load_cache()
        if session_id in cache:
            return cache[session_id]

    # Generate via Claude API
    generated = _generate(first_prompt)
    if generated:
        with _lock:
            cache = _load_cache()
            cache[session_id] = generated
            _save_cache(cache)
        return generated

    return first_prompt[:60] if first_prompt else session_id


def _generate(prompt: str) -> str:
    if not prompt:
        return ""
    try:
        import anthropic
        client = anthropic.Anthropic()
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=60,
            messages=[{
                "role": "user",
                "content": (
                    f"Generate a concise title (max 8 words) for a coding session "
                    f"that starts with this prompt. Reply with only the title, no quotes.\n\n{prompt[:500]}"
                ),
            }],
        )
        return msg.content[0].text.strip()
    except Exception:
        return ""
