#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# ========== Helper: install system package ==========
install_pkg() {
    local pkg="$1"
    echo "[*] Installing $pkg ..."
    if command -v dnf &>/dev/null; then
        sudo dnf install -y "$pkg"
    elif command -v yum &>/dev/null; then
        sudo yum install -y "$pkg"
    elif command -v apt-get &>/dev/null; then
        sudo apt-get update -qq && sudo apt-get install -y "$pkg"
    else
        echo "[!] Cannot auto-install $pkg — no supported package manager found (dnf/yum/apt)."
        exit 1
    fi
}

# ========== 1. tmux ==========
if ! command -v tmux &>/dev/null; then
    install_pkg tmux
fi
echo "tmux   : $(tmux -V)"

# ========== 2. Python 3 ==========
PY=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY="$cmd"
        break
    fi
done

if [ -z "$PY" ]; then
    install_pkg python3
    PY="python3"
fi
echo "Python : $PY ($($PY --version 2>&1))"

# ========== 3. pip ==========
if ! "$PY" -m pip --version &>/dev/null; then
    install_pkg python3-pip
fi
echo "pip    : $($PY -m pip --version 2>&1 | head -1)"

# ========== 4. Python dependencies ==========
if ! "$PY" -c "import flask" 2>/dev/null; then
    echo "[*] Installing Python packages..."
    "$PY" -m pip install -r requirements.txt --quiet
    echo "    Done."
fi

# ========== 5. Config directory ==========
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/claude-manager"
mkdir -p "$CONFIG_DIR"

# ========== 6. Start tmux server ==========
tmux start-server 2>/dev/null || true

# ========== 7. Start server ==========
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
