// ---------------------------------------------------------------------------
// Messages: content/panel → background service worker
// ---------------------------------------------------------------------------

export type BgRequest =
  | { type: 'API_GET';  path: string }
  | { type: 'API_POST'; path: string; body: unknown }
  | { type: 'GET_CONFIG' }
  | { type: 'SAVE_CONFIG'; config: ExtensionConfig };

export interface BgResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ---------------------------------------------------------------------------
// Messages: page-script → content script (via window.postMessage)
// ---------------------------------------------------------------------------

export interface PageScriptMessage {
  type: 'POB_TRADE_ITEMS';
  /** Raw GGG item objects from the /fetch endpoint response */
  items: GggItem[];
  queryId: string;
}

// ---------------------------------------------------------------------------
// Messages: content script → panel (via chrome.runtime.sendMessage)
// ---------------------------------------------------------------------------

export type ContentMessage =
  | { type: 'TRADE_ITEM_HOVER'; item: GggItem; rowId: string }
  | { type: 'SIMULATE_ITEM';    item: GggItem; rowId: string }
  | { type: 'LOCATION_CHANGE';  league: string; game: '1' | '2' };

// ---------------------------------------------------------------------------
// Config stored in chrome.storage.local
// ---------------------------------------------------------------------------

export interface ExtensionConfig {
  serverUrl: string;   // e.g. https://your-server.example.com
  apiSecret: string;   // Bearer token
}

// ---------------------------------------------------------------------------
// PoB API response shapes (minimal — extend as needed)
// ---------------------------------------------------------------------------

export interface PoolStatus {
  active: string | null;
  builds: Array<{ name: string; active: boolean; is_running: boolean }>;
}

export interface BuildInfo {
  className: string;
  ascendClassName: string;
  level: number;
  buildName: string;
}

export interface StatMap {
  [key: string]: number | string | null;
}

export interface SimulateResult {
  before: StatMap;
  after: StatMap;
  delta: Record<string, { before: number; after: number; diff: number }>;
}

// ---------------------------------------------------------------------------
// GGG trade item (minimal subset we use)
// ---------------------------------------------------------------------------

export interface GggItem {
  id: string;
  typeLine?: string;
  baseType?: string;
  name?: string;
  frameType?: number;
  itemLevel?: number;
  implicitMods?: string[];
  explicitMods?: string[];
  craftedMods?: string[];
  enchantMods?: string[];
  corrupted?: boolean;
  requirements?: Array<{ name: string; values: [[string, number]] }>;
  properties?: Array<{ name: string; values: [[string, number]]; displayMode: number }>;
  extended?: { text?: string };
}
