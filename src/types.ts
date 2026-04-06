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
  MagicMap:      10,  // reveals entire current floor
  Wand:          11,  // ranged attack, limited charges
  IceBomb:       12,  // freeze all visible monsters
  Lantern:       13,  // temporarily increases FOV radius
  Ring:          14,  // passive stat bonus (random on pickup)
  Boots:         15,  // +1 move range or diagonal bonuses
  Amulet:        16,  // floor-end boss item / special effect

  // ── Mario-inspired temp buffs ─────────────────────────────────────────────
  Star:          20,  // 3-turn invincibility
  FireFlower:    21,  // damages all visible monsters
  SuperMushroom: 22,  // big heal (25–40 HP)
  Bomb:          23,  // damages all adjacent monsters
  CoinBag:       24,  // +gold (roguelite) or +XP (classic)
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export type GameMode = 'classic' | 'roguelite';

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
  frozenTurns?: number;   // for IceBomb effect on monsters
  alive: boolean;
}

export interface MonsterBookEntry {
  name: string;
  encountered: number;
  killed: number;
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
  classId: string;
  fovRadius: number;
  turn: number;
  frozenTurns: number;        // player is frozen (blue, can't move)
  log: string[];

  // ── Mode & progression ────────────────────────────────────────────────────
  mode: GameMode;
  gold: number;               // run gold (roguelite only; 0 in classic)
  advancement: string | null; // e.g. 'dragon-knight'; null = not yet advanced
  weaponTier: number;         // 0–3 (upgrade room gives +1 each time)

  // ── Timed effects ─────────────────────────────────────────────────────────
  invincibleUntilTurn: number; // Star item: 0 = inactive
  lanternExpiresAt: number;    // Lantern item: 0 = inactive

  // ── Clan Primer ───────────────────────────────────────────────────────────
  monsterBook: Record<string, MonsterBookEntry>;
}
