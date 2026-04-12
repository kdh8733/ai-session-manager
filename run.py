#!/usr/bin/env python3
"""Launcher for AI Session Manager (tmux backend)."""
import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from backend.core import session_manager
from backend.app import create_app


def main():
    parser = argparse.ArgumentParser(description="AI Session Manager")
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--debug", action="store_true", default=False)
    args = parser.parse_args()

    app = create_app()
    cfg = app.config["CM"]

    host = args.host or cfg.get("host", "0.0.0.0")
    port = args.port or cfg.get("port", 5000)

    # Suppress Flask/Werkzeug development server warning
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    session_manager.cleanup_orphan_attaches()
    resumed = session_manager.auto_resume(cfg)
    if resumed:
        logging.getLogger(__name__).info(
            "Auto-resumed %d session(s) after reboot: %s", len(resumed), ", ".join(resumed)
        )
    app.run(host=host, port=port, debug=args.debug, threaded=True)


if __name__ == "__main__":
    main()
