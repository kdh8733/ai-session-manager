"""Project discovery and management API endpoints."""
from flask import Blueprint, jsonify, request, current_app

from backend.core import project_manager

bp = Blueprint("projects", __name__, url_prefix="/api/projects")


@bp.get("/")
def list_projects():
    cfg = current_app.config["CM"]
    projects = project_manager.list_projects(cfg)
    return jsonify(projects)


@bp.post("/<path:project_key>/hide")
def hide_project(project_key: str):
    project_manager.set_hidden(project_key, True)
    return jsonify({"ok": True})


@bp.post("/<path:project_key>/show")
def show_project(project_key: str):
    project_manager.set_hidden(project_key, False)
    return jsonify({"ok": True})


@bp.put("/order")
def update_order():
    data = request.get_json(force=True)
    order = data.get("order", [])
    project_manager.save_order(order)
    return jsonify({"ok": True})
