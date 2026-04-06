"""
Canonical session state store.
States: idle | running | waiting | completed
"""
import threading

_states: dict[str, str] = {}
_lock = threading.Lock()


def get(session_id: str) -> str:
    with _lock:
        return _states.get(session_id, "idle")


def set(session_id: str, state: str) -> None:
    with _lock:
        _states[session_id] = state


def all_states() -> dict[str, str]:
    with _lock:
        return dict(_states)


def remove(session_id: str) -> None:
    with _lock:
        _states.pop(session_id, None)
