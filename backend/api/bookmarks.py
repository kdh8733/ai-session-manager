"""Bookmarks API: bookmark specific turns with tags and comments."""
from flask import Blueprint, jsonify, request

from backend.core import bookmarks_store

bp = Blueprint("bookmarks", __name__, url_prefix="/api/bookmarks")


@bp.get("/")
def list_bookmarks():
    q = request.args.get("q", "")
    tag = request.args.get("tag", "")
    return jsonify(bookmarks_store.search(q=q, tag=tag))


@bp.post("/")
def add_bookmark():
    data = request.get_json(force=True)
    item = bookmarks_store.add(
        session_id=data["session_id"],
        turn_index=data["turn_index"],
        snippet=data.get("snippet", ""),
        tags=data.get("tags", []),
    )
    return jsonify(item), 201


@bp.delete("/<bookmark_id>")
def remove_bookmark(bookmark_id: str):
    bookmarks_store.remove(bookmark_id)
    return jsonify({"ok": True})


@bp.post("/<bookmark_id>/comments")
def add_comment(bookmark_id: str):
    data = request.get_json(force=True)
    comment = bookmarks_store.add_comment(bookmark_id, data["text"])
    return jsonify(comment), 201


@bp.delete("/<bookmark_id>/comments/<int:comment_index>")
def delete_comment(bookmark_id: str, comment_index: int):
    bookmarks_store.delete_comment(bookmark_id, comment_index)
    return jsonify({"ok": True})
