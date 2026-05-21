# 🐕 API 管理程序

一键管理 Claude Code、Hermes、OpenClaw 的 API 连接环境。保存多套配置为 profile，随时切换。

## 三种入口

| 方式 | 操作 | 适合场景 |
|------|------|---------|
| **桌面应用** | 双击 `app/start.bat` | 日常使用 |
| **Web UI** | `bash scripts/api-env.sh` | 浏览器管理 |
| **CLI** | `bash scripts/api-env.sh status` | 终端 / 脚本 |

桌面应用基于 Edge WebView2，Win11 无需装任何东西。界面就是 Web UI，关窗自动停服务。

## 支持的工具

| 工具 | CLI 简写 | 配置目录 | API Key 变量 |
|------|---------|---------|-------------|
| Claude Code | `cc` | `~/.doge/` 或 `~/.claude/`（自动检测） | `ANTHROPIC_API_KEY` |
| Hermes | `hermes` | `~/.hermes/` | `OPENROUTER_API_KEY` |
| OpenClaw | `oc` | `~/.openclaw/` | `api_key` |

## CLI 快速上手

```bash
# 查看当前 Claude Code 环境
bash scripts/api-env.sh status

# 保存当前环境为 profile
bash scripts/api-env.sh save my-config

# 列出所有 profile
bash scripts/api-env.sh list

# 切换 profile
bash scripts/api-env.sh load my-config

# 操作 Hermes
bash scripts/api-env.sh -t hermes status
bash scripts/api-env.sh -t hermes save hermes-prod

# 操作 OpenClaw  
bash scripts/api-env.sh -t oc status

# 查看所有支持的工具
bash scripts/api-env.sh list-targets

# 交互式菜单
bash scripts/api-env.sh interactive
```

`-t` 是 `--target` 的简写，`cc` / `hermes` / `oc` 是三个 target 的简写。

## Profile 机制

每个 profile 是一个 `.env` 文件，存在 `~/.doge/api-profiles/`（或 `~/.claude/api-profiles/`，取决于自动检测结果）。文件头有 target 标记：

```
# api-env target: claude-code
ANTHROPIC_API_KEY="sk-xxx"
ANTHROPIC_BASE_URL="https://api.deepseek.com/anthropic"
ANTHROPIC_MODEL="deepseek-v4-pro"
```

切换时自动写入对应工具的配置文件，无需手动操作。

## 目录结构

```
api管理程序/
├── README.md
├── CLAUDE.md
├── app/
│   ├── start.bat          ← 双击启动桌面应用
│   └── api-env-app.ps1
├── scripts/
│   └── api-env.sh         ← CLI 入口
└── webui/
    ├── server.js          ← API 后端（端口 3987）
    └── public/            ← Web UI 前端
```

## 依赖

- **Node.js** — 运行 Web UI 后端
- **Windows 11** — 桌面应用（Edge WebView2 系统自带）

不引入任何 npm 包，纯 Node.js 内置模块。

## 安全

- 所有 API Key 只存在本地 `~/.doge/api-profiles/`，不上传、不同步
- 源码不含任何硬编码密钥
- profile 文件建议设权限 `chmod 600`
