export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const Tile = {
  Wall:       0,
  Floor:      1,
  StairsDown: 2,
  // Biome hazard tiles
  IceFloor:   3,   // player slides; no damage
  SlimePool:  4,   // 1 HP/turn
  LavaFloor:  5,   // 3 HP/turn
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const EntityType = {
  Player: 0,
  Monster: 1,
  Item: 2,
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const ItemKind = {
  // ── Implemented ──────────────────────────────────────────────────────────
  HealthPotion:    0,
  Sword:           1,
  Shield:          2,
  ScrollLightning: 3,

  // ── Planned (not yet spawned or implemented) ──────────────────────────────
  // Add to ITEMS array in entities.ts + case in useItem() in combat.ts
  // when ready to unlock.
  MagicMap:    10,  // reveals entire current floor
  Wand:        11,  // ranged attack, limited charges
  IceBomb:     12,  // freeze all visible monsters 1 turn
  Lantern:     13,  // temporarily increases FOV radius
  Ring:        14,  // passive stat bonus (random on pickup)
  Boots:       15,  // +1 move range or diagonal bonuses
  Amulet:      16,  // floor-end boss item / special effect
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export interface Stats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
}

export interface Entity {
  id: number;
  x: number;
  y: number;
  type: EntityType;
  glyph: string;
  color: string;
  name: string;
  stats?: Stats;
  itemKind?: ItemKind;
  level?: number;
  special?: 'freeze' | 'fireline';
  alive: boolean;
}

export interface GameState {
  map: Uint8Array;
  mapWidth: number;
  mapHeight: number;
  visible: Uint8Array;
  explored: Uint8Array;
  entities: Entity[];
  player: Entity;
  depth: number;
  biomeId: string;
  turn: number;
  frozenTurns: number;   // player is frozen (blue, can't move)
  log: string[];
}
