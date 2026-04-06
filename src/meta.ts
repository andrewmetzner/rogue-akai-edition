// Meta-progression save system for Roguelite mode.
// Persists gold and lobby upgrades across runs.
// Separate from the run save (localStorage['rogue-akai-edition-save']).

const META_KEY = 'rogue-akai-edition-meta';

export interface MetaUpgrades {
  vitality:  number;  // 0–5, +5 max HP per level
  strength:  number;  // 0–5, +1 ATK per level
  fortitude: number;  // 0–5, +1 DEF per level
}

export interface MetaState {
  gold: number;
  upgrades: MetaUpgrades;
}

export const META_UPGRADE_COSTS: Record<keyof MetaUpgrades, readonly number[]> = {
  vitality:  [30,  60,  90,  120, 150],
  strength:  [40,  80,  120, 160, 200],
  fortitude: [35,  70,  105, 140, 175],
} as const;

export const META_UPGRADE_LABELS: Record<keyof MetaUpgrades, string> = {
  vitality:  'Vitality  (+5 max HP)',
  strength:  'Strength  (+1 ATK)',
  fortitude: 'Fortitude (+1 DEF)',
};

const DEFAULT_META: MetaState = {
  gold: 0,
  upgrades: { vitality: 0, strength: 0, fortitude: 0 },
};

export function loadMeta(): MetaState {
  const raw = localStorage.getItem(META_KEY);
  if (!raw) return { ...DEFAULT_META, upgrades: { ...DEFAULT_META.upgrades } };
  try {
    const parsed = JSON.parse(raw) as MetaState;
    return {
      gold: parsed.gold ?? 0,
      upgrades: {
        vitality:  parsed.upgrades?.vitality  ?? 0,
        strength:  parsed.upgrades?.strength  ?? 0,
        fortitude: parsed.upgrades?.fortitude ?? 0,
      },
    };
  } catch {
    return { ...DEFAULT_META, upgrades: { ...DEFAULT_META.upgrades } };
  }
}

export function saveMeta(meta: MetaState): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch { /* storage full or unavailable */ }
}

/** Returns adjusted base stats after applying meta upgrade bonuses. */
export function applyMetaUpgrades(
  base: { hp: number; atk: number; def: number },
  upgrades: MetaUpgrades,
): { hp: number; atk: number; def: number } {
  return {
    hp:  base.hp  + upgrades.vitality  * 5,
    atk: base.atk + upgrades.strength,
    def: base.def + upgrades.fortitude,
  };
}

/** Cost in gold to buy the next level of an upgrade, or null if maxed. */
export function nextUpgradeCost(kind: keyof MetaUpgrades, currentLevel: number): number | null {
  const costs = META_UPGRADE_COSTS[kind];
  if (currentLevel >= costs.length) return null;
  return costs[currentLevel];
}

// ── Job Advancements ──────────────────────────────────────────────────────────

export interface Advancement {
  id: string;
  classId: string;
  name: string;
  path: 'A' | 'B';
  cost: number;
  description: string;
  statBonus: { hp?: number; atk?: number; def?: number; fov?: number };
}

export const ADVANCEMENTS: Advancement[] = [
  {
    id: 'dragon-knight', classId: 'warrior', name: 'Dragon Knight', path: 'A', cost: 50,
    description: '+15 HP, +2 DEF — kills leave lava beneath the fallen',
    statBonus: { hp: 15, def: 2 },
  },
  {
    id: 'hero', classId: 'warrior', name: 'Hero', path: 'B', cost: 50,
    description: '+3 ATK — 20% chance each attack ignores monster defense',
    statBonus: { atk: 3 },
  },
  {
    id: 'archmage', classId: 'mage', name: 'Archmage', path: 'A', cost: 50,
    description: '+3 ATK — scrolls and spells deal 50% more damage',
    statBonus: { atk: 3 },
  },
  {
    id: 'priest', classId: 'mage', name: 'Priest', path: 'B', cost: 50,
    description: '+12 HP — 1-in-5 chance to fully heal on monster kill',
    statBonus: { hp: 12 },
  },
  {
    id: 'bowmaster', classId: 'ranger', name: 'Bowmaster', path: 'A', cost: 50,
    description: 'Each attack also strikes the second-nearest visible enemy',
    statBonus: {},
  },
  {
    id: 'sniper', classId: 'ranger', name: 'Sniper', path: 'B', cost: 50,
    description: '+5 FOV — 25% chance each hit deals double damage',
    statBonus: { fov: 5 },
  },
  {
    id: 'night-lord', classId: 'thief', name: 'Night Lord', path: 'A', cost: 50,
    description: 'Throws a throwing star each turn (free action, 3 dmg to nearest foe)',
    statBonus: {},
  },
  {
    id: 'chief-bandit', classId: 'thief', name: 'Chief Bandit', path: 'B', cost: 50,
    description: 'Kills yield +2 extra gold; +10% chance rooms spawn an extra item',
    statBonus: {},
  },
];

export function getAdvancements(classId: string): Advancement[] {
  return ADVANCEMENTS.filter(a => a.classId === classId);
}

export function getAdvancement(id: string): Advancement | undefined {
  return ADVANCEMENTS.find(a => a.id === id);
}
