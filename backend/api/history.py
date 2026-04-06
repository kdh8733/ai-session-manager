"""History viewer API endpoints."""
from flask import Blueprint, jsonify, request, current_app

from backend.core import jsonl_parser, project_manager

bp = Blueprint("history", __name__, url_prefix="/api/history")


@bp.get("/")
def list_history():
    """Return all JSONL sessions across configured project dirs."""
    cfg = current_app.config["CM"]
    sessions = jsonl_parser.list_all_sessions(cfg)
    return jsonify(sessions)


@bp.get("/<session_id>")
def get_session(session_id: str):
    """Return parsed turns for a specific JSONL session."""
    cfg = current_app.config["CM"]
    turns = jsonl_parser.get_turns(cfg, session_id)
    return jsonify(turns)


@bp.post("/<session_id>/hide")
def hide_session(session_id: str):
    jsonl_parser.set_hidden(session_id, True)
    return jsonify({"ok": True})


@bp.get("/search")
def search_history():
    cfg = current_app.config["CM"]
    q = request.args.get("q", "")
    results = jsonl_parser.search(cfg, q)
    return jsonify(results)
