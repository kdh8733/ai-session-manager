"""
session_manager.py -- Public API for session management.

Delegates to tmux_session (tmux-based, Linux/WSL native).
"""
from backend.core.tmux_session import (
    list_sessions,
    create_session,
    kill_session,
    restart_claude,
    continue_session,
    get_session,
    rename_session,
    cleanup_orphan_attaches,
)

__all__ = [
    "list_sessions",
    "create_session",
    "kill_session",
    "restart_claude",
    "continue_session",
    "get_session",
    "rename_session",
    "cleanup_orphan_attaches",
]
