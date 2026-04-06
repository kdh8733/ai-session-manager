"""
Configuration management for AI Session Manager.
Reads from ~/.config/claude-manager/config.json and environment variables.
"""
import json
import os
from pathlib import Path

from backend.utils.platform import config_dir as _platform_config_dir, claude_data_dir as _platform_claude_dir, normalize_path

_env_config_dir = os.environ.get("CM_CONFIG_DIR")
CONFIG_DIR: Path = Path(_env_config_dir) if _env_config_dir else _platform_config_dir()
CONFIG_FILE: Path = CONFIG_DIR / "config.json"

DEFAULTS = {
    "host": os.environ.get("CM_HOST", "0.0.0.0"),
    "port": int(os.environ.get("CM_PORT", "5000")),
    "project_dirs": [],
    "claude_bin": os.environ.get("CM_CLAUDE_BIN", "claude"),
    "claude_dir": os.environ.get("CM_CLAUDE_DIR", str(_platform_claude_dir())),
}


def load() -> dict:
    if CONFIG_FILE.exists():
        try:
            data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            data = {}
    else:
        data = {}

    cfg = {**DEFAULTS, **data}

    env_dirs = os.environ.get("CM_PROJECT_DIRS")
    if env_dirs:
        cfg["project_dirs"] = [d.strip() for d in env_dirs.split(",") if d.strip()]

    # Always normalize project_dirs (Windows → WSL path conversion)
    cfg["project_dirs"] = [normalize_path(d) for d in cfg.get("project_dirs", []) if d]

    return cfg


def save(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def is_configured(cfg: dict) -> bool:
    """Return True if the minimum required config is present."""
    return bool(cfg.get("project_dirs"))
