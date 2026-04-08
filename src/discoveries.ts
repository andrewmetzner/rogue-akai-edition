// Persistent cross-run discovery log. Shared by both classic and roguelike modes.
// Tracks which items and hazards the player has encountered at least once.

const DISC_KEY = 'rogue-akai-edition-discoveries';

export interface Discoveries {
  items:   string[];  // canonical item codex names
  hazards: string[];  // 'Ice Floor' | 'Slime Pool' | 'Lava Floor'
}

function empty(): Discoveries {
  return { items: [], hazards: [] };
}

export function loadDiscoveries(): Discoveries {
  const raw = localStorage.getItem(DISC_KEY);
  if (!raw) return empty();
  try {
    const d = JSON.parse(raw) as Discoveries;
    return {
      items:   Array.isArray(d.items)   ? d.items   : [],
      hazards: Array.isArray(d.hazards) ? d.hazards : [],
    };
  } catch {
    return empty();
  }
}

function saveDiscoveries(d: Discoveries): void {
  try { localStorage.setItem(DISC_KEY, JSON.stringify(d)); } catch { /* full */ }
}

export function discoverItem(codexName: string): void {
  const d = loadDiscoveries();
  if (!d.items.includes(codexName)) {
    d.items.push(codexName);
    saveDiscoveries(d);
  }
}

export function discoverHazard(name: string): void {
  const d = loadDiscoveries();
  if (!d.hazards.includes(name)) {
    d.hazards.push(name);
    saveDiscoveries(d);
  }
}
