"""
AI Session Manager — Flask application entry point.
Run with:  python -m backend.app
"""
import os
import sys
from pathlib import Path

from flask import Flask, send_from_directory
from flask_sock import Sock

from backend.core import config as cfg_mod
from backend.api import sessions, projects, history, cost, notify, settings, stream, favorites, bookmarks


def create_app() -> Flask:
    cfg = cfg_mod.load()

    static_dir = Path(__file__).parent.parent / "frontend" / "static"
    template_dir = Path(__file__).parent.parent / "frontend" / "templates"

    app = Flask(
        __name__,
        static_folder=str(static_dir),
        template_folder=str(template_dir),
    )
    app.config["SECRET_KEY"] = os.environ.get("CM_SECRET", "cm-dev-secret")
    app.config["CM"] = cfg

    # WebSocket support
    sock = Sock(app)
    app.sock = sock

    # Register blueprints
    app.register_blueprint(sessions.bp)
    app.register_blueprint(projects.bp)
    app.register_blueprint(history.bp)
    app.register_blueprint(cost.bp)
    app.register_blueprint(notify.bp)
    app.register_blueprint(settings.bp)
    app.register_blueprint(stream.bp)
    app.register_blueprint(favorites.bp)
    app.register_blueprint(bookmarks.bp)

    # Register WebSocket routes
    sessions.register_ws(sock)
    stream.register_ws(sock)

    # /api/browse shortcut
    @app.route("/api/browse")
    def browse_dirs():
        return settings.browse_dirs()

    # Serve frontend
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        if path and (static_dir / path).exists():
            return send_from_directory(str(static_dir), path)
        return send_from_directory(str(template_dir), "index.html")

    return app


if __name__ == "__main__":
    app = create_app()
    cfg = app.config["CM"]
    host = cfg["host"]
    port = cfg["port"]
    print(f"AI Session Manager running at http://{host}:{port}")
    app.run(host=host, port=port, debug=True)
