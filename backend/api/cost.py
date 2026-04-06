"""Cost analysis API endpoints."""
from flask import Blueprint, jsonify, request, current_app

from backend.core import cost_analyzer

bp = Blueprint("cost", __name__, url_prefix="/api/cost")


@bp.get("/summary")
def summary():
    """Return today/7d/30d cost overview."""
    cfg = current_app.config["CM"]
    usd_to_krw = float(request.args.get("usd_to_krw", 0))
    data = cost_analyzer.get_summary(cfg, usd_to_krw=usd_to_krw)
    return jsonify(data)


@bp.get("/daily")
def daily():
    """Return per-day cost data for the past N days (default 30)."""
    cfg = current_app.config["CM"]
    days = int(request.args.get("days", 30))
    data = cost_analyzer.get_daily(cfg, days=days)
    return jsonify(data)


@bp.get("/by-project")
def by_project():
    cfg = current_app.config["CM"]
    data = cost_analyzer.get_by_project(cfg)
    return jsonify(data)


@bp.get("/by-model")
def by_model():
    cfg = current_app.config["CM"]
    data = cost_analyzer.get_by_model(cfg)
    return jsonify(data)


@bp.get("/sessions")
def sessions():
    """Cost per session (for gauge bars)."""
    cfg = current_app.config["CM"]
    data = cost_analyzer.get_by_session(cfg)
    return jsonify(data)
