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
  Wall: 0,
  Floor: 1,
  StairsDown: 2,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export const EntityType = {
  Player: 0,
  Monster: 1,
  Item: 2,
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const ItemKind = {
  HealthPotion: 0,
  Sword: 1,
  Shield: 2,
  ScrollLightning: 3,
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
  turn: number;
  log: string[];
}
