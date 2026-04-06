"""Notification API: receives hook POSTs and broadcasts via SSE."""
import json
import queue
import threading
from flask import Blueprint, Response, request, jsonify, stream_with_context

bp = Blueprint("notify", __name__, url_prefix="/api")

# Global subscriber registry: list of queues, one per SSE client
_subscribers: list[queue.Queue] = []
_lock = threading.Lock()


def _broadcast(event: dict):
    payload = json.dumps(event)
    with _lock:
        dead = []
        for q in _subscribers:
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            _subscribers.remove(q)


@bp.post("/notify")
def notify():
    """Called by cm-notify.sh when a Claude task completes."""
    data = request.get_json(force=True, silent=True) or {}
    session_id = data.get("session_id", "")
    state = data.get("state", "completed")

    from backend.core import session_state
    if session_id:
        session_state.set(session_id, state)

    _broadcast({"type": "session_state", "session_id": session_id, "state": state})
    return jsonify({"ok": True})


@bp.get("/events")
def events():
    """SSE endpoint — browser subscribes here for real-time updates."""
    q: queue.Queue = queue.Queue(maxsize=50)
    with _lock:
        _subscribers.append(q)

    def generate():
        try:
            yield "data: {\"type\":\"connected\"}\n\n"
            while True:
                try:
                    payload = q.get(timeout=25)
                    yield f"data: {payload}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            with _lock:
                if q in _subscribers:
                    _subscribers.remove(q)

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
