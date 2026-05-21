# API 管理程序 — 多工具 API 环境管理器

管理 Claude Code、Hermes、OpenClaw 的 API 连接环境，支持多 profile 一键切换。
提供桌面应用、Web UI、CLI 三种入口。

## 技术栈
- Shell（Bash）脚本 — CLI 入口
- Node.js（HTTP 服务）— API 后端，零 npm 依赖
- 原生 HTML/CSS/JS — Web UI，零前端框架
- PowerShell + Edge WebView2 — 桌面应用（Win11 零额外依赖）

## 启动方式

```
# 桌面应用（推荐）
双击 app/start.bat

# Web UI（浏览器）
bash scripts/api-env.sh

# CLI
bash scripts/api-env.sh status
bash scripts/api-env.sh list
bash scripts/api-env.sh interactive
```

## CLI 命令

```bash
# 默认操作 Claude Code
bash scripts/api-env.sh status           # 查看当前环境
bash scripts/api-env.sh list             # 列出当前 target 的 profile
bash scripts/api-env.sh save <name>      # 保存当前环境为 profile
bash scripts/api-env.sh load <name>      # 切换 profile
bash scripts/api-env.sh delete <name>    # 删除 profile
bash scripts/api-env.sh interactive      # 终端交互式菜单
bash scripts/api-env.sh list-targets     # 列出所有 target

# 指定 target（--target / -t）
bash scripts/api-env.sh -t hermes status       # Hermes 环境
bash scripts/api-env.sh -t hermes save myenv   # 保存 Hermes profile
bash scripts/api-env.sh -t openclaw list       # OpenClaw profile 列表

# 简写别名
bash scripts/api-env.sh -t cc status     # cc = Claude Code
bash scripts/api-env.sh -t oc status     # oc = OpenClaw
```

## 支持的 Target

| Target | 配置目录 | Active 文件 | API Key 变量 |
|--------|---------|------------|-------------|
| Claude Code (`cc`) | `~/.doge/` 或 `~/.claude/`（自动检测） | `~/.claude-env.sh` | `ANTHROPIC_API_KEY` |
| Hermes | `~/.hermes/` | `~/.hermes/.env` | `OPENROUTER_API_KEY` |
| OpenClaw (`oc`) | `~/.openclaw/` | `~/.openclaw/agent.yaml` | `api_key` |

## 目录结构

```
api管理程序/
├── CLAUDE.md              # 本文件
├── .gitignore
├── app/
│   ├── api-env-app.ps1    # 桌面应用启动器
│   └── start.bat          # 双击启动
├── scripts/
│   └── api-env.sh         # CLI 管理脚本
└── webui/
    ├── server.js          # Node.js 后端（端口 3987）
    └── public/
        ├── index.html     # Web UI 页面
        ├── app.js         # 前端逻辑
        └── styles.css     # 样式
```

## Web UI API

后端运行在 `http://127.0.0.1:3987`：

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/targets | 列出所有 target |
| GET | /api/status?target=xxx | 当前激活环境 + profile 列表 |
| GET | /api/profiles?target=xxx | 所有 profile（可按 target 过滤） |
| GET | /api/profiles/:name | 单个 profile 详情 |
| POST | /api/profiles/load | 加载（切换）profile |
| POST | /api/profiles/save | 保存当前环境为 profile |
| POST | /api/profiles | 创建新 profile |
| PUT | /api/profiles/:name | 编辑 profile |
| DELETE | /api/profiles/:name | 删除 profile |

## 路径自动检测

程序启动时检测 `~/.doge/` 是否存在：
- 存在 → 使用 doge 魔改版路径（`~/.doge/settings.json`, `~/.doge/.claude.json`）
- 不存在 → 回退 Claude Code 官方路径（`~/.claude/settings.json`, `~/.claude/.claude.json`）

Profile 目录也随之变化：`~/.doge/api-profiles/` 或 `~/.claude/api-profiles/`。

## Profile 存储

Profile 以 `.env` 文件存于上述自动检测的 `api-profiles/` 目录，文件头有 target 注释标记：

```
# api-env target: claude-code
ANTHROPIC_API_KEY="sk-xxx"
ANTHROPIC_BASE_URL="https://..."
ANTHROPIC_MODEL="claude-sonnet-4-6"
```

无标记的旧 profile 自动视为 `claude-code`，零迁移。
