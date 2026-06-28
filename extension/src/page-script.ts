/**
 * Page script — injected into the trade page context (NOT extension context).
 *
 * Intercepts the trade site's /fetch API responses so we can get raw GGG item
 * JSON before it's rendered to the DOM. Posts results to the content script
 * via window.postMessage.
 *
 * This file runs in the page's JS context, so it has access to window.fetch
 * but NOT to chrome.* APIs.
 */

import type { PageScriptMessage } from './types.js';

const FETCH_PATTERN = /\/api\/trade2?\/fetch\//;

const originalFetch = window.fetch.bind(window);

window.fetch = async function (input, init) {
  const response = await originalFetch(input, init);

  const url = typeof input === 'string' ? input : (input as Request).url;
  if (FETCH_PATTERN.test(url)) {
    response.clone().json().then((data: unknown) => {
      // GGG fetch response: { result: [{ item: GggItem, ... }], ... }
      const result = (data as { result?: Array<{ item: unknown }> }).result;
      if (!Array.isArray(result)) return;

      const items = result
        .map((r) => r?.item)
        .filter((item): item is NonNullable<typeof item> => item != null);

      if (items.length === 0) return;

      // Extract query ID from URL: /fetch/id1,id2?query=<id>
      const queryMatch = url.match(/[?&]query=([^&]+)/);
      const queryId = queryMatch?.[1] ?? '';

      const msg: PageScriptMessage = {
        type: 'POB_TRADE_ITEMS',
        items: items as import('./types.js').GggItem[],
        queryId,
      };

      window.postMessage(msg, window.location.origin);
    }).catch(() => {/* non-JSON or network error — ignore */});
  }

  return response;
};
