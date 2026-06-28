/**
 * Content script — runs in the trade page context.
 *
 * Responsibilities:
 * - Inject page-script.js to intercept trade API responses
 * - Observe the trade result DOM and inject PoB buttons per result row
 * - Bridge item data from the page script to the side panel
 */

import type { ContentMessage, GggItem, PageScriptMessage } from './types.js';

// ---------------------------------------------------------------------------
// Item cache — maps GGG item id → GggItem, populated by page-script intercept
// ---------------------------------------------------------------------------

const itemCache = new Map<string, GggItem>();

// ---------------------------------------------------------------------------
// Inject page-script into the page context
// ---------------------------------------------------------------------------

function injectPageScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('dist/page-script.js');
  script.type = 'module';
  script.onload = () => script.remove();
  (document.head ?? document.documentElement).appendChild(script);
}

// ---------------------------------------------------------------------------
// Listen for item data posted from the page script
// ---------------------------------------------------------------------------

window.addEventListener('message', (event: MessageEvent<PageScriptMessage>) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'POB_TRADE_ITEMS') return;

  for (const item of event.data.items) {
    if (item.id) {
      itemCache.set(item.id, item);
    }
  }
});

// ---------------------------------------------------------------------------
// PoB button injection into trade result rows
//
// Selectors sourced from better-trading:
//   Row:    .resultset > div.row[data-id]
//   Btns:   .details .btns  (appended here)
// ---------------------------------------------------------------------------

const POB_BTN_ATTR = 'pob-enhanced';
const ROW_SELECTOR = `.resultset > div.row[data-id]:not([${POB_BTN_ATTR}])`;

function injectPobButton(row: HTMLElement): void {
  const rowId = row.getAttribute('data-id') ?? '';
  const btnsContainer = row.querySelector<HTMLElement>('.details .btns');
  if (!btnsContainer) return;

  const btn = document.createElement('button');
  btn.className = 'pob-simulate-btn';
  btn.textContent = 'PoB';
  btn.title = 'Simulate in Path of Building';
  btn.setAttribute('aria-label', 'Simulate in Path of Building');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const item = itemCache.get(rowId);
    if (!item) {
      btn.textContent = '?';
      btn.title = 'Item data not yet loaded — try scrolling the result into view first';
      return;
    }

    btn.classList.add('pob-simulate-btn--loading');
    btn.textContent = '…';

    const msg: ContentMessage = { type: 'SIMULATE_ITEM', item, rowId };
    chrome.runtime.sendMessage(msg);
  });

  // Reset button state when panel responds (panel posts back via storage)
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes[`sim_${rowId}`]) {
      btn.classList.remove('pob-simulate-btn--loading');
      btn.textContent = 'PoB ✓';
    }
  });

  btnsContainer.appendChild(btn);
  row.setAttribute(POB_BTN_ATTR, '1');
}

function enhanceVisibleRows(): void {
  document.querySelectorAll<HTMLElement>(ROW_SELECTOR).forEach(injectPobButton);
}

// ---------------------------------------------------------------------------
// MutationObserver — watches for results appearing or changing
// ---------------------------------------------------------------------------

const observer = new MutationObserver(() => {
  enhanceVisibleRows();
});

function startObserving(): void {
  // The trade site mounts into #trade or body — observe the full document
  observer.observe(document.body, { childList: true, subtree: true });
  // Run immediately in case results are already present
  enhanceVisibleRows();
}

// ---------------------------------------------------------------------------
// Detect PoE2 vs PoE1 and active league from URL
// ---------------------------------------------------------------------------

function detectLocation(): { game: '1' | '2'; league: string } {
  const path = window.location.pathname;
  // /trade2/search/<league>/...  or  /trade/search/<league>/...
  const match = path.match(/\/trade(2?)\/search\/([^/]+)/);
  return {
    game: (match?.[1] === '2' ? '2' : '1'),
    league: match?.[2] ?? '',
  };
}

// Notify panel of current location
function notifyLocation(): void {
  const { game, league } = detectLocation();
  const msg: ContentMessage = { type: 'LOCATION_CHANGE', game, league };
  chrome.runtime.sendMessage(msg).catch(() => {/* panel not open */});
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

injectPageScript();
startObserving();
notifyLocation();

// Re-notify on SPA navigation (trade site is a React SPA)
let lastPath = window.location.pathname;
setInterval(() => {
  if (window.location.pathname !== lastPath) {
    lastPath = window.location.pathname;
    notifyLocation();
  }
}, 1000);
