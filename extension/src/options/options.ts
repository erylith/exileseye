import type { BgRequest, BgResponse, ExtensionConfig } from '../types.js';

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function showStatus(msg: string, ok: boolean): void {
  const div = el('status');
  div.textContent = msg;
  div.className = `status status--${ok ? 'ok' : 'error'}`;
  div.classList.remove('hidden');
}

async function loadConfig(): Promise<void> {
  const res = await chrome.runtime.sendMessage<BgRequest, BgResponse<ExtensionConfig>>(
    { type: 'GET_CONFIG' }
  );
  if (res.ok && res.data) {
    el<HTMLInputElement>('server-url').value = res.data.serverUrl;
    el<HTMLInputElement>('api-secret').value = res.data.apiSecret;
  }
}

async function saveConfig(): Promise<void> {
  const config: ExtensionConfig = {
    serverUrl: el<HTMLInputElement>('server-url').value.trim(),
    apiSecret: el<HTMLInputElement>('api-secret').value.trim(),
  };

  await chrome.runtime.sendMessage<BgRequest, BgResponse>(
    { type: 'SAVE_CONFIG', config }
  );

  showStatus('Settings saved.', true);
}

async function testConnection(): Promise<void> {
  const btn = el<HTMLButtonElement>('btn-test');
  btn.disabled = true;
  btn.textContent = 'Testing…';

  const res = await chrome.runtime.sendMessage<BgRequest, BgResponse<{
    status: string;
    active_build: string | null;
    pool_size: number;
  }>>({ type: 'API_GET', path: '/api/health' });

  btn.disabled = false;
  btn.textContent = 'Test connection';

  if (res.ok && res.data?.status === 'ok') {
    const build = res.data.active_build
      ? `Active build: ${res.data.active_build}`
      : 'No build loaded';
    showStatus(`Connected ✓  —  ${build}  (pool: ${res.data.pool_size})`, true);
  } else {
    showStatus(`Connection failed: ${res.error ?? 'unknown error'}`, false);
  }
}

el('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await saveConfig();
});

el('btn-test').addEventListener('click', async () => {
  await saveConfig();
  await testConnection();
});

loadConfig();
