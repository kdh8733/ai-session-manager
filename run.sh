#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# ========== 1. Check tmux ==========
if ! command -v tmux &>/dev/null; then
    echo "[!] tmux not found."
    echo "    sudo dnf install tmux"
    exit 1
fi
echo "tmux  : $(tmux -V)"

# ========== 2. Find Python ==========
PY=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY="$cmd"
        break
    fi
done

if [ -z "$PY" ]; then
    echo "[!] Python not found."
    echo "    sudo dnf install python3 python3-pip"
    exit 1
fi
echo "Python: $PY ($($PY --version 2>&1))"

# ========== 3. Auto-install dependencies ==========
if ! "$PY" -c "import flask" 2>/dev/null; then
    echo "Installing packages..."
    "$PY" -m pip install -r requirements.txt --quiet
    echo "Packages installed."
fi

# ========== 4. Config directory ==========
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/claude-manager"
mkdir -p "$CONFIG_DIR"

# ========== 5. Start tmux server (if not running) ==========
tmux start-server 2>/dev/null || true

# ========== 6. Start server ==========
HOST="${CM_HOST:-0.0.0.0}"
PORT="${CM_PORT:-5000}"

echo ""
echo "============================================="
echo " AI Session Manager (tmux backend)"
echo " http://${HOST}:${PORT}"
echo "============================================="
echo " Ctrl+C to stop"
echo ""

"$PY" run.py --host "$HOST" --port "$PORT"
