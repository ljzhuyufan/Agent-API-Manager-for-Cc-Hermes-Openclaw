// ── API Helper ─────────────────────────────────────────
const API = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  async post(path, data) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async put(path, data) {
    const r = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE' });
    return r.json();
  }
};

// ── State ──────────────────────────────────────────────
let currentTarget = 'claude-code';
let targets = [];

// ── Toast ──────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2500);
}

// ── Restart Banner ────────────────────────────────────
let restartBannerTimer = null;
function showRestartBanner(profileName) {
  let banner = document.getElementById('restart-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'restart-banner';
    banner.className = 'restart-banner';
    document.querySelector('.app').insertBefore(banner, document.getElementById('status-panel'));
  }
  banner.innerHTML = `
    <strong>已切换到 ${profileName}</strong>
    需要重启对应工具后新配置才会生效
    <button class="btn btn-sm btn-ghost" onclick="this.parentElement.remove()">✕</button>
  `;
  clearTimeout(restartBannerTimer);
  restartBannerTimer = setTimeout(() => banner.remove(), 30000);
}

// ── Modal ──────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => {
    if (e.target === el) el.classList.add('hidden');
  });
});
document.getElementById('input-save-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-save-confirm').click();
});

// ── Target Tabs ───────────────────────────────────────
function renderTargetTabs(targetList) {
  const container = document.getElementById('target-tabs');
  if (!container) return;
  container.innerHTML = targetList.map(t => `
    <button class="target-tab ${t.id === currentTarget ? 'active' : ''}"
            data-target="${t.id}"
            onclick="switchTarget('${t.id}')"
            title="管理 ${t.label} 的 API 环境">
      ${t.label}
    </button>
  `).join('');
}

async function switchTarget(targetId) {
  currentTarget = targetId;
  // 更新 tab active 状态
  document.querySelectorAll('.target-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });
  // 更新 env key 标签
  const tdef = targets.find(t => t.id === targetId);
  if (tdef) {
    document.getElementById('label-apikey').textContent = tdef.envKeys.apiKey;
    document.getElementById('label-baseurl').textContent = tdef.envKeys.baseUrl;
    document.getElementById('label-model').textContent = tdef.envKeys.model;
  }
  // 更新新建 profile 弹窗中的 placeholder
  document.getElementById('target-display-create').textContent = tdef ? tdef.label : targetId;
  document.getElementById('target-display-save').textContent = tdef ? tdef.label : targetId;
  await loadData();
}

// ── Render Status ──────────────────────────────────────
function renderStatus({ active, activeProfile, target }) {
  const tdef = targets.find(t => t.id === target);
  document.getElementById('label-apikey').textContent = tdef ? tdef.envKeys.apiKey : 'API Key';
  document.getElementById('label-baseurl').textContent = tdef ? tdef.envKeys.baseUrl : 'Base URL';
  document.getElementById('label-model').textContent = tdef ? tdef.envKeys.model : 'Model';

  document.getElementById('status-key').textContent = active.apiKeyMasked || '—';
  document.getElementById('status-url').textContent = active.baseUrl || '(未设置)';
  document.getElementById('status-model').textContent = active.model || '(未设置)';

  const tag = document.getElementById('active-profile-tag');
  if (activeProfile) {
    tag.textContent = `● ${activeProfile}`;
    tag.classList.add('visible');
  } else {
    tag.classList.remove('visible');
  }
}

// ── Render Profiles ────────────────────────────────────
function renderProfiles(profileList, activeProfile) {
  const container = document.getElementById('profile-list');

  if (!profileList.length) {
    container.innerHTML = '<div class="empty">暂无 profile，保存当前环境或新建一个</div>';
    return;
  }

  container.innerHTML = profileList.map(p => {
    const isActive = p.name === activeProfile;
    const escapedName = p.name.replace(/'/g, "\\'");
    const tdef = targets.find(t => t.id === p.target) || {};
    const targetLabel = tdef.label || p.target;
    return `
      <div class="profile-card ${isActive ? 'active' : ''}" data-name="${p.name}">
        <div class="info">
          <div class="name">
            ${isActive ? '<span class="active-dot"></span>' : ''}
            ${p.name}
            <span class="target-badge">${targetLabel}</span>
          </div>
          <div class="meta">
            <span>${p.model || '—'}</span>
            <span>${p.baseUrl ? p.baseUrl.replace(/^https?:\/\//, '') : '—'}</span>
            <span>${p.apiKeyMasked || '—'}</span>
          </div>
        </div>
        <div class="actions">
          ${!isActive ? `<button class="btn btn-outline btn-sm" onclick="loadProfile('${escapedName}')">切换</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="editProfile('${escapedName}')">编辑</button>
          <button class="btn btn-ghost btn-sm" onclick="viewProfile('${escapedName}')">详情</button>
          ${!isActive ? `<button class="btn btn-danger btn-sm" onclick="deleteProfile('${escapedName}')">删除</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── Load Data ──────────────────────────────────────────
async function loadData() {
  try {
    const [status, profileData] = await Promise.all([
      API.get(`/api/status?target=${currentTarget}`),
      API.get(`/api/profiles?target=${currentTarget}`),
    ]);
    renderStatus(status);
    renderProfiles(profileData.profiles, status.activeProfile);
  } catch (e) {
    showToast('加载失败，请确认服务器已启动', 'error');
  }
}

// ── Operations ─────────────────────────────────────────

async function loadProfile(name) {
  try {
    const r = await API.post('/api/profiles/load', { name });
    if (r.ok) {
      showToast(`已切换到 ${name}`, 'success');
      showRestartBanner(name);
      loadData();
    } else {
      showToast(r.error || '切换失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
}

async function deleteProfile(name) {
  if (!confirm(`确定删除 profile「${name}」？`)) return;
  try {
    const r = await API.del(`/api/profiles/${name}`);
    if (r.ok) {
      showToast(`已删除 ${name}`, '');
      loadData();
    } else {
      showToast(r.error || '删除失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
}

async function viewProfile(name) {
  try {
    const p = await API.get(`/api/profiles/${name}`);
    const tdef = targets.find(t => t.id === p.target) || {};
    const labelKey = tdef.envKeys ? tdef.envKeys.apiKey : 'API Key';
    const labelUrl = tdef.envKeys ? tdef.envKeys.baseUrl : 'Base URL';
    const labelModel = tdef.envKeys ? tdef.envKeys.model : 'Model';

    document.getElementById('detail-title').textContent = `Profile: ${p.name}`;
    document.getElementById('detail-content').innerHTML = `
      <div class="env-row"><span class="env-key">Target</span><code class="env-val">${tdef.label || p.target}</code></div>
      <div class="env-row"><span class="env-key">${labelKey}</span><code class="env-val">${p.apiKeyMasked || '—'}</code></div>
      <div class="env-row"><span class="env-key">${labelUrl}</span><code class="env-val ${p.baseUrl ? '' : 'dim'}">${p.baseUrl || '(未设置)'}</code></div>
      <div class="env-row"><span class="env-key">${labelModel}</span><code class="env-val ${p.model ? '' : 'dim'}">${p.model || '(未设置)'}</code></div>
    `;
    openModal('modal-detail');
  } catch (e) {
    showToast('加载失败', 'error');
  }
}

// ── Edit Profile ───────────────────────────────────────
async function editProfile(name) {
  try {
    const p = await API.get(`/api/profiles/${name}`);
    const tdef = targets.find(t => t.id === p.target) || {};
    document.getElementById('input-edit-name').value = p.name;
    document.getElementById('input-edit-key').value = p.apiKey || '';
    document.getElementById('input-edit-url').value = p.baseUrl || '';
    document.getElementById('input-edit-model').value = p.model || '';
    document.getElementById('label-edit-apikey').textContent = tdef.envKeys ? tdef.envKeys.apiKey : 'API Key';
    document.getElementById('label-edit-baseurl').textContent = tdef.envKeys ? tdef.envKeys.baseUrl : 'Base URL';
    document.getElementById('label-edit-model').textContent = tdef.envKeys ? tdef.envKeys.model : 'Model';
    document.getElementById('modal-edit-desc').textContent = `修改 ${p.name} 的连接信息 (${tdef.label || p.target})`;
    openModal('modal-edit');
    setTimeout(() => document.getElementById('input-edit-key').focus(), 100);
  } catch (e) {
    showToast('加载 profile 失败', 'error');
  }
}

// ── Save Current ───────────────────────────────────────
document.getElementById('btn-save-current').addEventListener('click', () => {
  document.getElementById('input-save-name').value = '';
  const tdef = targets.find(t => t.id === currentTarget);
  document.getElementById('target-display-save').textContent = tdef ? tdef.label : currentTarget;
  openModal('modal-save');
  setTimeout(() => document.getElementById('input-save-name').focus(), 100);
});

document.getElementById('btn-save-confirm').addEventListener('click', async () => {
  const name = document.getElementById('input-save-name').value.trim();
  if (!name) { showToast('请输入名称', 'error'); return; }
  try {
    const r = await API.post('/api/profiles/save', { name, target: currentTarget });
    if (r.ok) {
      closeModal('modal-save');
      showToast(`已保存为 ${name}`, 'success');
      loadData();
    } else {
      showToast(r.error || '保存失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
});

// ── Create New ─────────────────────────────────────────
document.getElementById('btn-new-profile').addEventListener('click', () => {
  document.getElementById('input-create-name').value = '';
  document.getElementById('input-create-key').value = '';
  document.getElementById('input-create-url').value = '';
  document.getElementById('input-create-model').value = '';
  const tdef = targets.find(t => t.id === currentTarget);
  document.getElementById('target-display-create').textContent = tdef ? tdef.label : currentTarget;
  document.getElementById('label-create-apikey').textContent = tdef ? tdef.envKeys.apiKey : 'API Key';
  document.getElementById('label-create-baseurl').textContent = tdef ? tdef.envKeys.baseUrl : 'Base URL';
  document.getElementById('label-create-model').textContent = tdef ? tdef.envKeys.model : 'Model';
  openModal('modal-create');
  setTimeout(() => document.getElementById('input-create-name').focus(), 100);
});

document.getElementById('btn-create-confirm').addEventListener('click', async () => {
  const name = document.getElementById('input-create-name').value.trim();
  const apiKey = document.getElementById('input-create-key').value.trim();
  const baseUrl = document.getElementById('input-create-url').value.trim();
  const model = document.getElementById('input-create-model').value.trim();

  if (!name) { showToast('请输入名称', 'error'); return; }
  if (!apiKey) { showToast('请输入 API Key', 'error'); return; }

  try {
    const r = await API.post('/api/profiles', { name, apiKey, baseUrl, model, target: currentTarget });
    if (r.ok) {
      closeModal('modal-create');
      showToast(`已创建 ${name}`, 'success');
      loadData();
    } else {
      showToast(r.error || '创建失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
});

// ── Edit Profile Submit ─────────────────────────────────
document.getElementById('input-edit-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-edit-confirm').click();
});

document.getElementById('btn-edit-confirm').addEventListener('click', async () => {
  const name = document.getElementById('input-edit-name').value.trim();
  const apiKey = document.getElementById('input-edit-key').value.trim();
  const baseUrl = document.getElementById('input-edit-url').value.trim();
  const model = document.getElementById('input-edit-model').value.trim();

  if (!name) { showToast('请输入名称', 'error'); return; }
  if (!apiKey) { showToast('请输入 API Key', 'error'); return; }

  try {
    const r = await API.put(`/api/profiles/${encodeURIComponent(name)}`, { apiKey, baseUrl, model, target: currentTarget });
    if (r.ok) {
      closeModal('modal-edit');
      showToast(`已更新 ${name}`, 'success');
      loadData();
    } else {
      showToast(r.error || '更新失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
});

// ── Refresh ────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', loadData);

// ── Tab 可见时刷新 ────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadData();
});

// ── Init ───────────────────────────────────────────────
async function init() {
  try {
    const data = await API.get('/api/targets');
    targets = data.targets;
    currentTarget = data.default;
    renderTargetTabs(targets);
    // 设置初始标签
    const tdef = targets.find(t => t.id === currentTarget);
    if (tdef) {
      document.getElementById('label-apikey').textContent = tdef.envKeys.apiKey;
      document.getElementById('label-baseurl').textContent = tdef.envKeys.baseUrl;
      document.getElementById('label-model').textContent = tdef.envKeys.model;
    }
    await loadData();
  } catch (e) {
    showToast('连接服务器失败，请确认 Web UI 已启动', 'error');
  }
}

init();
