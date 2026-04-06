"""
Cost analysis with incremental JSONL scanning.

Scan state is cached by (file_path, file_size, mtime) so only new content
is re-parsed on each call.

Cost model (per million tokens):
  Opus:   input $15,  output $75
  Sonnet: input $3,   output $15
  Haiku:  input $0.8, output $4
  Cache write: ×1.25, cache read: ×0.10
"""
import json
import os
import threading
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from backend.core import config as cfg_mod

# Per-million-token prices (USD)
_PRICES = {
    "opus":   {"input": 15.0,  "output": 75.0},
    "sonnet": {"input": 3.0,   "output": 15.0},
    "haiku":  {"input": 0.8,   "output": 4.0},
}
_CACHE_WRITE_MULT = 1.25
_CACHE_READ_MULT  = 0.10

# Incremental scan cache: path → {"size", "mtime", "seek", "rows"}
# rows: list of {"date", "project", "model", "input", "output", "cache_write", "cache_read"}
_scan_cache: dict[str, dict] = {}
_scan_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_summary(cfg: dict, usd_to_krw: float = 0) -> dict:
    rows = _all_rows(cfg)
    today = _date_str(0)
    week_start = _date_str(-6)
    month_start = _date_str(-29)

    def total(rows_subset):
        return sum(_row_cost(r) for r in rows_subset)

    today_cost  = total(r for r in rows if r["date"] == today)
    week_cost   = total(r for r in rows if r["date"] >= week_start)
    month_cost  = total(r for r in rows if r["date"] >= month_start)

    result = {
        "today": _fmt(today_cost, usd_to_krw),
        "week":  _fmt(week_cost,  usd_to_krw),
        "month": _fmt(month_cost, usd_to_krw),
    }
    return result


def get_daily(cfg: dict, days: int = 30) -> list[dict]:
    rows = _all_rows(cfg)
    cutoff = _date_str(-(days - 1))

    by_date: dict[str, float] = defaultdict(float)
    for r in rows:
        if r["date"] >= cutoff:
            by_date[r["date"]] += _row_cost(r)

    # Fill in all dates (even zero-cost ones)
    result = []
    for i in range(days - 1, -1, -1):
        d = _date_str(-i)
        result.append({"date": d, "cost_usd": round(by_date.get(d, 0.0), 6)})
    return result


def get_by_project(cfg: dict) -> list[dict]:
    rows = _all_rows(cfg)
    by_proj: dict[str, float] = defaultdict(float)
    for r in rows:
        by_proj[r["project"]] += _row_cost(r)
    return [
        {"project": k, "cost_usd": round(v, 6)}
        for k, v in sorted(by_proj.items(), key=lambda x: -x[1])
    ]


def get_by_model(cfg: dict) -> list[dict]:
    rows = _all_rows(cfg)
    by_model: dict[str, float] = defaultdict(float)
    for r in rows:
        by_model[r["model"] or "unknown"] += _row_cost(r)
    return [
        {"model": k, "cost_usd": round(v, 6)}
        for k, v in sorted(by_model.items(), key=lambda x: -x[1])
    ]


def get_by_session(cfg: dict) -> list[dict]:
    rows = _all_rows(cfg)
    by_session: dict[str, float] = defaultdict(float)
    for r in rows:
        sid = r.get("session_id", "")
        if sid:
            by_session[sid] += _row_cost(r)
    return [
        {"session_id": k, "cost_usd": round(v, 6)}
        for k, v in sorted(by_session.items(), key=lambda x: -x[1])
    ]


# ---------------------------------------------------------------------------
# Incremental scan
# ---------------------------------------------------------------------------

def _all_rows(cfg: dict) -> list[dict]:
    """Return all cost rows, using incremental scan cache."""
    claude_dir = Path(cfg.get("claude_dir", Path.home() / ".claude"))
    projects_dir = claude_dir / "projects"
    if not projects_dir.exists():
        return []

    all_rows = []
    with _scan_lock:
        for jsonl_file in projects_dir.rglob("*.jsonl"):
            rows = _scan_file(jsonl_file)
            all_rows.extend(rows)
    return all_rows


def _scan_file(path: Path) -> list[dict]:
    """Incrementally scan a JSONL file, returning all cost rows."""
    key = str(path)
    try:
        stat = path.stat()
        size = stat.st_size
        mtime = stat.st_mtime
    except OSError:
        return []

    cached = _scan_cache.get(key)
    if cached and cached["size"] == size and cached["mtime"] == mtime:
        return cached["rows"]

    rows = list(cached["rows"]) if cached else []
    seek = cached["seek"] if cached else 0
    project = path.parent.name  # encoded dir name (we just use it as label)
    session_id = path.stem

    try:
        with open(path, "r", encoding="utf-8") as f:
            f.seek(seek)
            while True:
                line = f.readline()
                if not line:
                    seek = f.tell()
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line, strict=False)
                except json.JSONDecodeError:
                    continue

                if obj.get("type") != "assistant":
                    continue

                msg = obj.get("message", {})
                usage = msg.get("usage", {})
                model_raw = (msg.get("model") or "").lower()
                model = _classify_model(model_raw)
                date = _ts_to_date(obj.get("timestamp", ""))
                if not date:
                    date = _date_str(0)

                rows.append({
                    "date": date,
                    "project": project,
                    "session_id": session_id,
                    "model": model,
                    "input": usage.get("input_tokens", 0),
                    "output": usage.get("output_tokens", 0),
                    "cache_write": usage.get("cache_creation_input_tokens", 0),
                    "cache_read": usage.get("cache_read_input_tokens", 0),
                })
    except OSError:
        return rows

    _scan_cache[key] = {"size": size, "mtime": mtime, "seek": seek, "rows": rows}
    return rows


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _classify_model(model: str) -> str:
    if "opus" in model:
        return "opus"
    if "haiku" in model:
        return "haiku"
    return "sonnet"  # default


def _row_cost(r: dict) -> float:
    prices = _PRICES.get(_classify_model(r.get("model", "")), _PRICES["sonnet"])
    inp  = r.get("input", 0) / 1_000_000 * prices["input"]
    out  = r.get("output", 0) / 1_000_000 * prices["output"]
    cw   = r.get("cache_write", 0) / 1_000_000 * prices["input"] * _CACHE_WRITE_MULT
    cr   = r.get("cache_read", 0) / 1_000_000 * prices["input"] * _CACHE_READ_MULT
    return inp + out + cw + cr


def _fmt(cost_usd: float, usd_to_krw: float) -> dict:
    result: dict = {"usd": round(cost_usd, 4)}
    if usd_to_krw > 0:
        result["krw"] = round(cost_usd * usd_to_krw)
    return result


def _date_str(delta_days: int = 0) -> str:
    d = datetime.now(tz=timezone.utc) + timedelta(days=delta_days)
    return d.strftime("%Y-%m-%d")


def _ts_to_date(ts: str) -> str:
    if not ts:
        return ""
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except (ValueError, AttributeError):
        return ""
