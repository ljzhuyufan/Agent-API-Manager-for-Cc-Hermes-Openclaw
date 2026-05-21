const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3987;
const PUBLIC_DIR = path.join(__dirname, 'public');
const HOME = os.homedir();
const PROFILES_DIR = path.join(HOME, '.doge', 'api-profiles');
const NOTIFY_FILE = path.join(PROFILES_DIR, '.switch-notify');

// ── TARGET DEFINITIONS ────────────────────────────────────

const TARGETS = {
  'claude-code': {
    label: 'Claude Code',
    configDir: path.join(HOME, '.doge'),
    activeFile: path.join(HOME, '.claude-env.sh'),
    envKeys: {
      apiKey: 'ANTHROPIC_API_KEY',
      baseUrl: 'ANTHROPIC_BASE_URL',
      model: 'ANTHROPIC_MODEL',
    },
    // 切换 profile 时的额外同步文件
    sync: [
      {
        path: path.join(HOME, '.doge', 'settings.json'),
        type: 'json',
        writable: true,
        // model 同步到哪些 field path
        modelFields: ['model', 'customApiEndpoint.model'],
        // 额外 env 变量同步
        envFields: { ANTHROPIC_MODEL: 'model' },
      },
      {
        path: path.join(HOME, '.doge', '.claude.json'),
        type: 'json',
        writable: true,
        modelFields: ['model', 'customApiEndpoint.model'],
      },
    ],
  },

  'hermes': {
    label: 'Hermes',
    configDir: path.join(HOME, '.hermes'),
    activeFile: path.join(HOME, '.hermes', '.env'),
    envKeys: {
      apiKey: 'OPENROUTER_API_KEY',
      baseUrl: 'OPENROUTER_BASE_URL',
      model: 'HERMES_MODEL',
    },
    sync: [
      {
        path: path.join(HOME, '.hermes', '.env'),
        type: 'dotenv',
        writable: true,
      },
      {
        path: path.join(HOME, '.hermes', 'config.yaml'),
        type: 'yaml',
        writable: true,
        fields: { 'provider.name': 'openrouter' },
      },
    ],
  },

  'openclaw': {
    label: 'OpenClaw',
    configDir: path.join(HOME, '.openclaw'),
    // OpenClaw 通过 /model 命令切换 model，这里主要管理 api_key + base_url
    activeFile: path.join(HOME, '.openclaw', 'agent.yaml'),
    envKeys: {
      apiKey: 'api_key',
      baseUrl: 'base_url',
      model: 'model_id',
    },
    sync: [
      {
        path: path.join(HOME, '.openclaw', 'agent.yaml'),
        type: 'json_or_yaml',
        writable: true,
      },
    ],
  },
};

const TARGET_LIST = Object.keys(TARGETS);
const DEFAULT_TARGET = 'claude-code';

// ── TARGET MARKER ─────────────────────────────────────────
// profile .env 文件头部注释: # api-env target: <name>

const TARGET_MARKER_RE = /^#\s*api-env\s+target:\s*(\S+)\s*$/m;

function getProfileTarget(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const head = fs.readFileSync(filePath, 'utf-8').split('\n').slice(0, 3).join('\n');
  const m = head.match(TARGET_MARKER_RE);
  return m ? m[1] : null;
}

function setProfileTarget(filePath, target) {
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }
  const lines = content.split('\n');
  // 检查是否已有 target marker
  const markerIdx = lines.findIndex(l => TARGET_MARKER_RE.test(l));
  const markerLine = `# api-env target: ${target}`;
  if (markerIdx >= 0) {
    lines[markerIdx] = markerLine;
  } else {
    lines.unshift(markerLine);
  }
  // 确保末尾有换行
  const newContent = lines.join('\n').trimEnd() + '\n';
  fs.writeFileSync(filePath, newContent, 'utf-8');
}

// ── YAML 简单解析（仅处理我们需要的层级）──────────────────

function parseYAML(text) {
  const result = {};
  const lines = text.split('\n');
  let currentKey = null;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('  ') || trimmed.startsWith('\t')) {
      // nested key
      if (currentKey && !result[currentKey]) result[currentKey] = {};
      const m = trimmed.match(/^\s+(\S[^:]*):\s*(.*)$/);
      if (m && currentKey) {
        let val = m[2].trim();
        val = val.replace(/^["']|["']$/g, '');
        result[currentKey][m[1].trim()] = val;
      }
    } else {
      const m = trimmed.match(/^(\S[^:]*):\s*(.*)$/);
      if (m) {
        currentKey = m[1].trim();
        let val = m[2].trim();
        if (val === '') {
          result[currentKey] = {};
        } else {
          val = val.replace(/^["']|["']$/g, '');
          result[currentKey] = val;
        }
      }
    }
  }
  return result;
}

function writeYAML(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const [nk, nv] of Object.entries(value)) {
        lines.push(`  ${nk}: ${nv}`);
      }
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n') + '\n';
}

// ── 解析 JSON 或 YAML（通过格式自动判断）─────────────────

function parseJSONorYAML(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }
  return parseYAML(trimmed);
}

function writeJSONorYAML(filePath, data) {
  // 读原文件判断格式
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (content.startsWith('{')) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
      return;
    }
  }
  // 默认 YAML
  fs.writeFileSync(filePath, writeYAML(data), 'utf-8');
}

// ── 确保目录存在 ───────────────────────────────────────────
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });

// ── 工具函数 ──────────────────────────────────────────────

function parseEnvFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?(\w+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function writeEnvFile(filePath, env, exportVars = false) {
  const lines = [];
  // 保留原有 target marker
  if (fs.existsSync(filePath)) {
    const old = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const l of old) {
      if (TARGET_MARKER_RE.test(l)) {
        lines.push(l);
        break;
      }
    }
  }
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue;
    const prefix = exportVars ? 'export ' : '';
    lines.push(`${prefix}${k}="${v}"`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

function listProfiles(targetFilter) {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.env'));
  if (!targetFilter) return files.map(f => f.replace(/\.env$/, ''));
  return files
    .filter(f => {
      const t = getProfileTarget(path.join(PROFILES_DIR, f));
      // 无标记视为 claude-code
      return (t || DEFAULT_TARGET) === targetFilter;
    })
    .map(f => f.replace(/\.env$/, ''));
}

function getProfile(name) {
  const filePath = path.join(PROFILES_DIR, `${name}.env`);
  if (!fs.existsSync(filePath)) return null;
  return parseEnvFile(filePath);
}

function getActiveEnv(target) {
  const tdef = TARGETS[target || DEFAULT_TARGET];
  if (!tdef) return {};
  if (!fs.existsSync(tdef.activeFile)) return {};
  return parseEnvFile(tdef.activeFile);
}

function findActiveProfile(target) {
  const tdef = TARGETS[target || DEFAULT_TARGET];
  if (!tdef) return null;
  const active = getActiveEnv(target);
  const activeKey = active[tdef.envKeys.apiKey];
  const activeUrl = active[tdef.envKeys.baseUrl];
  if (!activeKey) return null;

  for (const name of listProfiles(target)) {
    const p = getProfile(name);
    if (p[tdef.envKeys.apiKey] === activeKey && p[tdef.envKeys.baseUrl] === activeUrl) {
      return name;
    }
  }
  return null;
}

// Map env vars to short keys for given target
function toShortKeys(env, target) {
  const tdef = TARGETS[target || DEFAULT_TARGET];
  return {
    apiKey: env[tdef.envKeys.apiKey] || '',
    baseUrl: env[tdef.envKeys.baseUrl] || '',
    model: env[tdef.envKeys.model] || '',
  };
}

function toEnvKeys(obj, target) {
  const tdef = TARGETS[target || DEFAULT_TARGET];
  const env = {};
  if (obj.apiKey) env[tdef.envKeys.apiKey] = obj.apiKey;
  if (obj.baseUrl) env[tdef.envKeys.baseUrl] = obj.baseUrl;
  if (obj.model) env[tdef.envKeys.model] = obj.model;
  return env;
}

function maskKey(key) {
  if (!key || key.length < 8) return key;
  return key.slice(0, 7) + '...' + key.slice(-4);
}

// ── 同步 profile 到 target ─────────────────────────────

function setNested(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function applyProfile(targetName, env) {
  const tdef = TARGETS[targetName];
  if (!tdef) return;

  // 1. 写入 active env 文件
  const exportVars = targetName === 'claude-code';
  const dir = path.dirname(tdef.activeFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeEnvFile(tdef.activeFile, env, exportVars);

  // 2. 处理 sync 文件
  for (const sync of tdef.sync) {
    if (!sync.writable) continue;
    const syncDir = path.dirname(sync.path);
    if (!fs.existsSync(syncDir)) fs.mkdirSync(syncDir, { recursive: true });

    try {
      if (sync.type === 'json') {
        // 写入 JSON config 文件
        let cfg = {};
        if (fs.existsSync(sync.path)) {
          cfg = JSON.parse(fs.readFileSync(sync.path, 'utf-8'));
        }
        // 同步 model
        if (sync.modelFields && env[tdef.envKeys.model]) {
          for (const f of sync.modelFields) {
            setNested(cfg, f, env[tdef.envKeys.model]);
          }
        }
        // 同步 env 变量
        if (sync.envFields) {
          for (const [envKey, profileKey] of Object.entries(sync.envFields)) {
            if (env[profileKey]) {
              setNested(cfg, `env.${envKey}`, env[profileKey]);
            }
          }
        }
        fs.writeFileSync(sync.path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
      } else if (sync.type === 'dotenv') {
        // 写入 dotenv 文件
        let existing = {};
        if (fs.existsSync(sync.path)) {
          existing = parseEnvFile(sync.path);
        }
        // 合并 env values
        for (const [k, v] of Object.entries(env)) {
          if (v) existing[k] = v;
        }
        writeEnvFile(sync.path, existing, false);
      } else if (sync.type === 'yaml') {
        // 写入 YAML config 文件
        let cfg = {};
        if (fs.existsSync(sync.path)) {
          const content = fs.readFileSync(sync.path, 'utf-8');
          cfg = parseYAML(content);
        }
        if (sync.fields) {
          for (const [ypath, value] of Object.entries(sync.fields)) {
            setNested(cfg, ypath, value);
          }
        }
        fs.writeFileSync(sync.path, writeYAML(cfg), 'utf-8');
      } else if (sync.type === 'json_or_yaml') {
        // 自适应 JSON 或 YAML
        let cfg = {};
        if (fs.existsSync(sync.path)) {
          const content = fs.readFileSync(sync.path, 'utf-8');
          cfg = parseJSONorYAML(content);
        }
        // 写入 api_key / base_url / model
        if (env[tdef.envKeys.apiKey]) cfg.api_key = env[tdef.envKeys.apiKey];
        if (env[tdef.envKeys.baseUrl]) cfg.base_url = env[tdef.envKeys.baseUrl];
        if (env[tdef.envKeys.model]) {
          if (!cfg.model) cfg.model = {};
          cfg.model.id = env[tdef.envKeys.model];
        }
        writeJSONorYAML(sync.path, cfg);
      }
    } catch (e) {
      console.error('applyProfile sync failed for', sync.path, ':', e.message);
    }
  }
}

// ── JSON 响应 ─────────────────────────────────────────────

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

// ── API 路由 ──────────────────────────────────────────────

function getQueryParam(urlObj, key) {
  return urlObj.searchParams.get(key) || '';
}

function handleAPI(method, urlObj, body, res) {
  const parts = urlObj.pathname.split('/').filter(Boolean);

  // GET /api/targets
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'targets') {
    const list = TARGET_LIST.map(id => ({
      id,
      label: TARGETS[id].label,
      envKeys: TARGETS[id].envKeys,
      configDir: TARGETS[id].configDir.replace(HOME, '~'),
    }));
    return json(res, { targets: list, default: DEFAULT_TARGET });
  }

  // GET /api/status
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'status') {
    const target = getQueryParam(urlObj, 'target') || DEFAULT_TARGET;
    const tdef = TARGETS[target];
    if (!tdef) return json(res, { error: 'Unknown target' }, 400);
    const active = toShortKeys(getActiveEnv(target), target);
    const profiles = listProfiles(target);
    return json(res, {
      target,
      active: { ...active, apiKeyMasked: maskKey(active.apiKey) },
      activeProfile: findActiveProfile(target),
      profiles,
    });
  }

  // GET /api/poll
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'poll') {
    if (fs.existsSync(NOTIFY_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(NOTIFY_FILE, 'utf-8'));
        return json(res, { switched: true, name: data.name, timestamp: data.timestamp, target: data.target });
      } catch { /* ignore */ }
    }
    return json(res, { switched: false });
  }

  // POST /api/poll/ack
  if (method === 'POST' && parts[0] === 'api' && parts[1] === 'poll' && parts[2] === 'ack') {
    try { fs.unlinkSync(NOTIFY_FILE); } catch { /* ignore */ }
    return json(res, { ok: true });
  }

  // GET /api/profiles
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'profiles' && !parts[2]) {
    const targetFilter = getQueryParam(urlObj, 'target') || '';
    const names = listProfiles(targetFilter || null);
    const profiles = names.map(name => {
      const p = getProfile(name);
      const pt = getProfileTarget(path.join(PROFILES_DIR, `${name}.env`)) || DEFAULT_TARGET;
      const tdef = TARGETS[pt] || TARGETS[DEFAULT_TARGET];
      return {
        name,
        target: pt,
        ...toShortKeys(p, pt),
        apiKeyMasked: maskKey(p[tdef.envKeys.apiKey]),
      };
    });
    return json(res, { profiles });
  }

  // GET /api/profiles/:name
  if (method === 'GET' && parts[0] === 'api' && parts[1] === 'profiles' && parts[2]) {
    const name = parts[2];
    const p = getProfile(name);
    if (!p) return json(res, { error: 'Profile not found' }, 404);
    const pt = getProfileTarget(path.join(PROFILES_DIR, `${name}.env`)) || DEFAULT_TARGET;
    const tdef = TARGETS[pt] || TARGETS[DEFAULT_TARGET];
    return json(res, { name, target: pt, ...toShortKeys(p, pt), apiKeyMasked: maskKey(p[tdef.envKeys.apiKey]) });
  }

  // POST /api/profiles/load
  if (method === 'POST' && parts[0] === 'api' && parts[1] === 'profiles' && parts[2] === 'load') {
    try {
      const { name } = JSON.parse(body);
      const filePath = path.join(PROFILES_DIR, `${name}.env`);
      const p = getProfile(name);
      if (!p) return json(res, { error: `Profile "${name}" not found` }, 404);
      const target = getProfileTarget(filePath) || DEFAULT_TARGET;
      // 写入 target 的 activeFile + sync
      applyProfile(target, p);
      // 通知 Web UI（CC 本身无法从 Web UI 收到通知，但在同一 host 上可用）
      fs.writeFileSync(NOTIFY_FILE, JSON.stringify({ name, target, timestamp: Date.now() }), 'utf-8');
      return json(res, { ok: true, name, target });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // POST /api/profiles/save
  if (method === 'POST' && parts[0] === 'api' && parts[1] === 'profiles' && parts[2] === 'save') {
    try {
      const { name, target } = JSON.parse(body);
      if (!name) return json(res, { error: 'Name required' }, 400);
      const actualTarget = target || DEFAULT_TARGET;
      const tdef = TARGETS[actualTarget];
      if (!tdef) return json(res, { error: `Unknown target: ${actualTarget}` }, 400);
      const active = getActiveEnv(actualTarget);
      const env = toEnvKeys(toShortKeys(active, actualTarget), actualTarget);
      const filePath = path.join(PROFILES_DIR, `${name}.env`);
      writeEnvFile(filePath, env, false);
      setProfileTarget(filePath, actualTarget);
      return json(res, { ok: true, name, target: actualTarget });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // POST /api/profiles (create)
  if (method === 'POST' && parts[0] === 'api' && parts[1] === 'profiles' && !parts[2]) {
    try {
      const data = JSON.parse(body);
      if (!data.name) return json(res, { error: 'Name required' }, 400);
      const target = data.target || DEFAULT_TARGET;
      const tdef = TARGETS[target];
      if (!tdef) return json(res, { error: `Unknown target: ${target}` }, 400);
      const env = toEnvKeys(data, target);
      const filePath = path.join(PROFILES_DIR, `${data.name}.env`);
      writeEnvFile(filePath, env, false);
      setProfileTarget(filePath, target);
      return json(res, { ok: true, name: data.name, target });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // PUT /api/profiles/:name (update)
  if (method === 'PUT' && parts[0] === 'api' && parts[1] === 'profiles' && parts[2]) {
    try {
      const name = parts[2];
      const filePath = path.join(PROFILES_DIR, `${name}.env`);
      if (!fs.existsSync(filePath)) return json(res, { error: 'Profile not found' }, 404);
      const target = getProfileTarget(filePath) || DEFAULT_TARGET;
      const tdef = TARGETS[target] || TARGETS[DEFAULT_TARGET];
      const existing = getProfile(name);
      const data = JSON.parse(body);
      if (data.apiKey != null) existing[tdef.envKeys.apiKey] = data.apiKey;
      if (data.baseUrl != null) existing[tdef.envKeys.baseUrl] = data.baseUrl;
      if (data.model != null) existing[tdef.envKeys.model] = data.model;
      writeEnvFile(filePath, existing, false);
      setProfileTarget(filePath, data.target || target);
      // 如果编辑的是当前激活的 profile，同步更新
      if (findActiveProfile(target) === name) {
        applyProfile(target, existing);
      }
      return json(res, { ok: true, name, target });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  // DELETE /api/profiles/:name
  if (method === 'DELETE' && parts[0] === 'api' && parts[1] === 'profiles' && parts[2]) {
    const name = parts[2];
    const filePath = path.join(PROFILES_DIR, `${name}.env`);
    if (!fs.existsSync(filePath)) return json(res, { error: 'Profile not found' }, 404);
    fs.unlinkSync(filePath);
    return json(res, { ok: true });
  }

  // 404
  json(res, { error: 'Not found' }, 404);
}

// ── MIME 类型 ─────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// ── 启动 HTTP 服务 ───────────────────────────────────────

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // API 路由
  if (urlObj.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => handleAPI(method, urlObj, body, res));
    return;
  }

  // 静态文件
  let filePath = path.join(PUBLIC_DIR, urlObj.pathname === '/' ? 'index.html' : urlObj.pathname);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // fallback to index.html for SPA
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`  doge API Env Manager  →  http://127.0.0.1:${PORT}`);
  console.log(`  Profiles: ${PROFILES_DIR}`);
  console.log(`  Targets:  ${TARGET_LIST.join(', ')}`);
  console.log(`  Active:   ${TARGETS[DEFAULT_TARGET].activeFile}`);
});
