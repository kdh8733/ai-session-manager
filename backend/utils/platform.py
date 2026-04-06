"""
platform.py -- Linux-native platform abstractions for WSL Rocky 9 + tmux.

PTY backend: ptyprocess (for tmux attach bridging)
Session mgmt: tmux subprocess calls
"""
import os
import shutil
import subprocess
from pathlib import Path


# ---------------------------------------------------------------------------
# Important paths
# ---------------------------------------------------------------------------

def config_dir() -> Path:
    """App config directory: ~/.config/claude-manager"""
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "claude-manager"


def claude_data_dir() -> Path:
    """Claude CLI data directory: ~/.claude"""
    env_override = os.environ.get("CM_CLAUDE_DIR")
    if env_override:
        return Path(env_override)
    return Path.home() / ".claude"


# ---------------------------------------------------------------------------
# tmux helpers
# ---------------------------------------------------------------------------

def tmux_bin() -> str:
    """Return tmux binary path."""
    found = shutil.which("tmux")
    if not found:
        raise RuntimeError("tmux not found in PATH. Install: sudo dnf install tmux")
    return found


def tmux_run(*args: str, timeout: int = 10, check: bool = True) -> subprocess.CompletedProcess:
    """Run a tmux command and return the result."""
    cmd = [tmux_bin(), *args]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=check,
    )


def claude_bin_path(cfg: dict) -> str:
    """Resolve the Claude CLI binary path."""
    claude_bin = cfg.get("claude_bin", "claude")
    if Path(claude_bin).is_absolute() and Path(claude_bin).exists():
        return claude_bin
    found = shutil.which(claude_bin)
    return found or claude_bin
