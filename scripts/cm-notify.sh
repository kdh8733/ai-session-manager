#!/usr/bin/env bash
# cm-notify.sh — Claude CLI hook script
# Install in ~/.config/claude/hooks/ or reference from claude settings.
#
# Called by Claude CLI on task completion.
# Env vars set by Claude: CLAUDE_SESSION_ID, CLAUDE_STATE
#
# Usage: add to Claude hooks config:
#   "PostToolUse": "~/.config/claude-manager/cm-notify.sh"

CM_PORT="${CM_PORT:-5000}"
CM_HOST="${CM_HOST:-127.0.0.1}"

SESSION_ID="${CLAUDE_SESSION_ID:-}"
STATE="${CLAUDE_STATE:-completed}"

curl -s -X POST "http://${CM_HOST}:${CM_PORT}/api/notify" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\": \"${SESSION_ID}\", \"state\": \"${STATE}\"}" \
  > /dev/null 2>&1 || true
