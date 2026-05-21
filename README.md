# 🐕 API Environment Manager

One-click management for Claude Code, Hermes, and OpenClaw API connections. Save multiple configs as named profiles and switch between them instantly.

> **中文用户**：[📖 中文 README](README.zh-CN.md)

## Three Ways to Launch

| Method | How | Best For |
|--------|-----|----------|
| **Desktop App** | Double-click `app/start.bat` | Daily use |
| **Web UI** | `bash scripts/api-env.sh` | Browser-based management |
| **CLI** | `bash scripts/api-env.sh status` | Terminal / scripting |

The desktop app uses Edge WebView2 — zero extra dependencies on Windows 11. The UI is the same Web UI, wrapped in a native window. Closing the window auto-stops the server.

## Supported Targets

| Tool | Alias | Config Directory | API Key Variable |
|------|-------|-----------------|-----------------|
| Claude Code | `cc` | `~/.doge/` or `~/.claude/` (auto-detected) | `ANTHROPIC_API_KEY` |
| Hermes | `hermes` | `~/.hermes/` | `OPENROUTER_API_KEY` |
| OpenClaw | `oc` | `~/.openclaw/` | `api_key` |

## CLI Quick Start

```bash
# Check current Claude Code environment
bash scripts/api-env.sh status

# Save current env as a profile
bash scripts/api-env.sh save my-config

# List all profiles for current target
bash scripts/api-env.sh list

# Switch to a profile
bash scripts/api-env.sh load my-config

# Work with Hermes
bash scripts/api-env.sh -t hermes status
bash scripts/api-env.sh -t hermes save hermes-prod

# Work with OpenClaw
bash scripts/api-env.sh -t oc status

# List all supported targets
bash scripts/api-env.sh list-targets

# Interactive terminal menu
bash scripts/api-env.sh interactive
```

`-t` is short for `--target`. `cc`, `hermes`, `oc` are aliases for the three targets.

## How Profiles Work

Each profile is a `.env` file stored under `~/.doge/api-profiles/` (or `~/.claude/api-profiles/`, depending on auto-detection). A target marker in the file header identifies which tool it belongs to:

```
# api-env target: claude-code
ANTHROPIC_API_KEY="sk-xxx"
ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
ANTHROPIC_MODEL="deepseek-v4-pro"
```

When you switch profiles, the program automatically writes the values to the target tool's config files. No manual steps needed.

## Project Structure

```
api-env-manager/
├── README.md              ← English docs (this file)
├── README.zh-CN.md        ← Chinese docs
├── CLAUDE.md
├── app/
│   ├── start.bat          ← Double-click to launch desktop app
│   └── api-env-app.ps1
├── scripts/
│   └── api-env.sh         ← CLI entry point
└── webui/
    ├── server.js          ← API backend (port 3987)
    └── public/            ← Web UI frontend
```

## Dependencies

- **Node.js** — to run the Web UI backend
- **Windows 11** — for the desktop app (Edge WebView2 included with the OS)

Zero npm packages. Pure Node.js built-in modules only.

## Security

- All API keys are stored locally under `~/.doge/api-profiles/` — never uploaded or synced
- Source code contains no hardcoded credentials
- Recommended: `chmod 600` on profile files
