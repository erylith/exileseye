/**
 * Background service worker.
 *
 * Responsibilities:
 * - Proxy all REST calls to the PoB server (avoids mixed-content from HTTPS trade page)
 * - Store and serve extension config (server URL + token)
 * - Open the side panel when the extension action icon is clicked
 */

import type { BgRequest, BgResponse, ExtensionConfig } from './types.js';

// ---------------------------------------------------------------------------
// Side panel — open when the toolbar icon is clicked
// ---------------------------------------------------------------------------

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {/* older Chrome without sidePanel.setPanelBehavior */});

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

async function getConfig(): Promise<ExtensionConfig> {
  const result = await chrome.storage.local.get(['serverUrl', 'apiSecret']);
  return {
    serverUrl: (result.serverUrl as string | undefined) ?? '',
    apiSecret: (result.apiSecret as string | undefined) ?? '',
  };
}

async function saveConfig(config: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set(config);
}

// ---------------------------------------------------------------------------
// API proxy
// ---------------------------------------------------------------------------

async function apiCall<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<BgResponse<T>> {
  const config = await getConfig();

  if (!config.serverUrl) {
    return { ok: false, error: 'Server URL not configured — open extension options.' };
  }

  const url = `${config.serverUrl.replace(/\/$/, '')}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiSecret) {
    headers['Authorization'] = `Bearer ${config.apiSecret}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as T;

    if (!response.ok) {
      const detail = (data as { detail?: string }).detail ?? `HTTP ${response.status}`;
      return { ok: false, error: detail };
    }

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (msg: BgRequest, _sender, sendResponse: (r: BgResponse) => void) => {
    (async () => {
      switch (msg.type) {
        case 'GET_CONFIG': {
          const config = await getConfig();
          sendResponse({ ok: true, data: config });
          break;
        }
        case 'SAVE_CONFIG': {
          await saveConfig(msg.config);
          sendResponse({ ok: true });
          break;
        }
        case 'API_GET': {
          const result = await apiCall('GET', msg.path);
          sendResponse(result);
          break;
        }
        case 'API_POST': {
          const result = await apiCall('POST', msg.path, msg.body);
          sendResponse(result);
          break;
        }
        default: {
          sendResponse({ ok: false, error: 'Unknown message type' });
        }
      }
    })().catch(err => sendResponse({ ok: false, error: String(err) }));

    // Return true to keep the message channel open for the async response
    return true;
  },
);
