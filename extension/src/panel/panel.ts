/**
 * Side panel script.
 *
 * Shows the active PoB build's stats and handles item simulation requests
 * sent from the content script when the user clicks a "PoB" button on a
 * trade result row.
 */

import type {
  BgRequest,
  BgResponse,
  BuildInfo,
  ContentMessage,
  GggItem,
  SimulateResult,
  StatMap,
} from '../types.js';

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------

function bgGet<T>(path: string): Promise<BgResponse<T>> {
  const msg: BgRequest = { type: 'API_GET', path };
  return chrome.runtime.sendMessage<BgRequest, BgResponse<T>>(msg);
}

function bgPost<T>(path: string, body: unknown): Promise<BgResponse<T>> {
  const msg: BgRequest = { type: 'API_POST', path, body };
  return chrome.runtime.sendMessage<BgRequest, BgResponse<T>>(msg);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function show(id: string): void { el(id).classList.remove('hidden'); }
function hide(id: string): void { el(id).classList.add('hidden'); }

function showState(state: 'unconfigured' | 'connecting' | 'no-build' | 'main'): void {
  for (const s of ['unconfigured', 'connecting', 'no-build', 'main']) {
    const id = `state-${s}`;
    s === state ? show(id) : hide(id);
  }
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtDelta(diff: number): string {
  return diff > 0 ? `+${fmt(diff)}` : fmt(diff);
}

// ---------------------------------------------------------------------------
// Curated stat display list
// ---------------------------------------------------------------------------

const STAT_LABELS: [string, string][] = [
  ['TotalDPS',          'Total DPS'],
  ['CombinedDPS',       'Combined DPS'],
  ['Life',              'Life'],
  ['EnergyShield',      'Energy Shield'],
  ['Mana',              'Mana'],
  ['TotalEHP',          'EHP'],
  ['Armour',            'Armour'],
  ['Evasion',           'Evasion'],
  ['FireResist',        'Fire Res'],
  ['ColdResist',        'Cold Res'],
  ['LightningResist',   'Light Res'],
  ['ChaosResist',       'Chaos Res'],
];

// ---------------------------------------------------------------------------
// Build display
// ---------------------------------------------------------------------------

function renderBuildStats(stats: StatMap, info: BuildInfo): void {
  el('build-name').textContent = info.buildName || `${info.className}`;
  el('build-meta').textContent =
    `${info.ascendClassName || info.className} · Lv ${info.level}`;

  const grid = el('build-stats');
  grid.innerHTML = '';

  for (const [key, label] of STAT_LABELS) {
    const val = stats[key];
    if (val == null || val === 0) continue;
    const row = document.createElement('div');
    row.className = 'stat-row';
    row.innerHTML =
      `<span class="stat-row__label">${label}</span>` +
      `<span class="stat-row__value">${typeof val === 'number' ? fmt(val) : val}</span>`;
    grid.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Simulation display
// ---------------------------------------------------------------------------

function renderSimulation(item: GggItem, result: SimulateResult): void {
  const name = item.typeLine || item.baseType || item.name || 'Item';
  el('sim-item-name').textContent = name;

  const grid = el('sim-delta');
  grid.innerHTML = '';

  const sortedDelta = Object.entries(result.delta)
    .filter(([key]) => STAT_LABELS.some(([k]) => k === key))
    .sort(([, a], [, b]) => Math.abs(b.diff) - Math.abs(a.diff));

  if (sortedDelta.length === 0) {
    grid.innerHTML = '<p class="muted">No significant stat changes.</p>';
  } else {
    for (const [key, { diff }] of sortedDelta) {
      const label = STAT_LABELS.find(([k]) => k === key)?.[1] ?? key;
      const row = document.createElement('div');
      row.className = 'delta-row';
      const cls = diff > 0 ? 'pos' : diff < 0 ? 'neg' : 'neu';
      row.innerHTML =
        `<span class="delta-row__label">${label}</span>` +
        `<span class="delta-row__value--${cls}">${fmtDelta(diff)}</span>`;
      grid.appendChild(row);
    }
  }

  show('simulate-section');
}

// ---------------------------------------------------------------------------
// Upgrade opportunities
// ---------------------------------------------------------------------------

async function loadUpgrades(): Promise<void> {
  const list = el('upgrade-list');
  list.innerHTML = '<p class="muted">Calculating…</p>';

  const res = await bgGet<{ items: Array<{
    slot: string;
    itemName: string;
    delta: Record<string, { with: number; without: number; diff: number }>;
  }> }>('/api/items/all/impact');

  if (!res.ok || !res.data) {
    list.innerHTML = `<p class="muted">Error: ${res.error ?? 'unknown'}</p>`;
    return;
  }

  // Sort by TotalDPS or CombinedDPS impact (highest loss when unequipped = biggest upgrade slot)
  const items = res.data.items
    .filter(it => it.delta && Object.keys(it.delta).length > 0)
    .sort((a, b) => {
      const aImpact = Math.abs(a.delta['TotalDPS']?.diff ?? a.delta['CombinedDPS']?.diff ?? 0);
      const bImpact = Math.abs(b.delta['TotalDPS']?.diff ?? b.delta['CombinedDPS']?.diff ?? 0);
      return bImpact - aImpact;
    })
    .slice(0, 6);

  if (items.length === 0) {
    list.innerHTML = '<p class="muted">No equipped items to analyse.</p>';
    return;
  }

  list.innerHTML = '';
  for (const item of items) {
    const dpsDelta = item.delta['TotalDPS'] ?? item.delta['CombinedDPS'];
    const lifeDelta = item.delta['Life'];

    const el2 = document.createElement('div');
    el2.className = 'upgrade-item';

    const dpsLine = dpsDelta
      ? `DPS ${fmt(Math.abs(dpsDelta.diff))} (${dpsDelta.diff < 0 ? 'loss' : 'gain'} when removed)`
      : '';
    const lifeLine = lifeDelta
      ? `Life ${fmt(Math.abs(lifeDelta.diff))}`
      : '';

    el2.innerHTML =
      `<div class="upgrade-item__slot">${item.slot}</div>` +
      `<div class="upgrade-item__current">${item.itemName}</div>` +
      (dpsLine ? `<div class="upgrade-item__delta">${dpsLine}</div>` : '') +
      (lifeLine ? `<div class="upgrade-item__delta">${lifeLine}</div>` : '');

    list.appendChild(el2);
  }
}

// ---------------------------------------------------------------------------
// Main load sequence
// ---------------------------------------------------------------------------

async function loadBuild(): Promise<void> {
  showState('connecting');

  // 1. Check config
  const configRes = await chrome.runtime.sendMessage<BgRequest, BgResponse<{serverUrl: string}>>(
    { type: 'GET_CONFIG' }
  );
  if (!configRes.ok || !configRes.data?.serverUrl) {
    showState('unconfigured');
    return;
  }

  // 2. Health check
  const health = await bgGet<{ active_build: string | null }>('/api/health');
  if (!health.ok) {
    showState('unconfigured');
    return;
  }

  if (!health.data?.active_build) {
    showState('no-build');
    return;
  }

  // 3. Load build info + stats in parallel
  const [infoRes, statsRes] = await Promise.all([
    bgGet<BuildInfo>('/api/build/info'),
    bgGet<StatMap>('/api/build/output'),
  ]);

  if (!infoRes.ok || !statsRes.ok) {
    showState('no-build');
    return;
  }

  renderBuildStats(statsRes.data!, infoRes.data!);
  showState('main');
}

// ---------------------------------------------------------------------------
// Handle simulate requests from content script
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg: ContentMessage) => {
  if (msg.type !== 'SIMULATE_ITEM') return;

  const item = msg.item;
  const itemText = gggItemToPobText(item);

  bgPost<SimulateResult>('/api/items/simulate', { item_raw: itemText })
    .then(res => {
      if (res.ok && res.data) {
        renderSimulation(item, res.data);
      } else {
        el('sim-item-name').textContent = 'Error';
        el('sim-delta').innerHTML = `<p class="muted">${res.error ?? 'Simulation failed'}</p>`;
        show('simulate-section');
      }
      // Signal content script that we're done (resets button state)
      chrome.storage.local.set({ [`sim_${msg.rowId}`]: Date.now() });
    })
    .catch(err => {
      el('sim-item-name').textContent = 'Error';
      el('sim-delta').innerHTML = `<p class="muted">${String(err)}</p>`;
      show('simulate-section');
    });
});

// Handle location updates from content script
chrome.runtime.onMessage.addListener((msg: ContentMessage) => {
  if (msg.type !== 'LOCATION_CHANGE') return;
  const bar = el('league-bar');
  if (msg.league) {
    el('league-label').textContent = `${msg.game === '2' ? 'PoE2' : 'PoE1'} · ${msg.league}`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
});

// ---------------------------------------------------------------------------
// GGG item JSON → PoB clipboard text format
// ---------------------------------------------------------------------------

function gggItemToPobText(item: GggItem): string {
  const lines: string[] = [];

  // Header — PoB reads "Rarity: ..."
  const rarityNames = ['Normal', 'Magic', 'Rare', 'Unique'];
  const rarity = rarityNames[item.frameType ?? 0] ?? 'Normal';
  lines.push(`Rarity: ${rarity}`);

  if (item.name)     lines.push(item.name);
  if (item.typeLine) lines.push(item.typeLine);

  lines.push('--------');

  // Properties (weapon damage, armour values, etc.)
  for (const prop of item.properties ?? []) {
    const vals = prop.values.map(([v]) => v).join(', ');
    lines.push(vals ? `${prop.name}: ${vals}` : prop.name);
  }

  // Requirements
  if ((item.requirements ?? []).length > 0) {
    lines.push('--------');
    for (const req of item.requirements ?? []) {
      lines.push(`Requires ${req.name} ${req.values[0]?.[0] ?? ''}`);
    }
  }

  // Implicits
  if ((item.implicitMods ?? []).length > 0) {
    lines.push('--------');
    lines.push(...(item.implicitMods ?? []));
  }

  // Enchants
  if ((item.enchantMods ?? []).length > 0) {
    lines.push('--------');
    lines.push(...(item.enchantMods ?? []));
  }

  // Explicits + crafted
  const explicits = [...(item.explicitMods ?? []), ...(item.craftedMods ?? [])];
  if (explicits.length > 0) {
    lines.push('--------');
    lines.push(...explicits);
  }

  // Metadata
  if (item.itemLevel != null) {
    lines.push('--------');
    lines.push(`Item Level: ${item.itemLevel}`);
  }

  if (item.corrupted) lines.push('Corrupted');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Wire up UI events
// ---------------------------------------------------------------------------

el('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

el<HTMLButtonElement>('btn-open-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

el('btn-refresh').addEventListener('click', () => loadBuild());
el('btn-refresh-build').addEventListener('click', () => loadBuild());

el('btn-refresh-upgrades').addEventListener('click', () => loadUpgrades());

el('btn-clear-sim').addEventListener('click', () => {
  hide('simulate-section');
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

loadBuild();
