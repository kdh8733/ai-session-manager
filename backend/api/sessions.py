"""Session management API endpoints."""
from flask import Blueprint, jsonify, request, current_app
from flask_sock import Sock

from backend.core import session_manager, session_state

bp = Blueprint("sessions", __name__, url_prefix="/api/sessions")


@bp.get("/")
def list_sessions():
    """List all tmux sessions managed by this tool."""
    cfg = current_app.config["CM"]
    sessions = session_manager.list_sessions(cfg)
    return jsonify(sessions)


@bp.post("/")
def create_session():
    """Create a new tmux-based Claude session."""
    cfg = current_app.config["CM"]
    data = request.get_json(force=True)
    project_dir = data.get("project_dir", "")
    display_name = data.get("display_name", "")
    skip_permissions = data.get("skip_permissions", True)

    result = session_manager.create_session(
        cfg,
        project_dir=project_dir,
        display_name=display_name,
        skip_permissions=skip_permissions,
    )
    return jsonify(result), 201


@bp.delete("/<session_id>")
def kill_session(session_id: str):
    cfg = current_app.config["CM"]
    session_manager.kill_session(cfg, session_id)
    return jsonify({"ok": True})


@bp.post("/<session_id>/rename")
def rename_session_endpoint(session_id: str):
    data = request.get_json(force=True)
    name = data.get("display_name", "")
    session = session_manager.get_session(session_id)
    if session and name:
        session_manager.rename_session(session_id, name)
    return jsonify({"ok": True})


@bp.post("/<session_id>/restart")
def restart_session(session_id: str):
    """Kill frozen Claude process inside tmux and relaunch."""
    cfg = current_app.config["CM"]
    session_manager.restart_claude(cfg, session_id)
    return jsonify({"ok": True})


@bp.post("/<session_id>/continue")
def continue_session(session_id: str):
    """Resume a previously interrupted session via --continue."""
    cfg = current_app.config["CM"]
    data = request.get_json(force=True)
    jsonl_id = data.get("jsonl_id", "")
    result = session_manager.continue_session(cfg, session_id, jsonl_id)
    return jsonify(result)


@bp.get("/<session_id>/state")
def get_state(session_id: str):
    state = session_state.get(session_id)
    return jsonify({"session_id": session_id, "state": state})


@bp.get("/<session_id>/stats")
def get_stats(session_id: str):
    """Live stats for the status bar: model, context usage, cost."""
    cfg = current_app.config["CM"]
    session = session_manager.get_session(session_id)
    if not session:
        return jsonify({"error": "not found"}), 404

    from backend.core import jsonl_parser, cost_analyzer
    jsonl_id = session.get("jsonl_id", "")
    model = ""
    input_tokens = 0
    output_tokens = 0
    cache_write = 0
    cache_read = 0
    turns = 0

    if jsonl_id:
        jsonl_path = jsonl_parser._find_jsonl(cfg, jsonl_id)
        if jsonl_path:
            for obj in jsonl_parser._iter_lines(jsonl_path):
                if obj.get("type") == "assistant":
                    msg = obj.get("message", {})
                    usage = msg.get("usage", {})
                    model = msg.get("model", "") or model
                    input_tokens += usage.get("input_tokens", 0)
                    output_tokens += usage.get("output_tokens", 0)
                    cache_write += usage.get("cache_creation_input_tokens", 0)
                    cache_read += usage.get("cache_read_input_tokens", 0)
                    turns += 1

    total_tokens = input_tokens + output_tokens + cache_write + cache_read

    # Simple cost calc
    prices = {"opus": (15, 75), "sonnet": (3, 15), "haiku": (0.8, 4)}
    m = "sonnet"
    if "opus" in model.lower():
        m = "opus"
    elif "haiku" in model.lower():
        m = "haiku"
    ip, op = prices[m]
    cost = (input_tokens / 1e6 * ip) + (output_tokens / 1e6 * op) + \
           (cache_write / 1e6 * ip * 1.25) + (cache_read / 1e6 * ip * 0.1)

    # Context window (rough: opus/sonnet = 200k, haiku = 200k)
    max_ctx = 200000
    ctx_pct = min(100, round(input_tokens / max_ctx * 100, 1)) if input_tokens else 0

    return jsonify({
        "model": model,
        "turns": turns,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "context_pct": ctx_pct,
        "cost_usd": round(cost, 4),
    })


def register_ws(sock: Sock):
    """Attach WebSocket PTY bridge for terminal I/O."""
    from backend.core import pty_bridge

    @sock.route("/ws/terminal/<session_id>")
    def terminal_ws(ws, session_id: str):
        pty_bridge.handle(ws, session_id)
