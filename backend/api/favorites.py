"""Favorites API: bookmark history sessions with notes."""
from flask import Blueprint, jsonify, request

from backend.core import favorites_store

bp = Blueprint("favorites", __name__, url_prefix="/api/favorites")


@bp.get("/")
def list_favorites():
    q = request.args.get("q", "")
    return jsonify(favorites_store.search(q) if q else favorites_store.all())


@bp.post("/")
def add_favorite():
    data = request.get_json(force=True)
    item = favorites_store.add(
        session_id=data["session_id"],
        title=data.get("title", ""),
        project=data.get("project", ""),
    )
    return jsonify(item), 201


@bp.delete("/<session_id>")
def remove_favorite(session_id: str):
    favorites_store.remove(session_id)
    return jsonify({"ok": True})


@bp.post("/<session_id>/notes")
def add_note(session_id: str):
    data = request.get_json(force=True)
    note = favorites_store.add_note(session_id, data["text"])
    return jsonify(note), 201


@bp.delete("/<session_id>/notes/<int:note_index>")
def delete_note(session_id: str, note_index: int):
    favorites_store.delete_note(session_id, note_index)
    return jsonify({"ok": True})
