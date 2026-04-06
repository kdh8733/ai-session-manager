"""Settings API: config, fonts, directory browser."""
import os
from pathlib import Path
from flask import Blueprint, jsonify, request, current_app

from backend.core import config as cfg_mod
from backend.utils.platform import normalize_path

bp = Blueprint("settings", __name__, url_prefix="/api/settings")

ALLOWED_FONT_EXTS = {".ttf", ".woff", ".woff2", ".otf"}


@bp.get("/")
def get_settings():
    cfg = current_app.config["CM"]
    return jsonify({
        "project_dirs": cfg.get("project_dirs", []),
        "claude_bin": cfg.get("claude_bin", "claude"),
        "claude_dir": cfg.get("claude_dir", ""),
        "host": cfg.get("host", "0.0.0.0"),
        "port": cfg.get("port", 5000),
    })


@bp.put("/")
def update_settings():
    data = request.get_json(force=True)
    cfg = cfg_mod.load()

    for key in ("project_dirs", "claude_bin", "claude_dir"):
        if key in data:
            if key == "project_dirs":
                # Convert Windows paths to WSL paths
                cfg[key] = [normalize_path(d) for d in data[key] if d]
            else:
                cfg[key] = data[key]

    cfg_mod.save(cfg)
    current_app.config["CM"] = cfg
    return jsonify({"ok": True})


@bp.post("/fonts")
def upload_font():
    font_dir = Path(cfg_mod.CONFIG_DIR) / "fonts"
    font_dir.mkdir(parents=True, exist_ok=True)

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f = request.files["file"]
    ext = Path(f.filename).suffix.lower()
    if ext not in ALLOWED_FONT_EXTS:
        return jsonify({"error": f"Unsupported font type: {ext}"}), 400

    dest = font_dir / Path(f.filename).name
    f.save(str(dest))
    return jsonify({"ok": True, "filename": dest.name}), 201


@bp.get("/fonts")
def list_fonts():
    font_dir = Path(cfg_mod.CONFIG_DIR) / "fonts"
    if not font_dir.exists():
        return jsonify([])
    fonts = [p.name for p in font_dir.iterdir() if p.suffix.lower() in ALLOWED_FONT_EXTS]
    return jsonify(fonts)


@bp.route("/browse", endpoint="browse_settings")
def browse_dirs():
    """Directory browser API. WSL-aware: shows /mnt/ drives + home."""
    raw = request.args.get("path", "")

    # No path: show quick-access roots
    if not raw:
        roots = []
        home = str(Path.home())
        roots.append({"name": "Home (" + home + ")", "path": home})

        # WSL mount points (Windows drives)
        mnt = Path("/mnt")
        if mnt.is_dir():
            for child in sorted(mnt.iterdir()):
                if child.is_dir() and len(child.name) == 1 and child.name.isalpha():
                    label = child.name.upper() + ": drive"
                    roots.append({"name": label, "path": str(child)})

        roots.append({"name": "/", "path": "/"})
        return jsonify({"parent": None, "current": "", "dirs": roots})

    p = Path(raw)
    if not p.is_dir():
        return jsonify({"parent": str(p.parent), "current": raw, "dirs": []})

    parent = str(p.parent) if p.parent != p else None
    dirs = []
    try:
        for child in sorted(p.iterdir()):
            if child.is_dir() and not child.name.startswith("."):
                dirs.append({"name": child.name, "path": str(child)})
    except PermissionError:
        pass
    return jsonify({"parent": parent, "current": raw, "dirs": dirs[:200]})
