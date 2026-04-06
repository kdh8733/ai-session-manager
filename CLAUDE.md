# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AI Session Manager** — a web-based GUI for managing Claude CLI sessions. It wraps `tmux` and the `claude` CLI to provide a browser-accessible dashboard with terminal emulation, session history, cost analysis, and more.

The full feature specification lives in `ROADMAP.md`. When implementing anything, read `ROADMAP.md` first.

---

## Intended Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python (Flask or FastAPI), `tmux` via subprocess |
| Frontend | Vanilla JS or lightweight framework, xterm.js 5.5 |
| Terminal I/O | WebSocket ↔ PTY (via `ptyprocess` or `asyncio`) |
| Charts | Chart.js |
| Realtime events | SSE (Server-Sent Events) for notifications |

---

## Architecture

### Backend

- **Session management**: creates `tmux` sessions named `cm-{project}-{index}`, stores metadata in tmux user options (`@display_name`, `@jsonl_id`)
- **JSONL binding**: after session creation, polls `~/.claude/projects/` for 30s to find the matching JSONL file by UUID, saves as `@jsonl_id`
- **PTY bridge**: WebSocket handler attaches to `tmux attach-session`, forwards I/O with `TIOCSWINSZ`/`SIGWINCH` for resize; enforces single-writer (new connection kicks existing)
- **Stream sessions**: spawns `claude` CLI directly (no tmux), streams stdout over WebSocket; supports `--continue {session_id}`
- **Notification hook**: `cm-notify.sh` posts to `POST /api/notify` on task completion → SSE broadcast to browser
- **Session state**: `session_state.py` owns canonical `idle/running/waiting/completed` states
- **Cost cache**: incremental scan using file size + mtime + seek position to avoid re-parsing unchanged JSONL

### Frontend

- **Layout**: left sidebar (project tree + sessions) | main panel (Terminal OR History Viewer OR Cost Dashboard)
- **Terminal**: xterm.js with `SearchAddon`; right-click context menu sends `/permissions` or pastes clipboard
- **History viewer**: parses JSONL turns, renders markdown + code highlighting, shows token stats, tool call summaries, thinking blocks (toggleable)
- **Command Palette**: `Ctrl+K` global search across projects/sessions

### Data / Config paths

| Data | Path |
|------|------|
| Config | `~/.config/claude-manager/config.json` |
| Title cache | `~/.config/claude-manager/titles.json` |
| Favorites | `~/.config/claude-manager/favorites.json` |
| Bookmarks | `~/.config/claude-manager/bookmarks.json` |
| Hidden projects | `~/.config/claude-manager/hidden_projects.json` |
| Project order | `~/.config/claude-manager/project_order.json` |
| Custom fonts | `~/.config/claude-manager/fonts/` |
| Claude history | `~/.claude/projects/{encoded_path}/*.jsonl` |

---

## Critical Implementation Notes

These are non-obvious gotchas from `ROADMAP.md` — get these wrong and things silently break:

1. **JSONL parsing**: always use `json.loads(line, strict=False)` (thinking blocks contain control characters). Use `f.readline()` in a loop — **never** `for line in f:` because it conflicts with `f.tell()`.

2. **Path encoding**: Claude CLI encodes project paths by replacing `/`, `.`, `_` all with `-`. Decoding is lossy — always recover the real path from the `cwd` field inside the JSONL, not by reversing the encoding.

3. **tmux session names**: normalize `.` → `_` (tmux treats `.` as a special character in session names).

4. **Cost model** (for cost dashboard calculations):
   - Opus: input $15/M, output $75/M
   - Sonnet: input $3/M, output $15/M
   - Haiku: input $0.8/M, output $4/M
   - Cache write: ×1.25, cache read: ×0.10

5. **Session title priority**: `@display_name` (tmux option) > `custom-title` entry in JSONL > AI-generated (Claude API, first prompt) > raw first prompt.

6. **Orphan cleanup**: on server restart, find and kill leftover `tmux attach-session` processes to avoid ghost PTY connections.

7. **Permissions**: existing sessions use `/permissions` command (sent via PTY); new sessions use `--dangerously-skip-permissions` flag.

---

## Session Naming Convention

```
tmux session: cm-{project}-{index}
display name: set via  claude -n {name}  →  stored in tmux @display_name
jsonl link:   polled for 30s after creation → stored in tmux @jsonl_id
```

## Environment Variables

`CM_HOST`, `CM_PORT`, `CM_PROJECT_DIRS`, `CM_CLAUDE_BIN`, `CM_CLAUDE_DIR`
## 1. Think Before Coding
 
 **Don't assume. Don't hide confusion. Surface tradeoffs.**
 
 Before implementing:
 - State your assumptions explicitly. If uncertain, ask.
 - If multiple interpretations exist, present them - don't pick silently.
 - If a simpler approach exists, say so. Push back when warranted.
 - If something is unclear, stop. Name what's confusing. Ask.
 
 ## 2. Simplicity First
 
 **Minimum code that solves the problem. Nothing speculative.**
 
 - No features beyond what was asked.
 - No abstractions for single-use code.
 - No "flexibility" or "configurability" that wasn't requested.
 - No error handling for impossible scenarios.
 - If you write 200 lines and it could be 50, rewrite it.
 
 Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.
 
 ## 3. Surgical Changes
 
 **Touch only what you must. Clean up only your own mess.**
 
 When editing existing code:
 - Don't "improve" adjacent code, comments, or formatting.
 - Don't refactor things that aren't broken.
 - Match existing style, even if you'd do it differently.
 - If you notice unrelated dead code, mention it - don't delete it.
 
 When your changes create orphans:
 - Remove imports/variables/functions that YOUR changes made unused.
 - Don't remove pre-existing dead code unless asked.
 
 The test: Every changed line should trace directly to the user's request.
 
 ## 4. Goal-Driven Execution
 
 **Define success criteria. Loop until verified.**
 
 Transform tasks into verifiable goals:
 - "Add validation" → "Write tests for invalid inputs, then make them pass"
 - "Fix the bug" → "Write a test that reproduces it, then make it pass"
 - "Refactor X" → "Ensure tests pass before and after"
 
 For multi-step tasks, state a brief plan:
 ```
 1. [Step] → verify: [check]
 2. [Step] → verify: [check]
 3. [Step] → verify: [check]
 ```
