// Meta-progression save system for Roguelike mode.
// Persists gold, lobby upgrades, and unlocked skins across runs.
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
  unlockedSkins: string[];  // theme names; 'Classic' always owned
  activeSkin: string;       // name of currently equipped skin
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

// Gold cost to unlock each skin; 0 = free/always owned
export const SKIN_COSTS: Record<string, number> = {
  'Classic':    0,
  'Pea Soup':   80,
  'Amber':      80,
  'Blood Moon': 100,
  'Oceanic':    100,
  'Amethyst':   120,
  'Copper':     80,
};

const DEFAULT_META: MetaState = {
  gold: 0,
  upgrades: { vitality: 0, strength: 0, fortitude: 0 },
  unlockedSkins: ['Classic'],
  activeSkin: 'Classic',
};

export function loadMeta(): MetaState {
  const raw = localStorage.getItem(META_KEY);
  if (!raw) return {
    ...DEFAULT_META,
    upgrades: { ...DEFAULT_META.upgrades },
    unlockedSkins: [...DEFAULT_META.unlockedSkins],
  };
  try {
    const parsed = JSON.parse(raw) as MetaState;
    return {
      gold: parsed.gold ?? 0,
      upgrades: {
        vitality:  parsed.upgrades?.vitality  ?? 0,
        strength:  parsed.upgrades?.strength  ?? 0,
        fortitude: parsed.upgrades?.fortitude ?? 0,
      },
      unlockedSkins: Array.isArray(parsed.unlockedSkins) ? parsed.unlockedSkins : ['Classic'],
      activeSkin: parsed.activeSkin ?? 'Classic',
    };
  } catch {
    return {
      ...DEFAULT_META,
      upgrades: { ...DEFAULT_META.upgrades },
      unlockedSkins: [...DEFAULT_META.unlockedSkins],
    };
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
