#!/bin/bash
# ============================================================
# api-env — Claude Code / Hermes / OpenClaw API 环境管理器
# 管理多 target 的 API profile（ANTHROPIC_API_KEY / BASE_URL / MODEL）
# ============================================================

# ─── Claude Code 路径自动检测：doge 魔改版 vs 官方版 ──
if [ -d "$HOME/.doge" ]; then
  CLAUDE_CONFIG_DIR="$HOME/.doge"
else
  CLAUDE_CONFIG_DIR="$HOME/.claude"
fi

PROFILES_DIR="${CLAUDE_CONFIG_DIR}/api-profiles"
DEFAULT_TARGET="claude-code"
mkdir -p "$PROFILES_DIR"

# ─── 颜色 ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ─── Target 定义 ──────────────────────────────────────

TARGET_LABEL_claude_code="Claude Code"
TARGET_LABEL_hermes="Hermes"
TARGET_LABEL_openclaw="OpenClaw"

TARGET_ACTIVE_claude_code="$HOME/.claude-env.sh"
TARGET_ACTIVE_hermes="$HOME/.hermes/.env"
TARGET_ACTIVE_openclaw="$HOME/.openclaw/agent.yaml"

TARGET_ENVKEY_claude_code="ANTHROPIC_API_KEY"
TARGET_ENVURL_claude_code="ANTHROPIC_BASE_URL"
TARGET_ENVMODEL_claude_code="ANTHROPIC_MODEL"

TARGET_ENVKEY_hermes="OPENROUTER_API_KEY"
TARGET_ENVURL_hermes="OPENROUTER_BASE_URL"
TARGET_ENVMODEL_hermes="HERMES_MODEL"

TARGET_ENVKEY_openclaw="api_key"
TARGET_ENVURL_openclaw="base_url"
TARGET_ENVMODEL_openclaw="model_id"

# ─── 参数解析：提取 --target/-t ─────────────────────────

TARGET="$DEFAULT_TARGET"
POS_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    -t|--target)
      TARGET="$2"
      shift 2
      ;;
    -t=*|--target=*)
      TARGET="${1#*=}"
      shift
      ;;
    *)
      POS_ARGS+=("$1")
      shift
      ;;
  esac
done
set -- "${POS_ARGS[@]}"

# ─── target ID 规范化 ──────────────────────────────────

case "$TARGET" in
  cc|claude|claude-code) TARGET="claude-code" ;;
  hermes)                TARGET="hermes" ;;
  oc|openclaw|claw)      TARGET="openclaw" ;;
esac

if [ "$TARGET" != "claude-code" ] && [ "$TARGET" != "hermes" ] && [ "$TARGET" != "openclaw" ]; then
  echo -e "${RED}错误: 未知 target '$TARGET'${NC}"
  echo " 可用: claude-code, hermes, openclaw (或 cc/hermes/oc)"
  exit 1
fi

# ─── 根据 target 获取变量名 ────────────────────────────

get_envkey()   { eval "echo \$TARGET_ENVKEY_${TARGET//-/_}"; }
get_envurl()   { eval "echo \$TARGET_ENVURL_${TARGET//-/_}"; }
get_envmodel() { eval "echo \$TARGET_ENVMODEL_${TARGET//-/_}"; }
get_active()   { eval "echo \$TARGET_ACTIVE_${TARGET//-/_}"; }
get_label()    { eval "echo \$TARGET_LABEL_${TARGET//-/_}"; }

ACTIVE_FILE=$(get_active)
ENV_KEY=$(get_envkey)
ENV_URL=$(get_envurl)
ENV_MODEL=$(get_envmodel)
TARGET_LABEL=$(get_label)

# ─── profile 的 target 标记（注释行）────────────────────

TARGET_MARKER="# api-env target: "

get_profile_target() {
  local file="$1"
  if [ -f "$file" ]; then
    head -3 "$file" | grep -oP "^#\s*api-env\s+target:\s*\K\S+" 2>/dev/null
  fi
}

set_profile_target() {
  local file="$1"
  local tgt="$2"
  local marker="${TARGET_MARKER}${tgt}"
  if [ -f "$file" ]; then
    if grep -q "^#.*api-env.*target:" "$file" 2>/dev/null; then
      # 替换已有标记
      sed -i "s/^#.*api-env.*target:.*/${marker}/" "$file"
    else
      # 插入到文件头
      local tmp
      tmp=$(echo "$marker"; cat "$file")
      echo "$tmp" > "$file"
    fi
  fi
}

# ─── 当前环境状态 ─────────────────────────────────────

current_values() {
  echo "${CYAN}$ENV_KEY${NC}     = ${!ENV_KEY:+"${!ENV_KEY:0:8}...${!ENV_KEY: -4}"}"
  echo "${CYAN}$ENV_URL${NC}    = ${!ENV_URL:-"(未设置)"}"
  echo "${CYAN}$ENV_MODEL${NC}       = ${!ENV_MODEL:-"(未设置)"}"
}

# ─── 检测当前环境来源 ─────────────────────────────────

env_source() {
  if [ -n "${!ENV_KEY}" ]; then
    local src=""
    local key_val="${!ENV_KEY}"
    if [ -f "$ACTIVE_FILE" ] && grep -q "$key_val" "$ACTIVE_FILE" 2>/dev/null; then
      src="  <- $ACTIVE_FILE"
    fi
    echo " 当前激活($TARGET_LABEL): ${!ENV_KEY:0:8}...${!ENV_KEY: -4}${src}"
  else
    echo " 当前未登录 ($TARGET_LABEL)"
  fi
}

# ─── 列出所有 profile ─────────────────────────────────

list_profiles() {
  local filter="$1"  # 可选按 target 过滤
  local files=("$PROFILES_DIR"/*.env)
  if [ ! -e "${files[0]}" ]; then
    echo " (暂无保存的 profile)"
    return
  fi
  echo ""
  printf "${BOLD}%-12s %-20s %-12s %-30s %s${NC}\n" "TARGET" "PROFILE" "MODEL" "BASE_URL" "API_KEY"
  echo "─────────────────────────────────────────────────────────────────────────"
  for f in "${files[@]}"; do
    local name pt
    name=$(basename "$f" .env)
    pt=$(get_profile_target "$f")
    [ -z "$pt" ] && pt="claude-code"
    # 如果指定了 filter，只显示匹配的
    if [ -n "$filter" ] && [ "$pt" != "$filter" ]; then
      continue
    fi
    local key="" base="" model=""
    key=$(grep -E "^(ANTHROPIC_API_KEY|OPENROUTER_API_KEY|api_key)=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    base=$(grep -E "^(ANTHROPIC_BASE_URL|OPENROUTER_BASE_URL|base_url)=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    model=$(grep -E "^(ANTHROPIC_MODEL|HERMES_MODEL|model_id)=" "$f" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    local key_display="${key:+"${key:0:8}..."}"
    printf "%-12s %-20s %-12s %-30s %s\n" "$pt" "$name" "${model:-"-"}" "${base:-"-"}" "${key_display:-"-"}"
  done
  echo ""
}

# ─── 保存当前环境为 profile ───────────────────────────

save_profile() {
  local name="$1"
  if [ -z "$name" ]; then
    echo -e "${RED}错误: 请指定 profile 名称${NC}"
    echo " 用法: api-env.sh save <name>"
    return 1
  fi
  local file="$PROFILES_DIR/$name.env"
  if [ -f "$file" ]; then
    echo -n " Profile '$name' 已存在，覆盖？[y/N] "
    read -r confirm
    [ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && echo " 已取消" && return 1
  fi
  cat > "$file" <<ENVEOF
# api-env target: ${TARGET}
# Saved at: $(date)
${ENV_KEY}="${!ENV_KEY}"
${ENV_URL}="${!ENV_URL}"
${ENV_MODEL}="${!ENV_MODEL}"
ENVEOF
  echo -e "${GREEN}✓${NC} 已保存 profile '$name' (target: ${TARGET_LABEL})"
}

# ─── 加载 profile ─────────────────────────────────────

load_profile() {
  local name="$1"
  if [ -z "$name" ]; then
    echo -e "${RED}错误: 请指定 profile 名称${NC}"
    echo " 用法: api-env.sh load <name>"
    echo ""
    echo " 可用 profiles:"
    ls "$PROFILES_DIR"/*.env 2>/dev/null | while read -r f; do
      echo "   - $(basename "$f" .env)"
    done
    return 1
  fi
  local file="$PROFILES_DIR/$name.env"
  if [ ! -f "$file" ]; then
    echo -e "${RED}错误: profile '$name' 不存在${NC}"
    return 1
  fi

  # 读取 profile 的 target 标记
  local pt
  pt=$(get_profile_target "$file")
  [ -z "$pt" ] && pt="claude-code"

  # 写入 target 对应的 active 文件
  local afile
  eval "afile=\$TARGET_ACTIVE_${pt//-/_}"
  cp "$file" "$afile"
  echo -e "${GREEN}✓${NC} 已切换至 profile '$name' (target: $pt)" >&2

  # ─── 同步配置 (Claude Code 特有) ───
  if [ "$pt" = "claude-code" ]; then
    local model
    model=$(grep "^ANTHROPIC_MODEL=" "$file" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ -n "$model" ]; then
      node -e "
        const fs = require('fs');
        const path = require('path');
        const home = process.env.HOME || process.env.USERPROFILE;
        const dogeConfigPath = path.join(home, '.doge', '.claude.json');
        const settingsPath = path.join(home, '.doge', 'settings.json');

        if (fs.existsSync(dogeConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(dogeConfigPath, 'utf8'));
          cfg.model = '$model';
          if (cfg.customApiEndpoint) {
            cfg.customApiEndpoint.model = '$model';
          }
          fs.writeFileSync(dogeConfigPath, JSON.stringify(cfg, null, 2) + '\n');
          console.log('  -> .claude.json model:', '$model');
        }

        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          settings.model = '$model';
          if (settings.customApiEndpoint) {
            settings.customApiEndpoint.model = '$model';
          }
          if (!settings.env) settings.env = {};
          settings.env.ANTHROPIC_MODEL = '$model';
          fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
          console.log('  -> settings.json model:', '$model');
        }
      " 2>&1 | while IFS= read -r line; do echo -e "  ${GREEN}✓${NC} $line" >&2; done
    fi
  fi

  # ─── 输出 export 语句到 stdout（供 eval 捕获）───
  echo "# 当前 profile 变量 (target: $pt)"
  while IFS= read -r line; do
    case "$line" in
      *=*) echo "export $line" ;;
    esac
  done < "$afile"
}

# ─── 删除 profile ─────────────────────────────────────

delete_profile() {
  local name="$1"
  if [ -z "$name" ]; then
    echo -e "${RED}错误: 请指定 profile 名称${NC}"
    return 1
  fi
  local file="$PROFILES_DIR/$name.env"
  if [ ! -f "$file" ]; then
    echo -e "${RED}错误: profile '$name' 不存在${NC}"
    return 1
  fi
  echo -n " 确认删除 profile '$name'？[y/N] "
  read -r confirm
  [ "$confirm" != "y" ] && [ "$confirm" != "Y" ] && echo " 已取消" && return 1
  rm "$file"
  echo -e "${GREEN}✓${NC} 已删除 profile '$name'"
}

# ─── 显示详细信息 ─────────────────────────────────────

show_detail() {
  local name="$1"
  if [ -z "$name" ]; then
    echo -e "${RED}错误: 请指定 profile 名称${NC}"
    return 1
  fi
  local file="$PROFILES_DIR/$name.env"
  if [ ! -f "$file" ]; then
    echo -e "${RED}错误: profile '$name' 不存在${NC}"
    return 1
  fi
  local pt
  pt=$(get_profile_target "$file")
  [ -z "$pt" ] && pt="claude-code"

  echo ""
  echo "${BOLD}━━━ Profile: $name (target: $pt) ━━━${NC}"
  echo ""
  while IFS= read -r line; do
    case "$line" in
      \#*) ;;
      *)
        local k
        k=$(echo "$line" | cut -d= -f1)
        local v
        v=$(echo "$line" | cut -d= -f2- | tr -d '"' | tr -d "'")
        echo "  $k = $v"
        ;;
    esac
  done < "$file"
  echo ""
}

# ─── 列出所有 target ──────────────────────────────────

list_targets() {
  echo ""
  printf "${BOLD}%-14s %s${NC}\n" "TARGET" "LABEL"
  echo "────────────────────────────"
  echo "  claude-code   Claude Code"
  echo "  hermes        Hermes"
  echo "  openclaw      OpenClaw"
  echo ""
  echo "当前: ${BOLD}${TARGET_LABEL}${NC}"
}

# ─── 交互式菜单 ───────────────────────────────────────

interactive_menu() {
  while true; do
    clear 2>/dev/null || cls 2>/dev/null || true
    echo ""
    echo "${BOLD}╔══════════════════════════════════════════════╗${NC}"
    echo "${BOLD}║       doge API Environment Manager          ║${NC}"
    echo "${BOLD}║          当前 Target: ${TARGET_LABEL}                ║${NC}"
    echo "${BOLD}╚══════════════════════════════════════════════╝${NC}"
    echo ""
    echo "${BOLD}━━━ 当前环境 (${TARGET_LABEL}) ─────────────────────${NC}"
    current_values
    env_source
    echo ""
    echo "${BOLD}━━━ 已保存 Profiles ─────────────────────────${NC}"
    list_profiles "$TARGET"
    echo ""
    echo "  ${BOLD}1${NC}) 切换 profile"
    echo "  ${BOLD}2${NC}) 保存当前环境为 profile"
    echo "  ${BOLD}3${NC}) 查看 profile 详情"
    echo "  ${BOLD}4${NC}) 删除 profile"
    echo "  ${BOLD}5${NC}) 导出当前环境到 active 文件"
    echo "  ${BOLD}6${NC}) 切换 target"
    echo "  ${BOLD}7${NC}) 查看所有 profile (不限 target)"
    echo "  ${BOLD}0${NC}) 退出"
    echo ""
    echo -n " 选择操作 [0-7]: "
    read -r choice
    case $choice in
      1)
        echo ""
        echo " 可用 profiles:"
        local i=1
        local files=()
        for f in "$PROFILES_DIR"/*.env; do
          [ -e "$f" ] || continue
          local pt
          pt=$(get_profile_target "$f")
          [ -z "$pt" ] && pt="claude-code"
          [ "$pt" != "$TARGET" ] && continue
          files+=("$f")
          echo "  $i) $(basename "$f" .env) [$pt]"
          i=$((i+1))
        done
        [ $i -eq 1 ] && echo "  (当前 target 下无 profile)" && echo "" && echo -n " 按回车继续..." && read -r && continue
        echo ""
        echo -n " 选择 profile 编号: "
        read -r sel
        if [ "$sel" -ge 1 ] 2>/dev/null && [ "$sel" -le "${#files[@]}" ] 2>/dev/null; then
          local fname
          fname=$(basename "${files[$((sel-1))]}" .env)
          load_profile "$fname"
        else
          echo " 无效选择"
        fi
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
      2)
        echo ""
        echo -n " 输入 profile 名称: "
        read -r name
        save_profile "$name"
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
      3)
        echo ""
        echo -n " 输入 profile 名称 (留空查看列表): "
        read -r dname
        if [ -z "$dname" ]; then
          list_profiles "$TARGET"
          echo -n " 输入要查看的 profile 名称: "
          read -r dname
        fi
        [ -n "$dname" ] && show_detail "$dname"
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
      4)
        echo ""
        echo -n " 输入要删除的 profile 名称: "
        read -r rname
        [ -n "$rname" ] && delete_profile "$rname"
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
      5)
        cat > "$ACTIVE_FILE" <<EOF
${ENV_KEY}="${!ENV_KEY}"
${ENV_URL}="${!ENV_URL}"
${ENV_MODEL}="${!ENV_MODEL}"
EOF
        echo -e "${GREEN}✓${NC} 已导出到 $ACTIVE_FILE"
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
      6)
        echo ""
        echo " 可用 targets:"
        echo "  1) Claude Code"
        echo "  2) Hermes"
        echo "  3) OpenClaw"
        echo -n " 选择 target [1-3]: "
        read -r tsel
        case $tsel in
          1) TARGET="claude-code" ;;
          2) TARGET="hermes" ;;
          3) TARGET="openclaw" ;;
          *) echo " 无效选择" ;;
        esac
        # 重新计算 target 相关变量
        ACTIVE_FILE=$(get_active); ENV_KEY=$(get_envkey); ENV_URL=$(get_envurl); ENV_MODEL=$(get_envmodel); TARGET_LABEL=$(get_label)
        ;;
      7)
        list_profiles ""  # 不限 target
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
      0|"")
        echo ""
        exit 0
        ;;
      *)
        echo " 无效选择"
        echo "" && echo -n " 按回车继续..." && read -r
        ;;
    esac
  done
}

# ─── Web UI ──────────────────────────────────────────

web_ui() {
  local WEBUI_DIR
  WEBUI_DIR="$(cd "$(dirname "$0")/.." && pwd)/webui"
  local PID_FILE="/tmp/.doge-api-env-webui.pid"

  # 检查端口是否已被占用
  if netstat -ano 2>/dev/null | grep -q "127.0.0.1:3987"; then
    echo -e "${GREEN}✓${NC} Web UI 已在运行: http://127.0.0.1:3987"
    cmd //c start http://127.0.0.1:3987 2>/dev/null || \
      start http://127.0.0.1:3987 2>/dev/null || true
    return 0
  fi

  # 清理残留 PID 文件
  rm -f "$PID_FILE"

  echo " 启动 Web UI..."
  node "$WEBUI_DIR/server.js" &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  sleep 2
  echo -e "${GREEN}✓${NC} Web UI 已启动: http://127.0.0.1:3987"
  cmd //c start http://127.0.0.1:3987 2>/dev/null || \
    start http://127.0.0.1:3987 2>/dev/null || true
}

# ─── 主入口 ──────────────────────────────────────────

# 打印当前 target（如果没有其他命令）
show_target_info() {
  echo -e " Target: ${GREEN}${TARGET_LABEL}${NC}  (可用: cc/hermes/oc)"
  echo ""
}

case "${1:-}" in
  list|status|save|load|delete|interactive)
    case "$1" in
      list)       list_profiles "$TARGET" ;;
      status)     echo ""; show_target_info; current_values; env_source ;;
      save)       save_profile "$2" ;;
      load)       load_profile "$2" ;;
      delete)     delete_profile "$2" ;;
      interactive) interactive_menu ;;
    esac
    ;;
  list-targets|targets)
    list_targets
    ;;
  web)
    web_ui
    ;;
  *)
    # 默认启动 Web UI
    web_ui
    ;;
esac
