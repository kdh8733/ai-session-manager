"""Stream session API: spawn claude CLI directly, stream stdout over WebSocket."""
from flask import Blueprint, jsonify, request, current_app
from flask_sock import Sock

bp = Blueprint("stream", __name__, url_prefix="/api/stream")


@bp.post("/")
def start_stream():
    """Start a stream session (non-tmux, direct spawn)."""
    cfg = current_app.config["CM"]
    data = request.get_json(force=True)
    project_dir = data.get("project_dir", "")
    prompt = data.get("prompt", "")
    continue_id = data.get("continue_id")  # --continue {session_id}

    from backend.core import stream_runner
    session_id = stream_runner.start(cfg, project_dir=project_dir, prompt=prompt, continue_id=continue_id)
    return jsonify({"session_id": session_id}), 201


def register_ws(sock: Sock):
    from backend.core import stream_runner

    @sock.route("/ws/stream/<session_id>")
    def stream_ws(ws, session_id: str):
        stream_runner.handle_ws(ws, session_id)
