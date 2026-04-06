import { type Entity, EntityType, ItemKind, type Rect, type Stats, Tile } from './types';
import { type CharClass } from './classes';

let nextId = 1;

function makeStats(hp: number, attack: number, defense: number): Stats {
  return { hp, maxHp: hp, attack, defense, xp: 0 };
}

export function createPlayer(
  x: number,
  y: number,
  cls: CharClass,
  hpOverride?: number,
  atkOverride?: number,
  defOverride?: number,
): Entity {
  // Apply permanent gear bonuses (sword) directly to base stats
  let atkBonus = 0;
  for (const kind of cls.gearItems) {
    if (kind === ItemKind.Sword) atkBonus += 3;
  }
  const hp  = hpOverride  ?? cls.hp;
  const atk = atkOverride ?? (cls.attack + atkBonus);
  const def = defOverride ?? cls.defense;
  return {
    id: nextId++,
    x, y,
    type: EntityType.Player,
    glyph: '@',
    color: '#fff',
    name: cls.name,
    stats: { hp, maxHp: hp, attack: atk, defense: def, xp: 0 },
    alive: true,
  };
}

/** Spawn consumable starting items at the player's starting position. */
export function spawnStartItems(cls: CharClass, x: number, y: number): Entity[] {
  const itemDefs: Record<ItemKind, { glyph: string; color: string; name: string }> = {
    [ItemKind.HealthPotion]:    { glyph: '!', color: '#f44',  name: 'Health Potion' },
    [ItemKind.ScrollLightning]: { glyph: '/', color: '#fa4',  name: 'Lightning Scroll' },
    [ItemKind.Sword]:           { glyph: ')', color: '#aaf',  name: 'Sword' },
    [ItemKind.Shield]:          { glyph: '[', color: '#4af',  name: 'Shield' },
    [ItemKind.MagicMap]:        { glyph: '?', color: '#fff',  name: 'Magic Map' },
    [ItemKind.Wand]:            { glyph: '\\', color: '#fa4', name: 'Wand' },
    [ItemKind.IceBomb]:         { glyph: '*', color: '#4af',  name: 'Ice Bomb' },
    [ItemKind.Lantern]:         { glyph: ':', color: '#ff8',  name: 'Lantern' },
    [ItemKind.Ring]:            { glyph: '=', color: '#faf',  name: 'Ring' },
    [ItemKind.Boots]:           { glyph: '"', color: '#aaa',  name: 'Boots' },
    [ItemKind.Amulet]:          { glyph: '"', color: '#ff8',  name: 'Amulet' },
    [ItemKind.Star]:            { glyph: '*', color: '#ff0',  name: 'Star' },
    [ItemKind.FireFlower]:      { glyph: '\u2660', color: '#f80', name: 'Fire Flower' },
    [ItemKind.SuperMushroom]:   { glyph: '\u25c6', color: '#f44', name: 'Super Mushroom' },
    [ItemKind.Bomb]:            { glyph: '\u263b', color: '#888', name: 'Bomb' },
    [ItemKind.CoinBag]:         { glyph: '\u00a2', color: '#ff8', name: 'Coin Bag' },
  };
  return cls.consumables.map(kind => {
    const def = itemDefs[kind];
    return {
      id: nextId++,
      x, y,
      type: EntityType.Item,
      glyph: def.glyph,
      color: def.color,
      name: def.name,
      itemKind: kind,
      alive: true,
    };
  });
}

interface MonsterTemplate {
  glyph: string;
  color: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  minDepth: number;
  maxDepth?: number;
  special?: 'freeze' | 'fireline';
}

const MONSTERS: MonsterTemplate[] = [
  // ── Classic dungeon (1–7) ──────────────────────────────────────────────
  { glyph: 'r', color: '#a44',    name: 'Rat',          hp: 4,  attack: 2,  defense: 0, minDepth: 1, maxDepth: 4  },
  { glyph: 'g', color: '#4a4',    name: 'Goblin',       hp: 8,  attack: 4,  defense: 1, minDepth: 1, maxDepth: 6  },
  { glyph: 'o', color: '#a74',    name: 'Orc',          hp: 14, attack: 6,  defense: 2, minDepth: 2, maxDepth: 8  },
  { glyph: 'T', color: '#4aa',    name: 'Troll',        hp: 22, attack: 8,  defense: 3, minDepth: 3, maxDepth: 10 },
  { glyph: 'D', color: '#f60',    name: 'Dragon',       hp: 40, attack: 12, defense: 5, minDepth: 5, maxDepth: 12 },

  // ── Frozen Caverns (8–14) ─────────────────────────────────────────────
  { glyph: 'w', color: '#aaddff', name: 'Frost Wolf',    hp: 18, attack: 8,  defense: 2, minDepth: 8,  maxDepth: 14 },
  { glyph: 'Y', color: '#ddeeff', name: 'Yeti',          hp: 30, attack: 10, defense: 4, minDepth: 8,  maxDepth: 14 },
  { glyph: 'E', color: '#88ccff', name: 'Ice Elemental', hp: 22, attack: 9,  defense: 3, minDepth: 10, maxDepth: 14 },
  { glyph: 'I', color: '#00eeff', name: 'Ice Dragon',    hp: 50, attack: 13, defense: 5, minDepth: 12, maxDepth: 14, special: 'freeze' },

  // ── Slime Pits (15–21) ────────────────────────────────────────────────
  { glyph: 's', color: '#66cc33', name: 'Slime',      hp: 14, attack: 5,  defense: 0, minDepth: 15, maxDepth: 21 },
  { glyph: 'j', color: '#88ff44', name: 'Jelly',      hp: 10, attack: 6,  defense: 1, minDepth: 15, maxDepth: 21 },
  { glyph: 'S', color: '#44ff00', name: 'Slime Lord',  hp: 38, attack: 11, defense: 3, minDepth: 17, maxDepth: 21 },

  // ── The Inferno (22–28) ───────────────────────────────────────────────
  { glyph: 'e', color: '#ff8833', name: 'Ember Spirit', hp: 20, attack: 10, defense: 2, minDepth: 22, maxDepth: 28 },
  { glyph: 'd', color: '#ff5500', name: 'Drake',        hp: 28, attack: 12, defense: 3, minDepth: 23, maxDepth: 28 },
  { glyph: 'F', color: '#ff2200', name: 'Fire Demon',   hp: 45, attack: 15, defense: 6, minDepth: 24, maxDepth: 28 },
  { glyph: 'Z', color: '#ff6600', name: 'Fire Dragon',  hp: 55, attack: 14, defense: 6, minDepth: 25, maxDepth: 28, special: 'fireline' },
];

const ITEMS: { glyph: string; color: string; name: string; kind: ItemKind; minDepth: number }[] = [
  // ── Always available ──────────────────────────────────────────────────
  { glyph: '!',      color: '#f44',  name: 'Health Potion',    kind: ItemKind.HealthPotion,    minDepth: 1 },
  { glyph: '\u25c6', color: '#f44',  name: 'Super Mushroom',   kind: ItemKind.SuperMushroom,   minDepth: 1 },
  { glyph: '\u00a2', color: '#ff8',  name: 'Coin Bag',         kind: ItemKind.CoinBag,         minDepth: 1 },
  { glyph: ')',       color: '#aaf',  name: 'Sword',            kind: ItemKind.Sword,           minDepth: 1 },
  { glyph: '[',       color: '#4af',  name: 'Shield',           kind: ItemKind.Shield,          minDepth: 1 },

  // ── Mid dungeon ───────────────────────────────────────────────────────
  { glyph: '/',       color: '#fa4',  name: 'Lightning Scroll', kind: ItemKind.ScrollLightning, minDepth: 2 },
  { glyph: '\u2660',  color: '#f80',  name: 'Fire Flower',      kind: ItemKind.FireFlower,      minDepth: 3 },
  { glyph: '\u263b',  color: '#888',  name: 'Bomb',             kind: ItemKind.Bomb,            minDepth: 4 },
  { glyph: ':',       color: '#ff8',  name: 'Lantern',          kind: ItemKind.Lantern,         minDepth: 5 },
  { glyph: '*',       color: '#ff0',  name: 'Star',             kind: ItemKind.Star,            minDepth: 5 },
  { glyph: '?',       color: '#fff',  name: 'Magic Map',        kind: ItemKind.MagicMap,        minDepth: 6 },

  // ── Deep dungeon ──────────────────────────────────────────────────────
  { glyph: '*',       color: '#4af',  name: 'Ice Bomb',         kind: ItemKind.IceBomb,         minDepth: 8 },
];

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloorInRoom(
  room: Rect,
  map: Uint8Array,
  mapWidth: number,
  occupied: Set<string>
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = rng(room.x + 1, room.x + room.w - 2);
    const y = rng(room.y + 1, room.y + room.h - 2);
    const key = `${x},${y}`;
    const t = map[y * mapWidth + x];
    if ((t === Tile.Floor || t === Tile.IceFloor || t === Tile.SlimePool) && !occupied.has(key)) {
      occupied.add(key);
      return { x, y };
    }
  }
  return null;
}

export function spawnEntities(
  rooms: Rect[],
  map: Uint8Array,
  mapWidth: number,
  depth: number,
  playerX: number,
  playerY: number,
  bonusItemChance = 0,
): Entity[] {
  const entities: Entity[] = [];
  const occupied = new Set<string>();
  occupied.add(`${playerX},${playerY}`);

  const eligible = MONSTERS.filter(m =>
    m.minDepth <= depth && (m.maxDepth === undefined || m.maxDepth >= depth)
  );
  const eligibleItems = ITEMS.filter(i => i.minDepth <= depth);

  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const monsterCount = rng(0, 2 + Math.floor(depth / 3));
    const itemCount = rng(0, 1) + (Math.random() < bonusItemChance ? 1 : 0);

    for (let m = 0; m < monsterCount; m++) {
      const pos = randomFloorInRoom(room, map, mapWidth, occupied);
      if (!pos) continue;
      const tmpl = eligible[rng(0, eligible.length - 1)];
      const hpBonus = (depth - 1) * 2;
      entities.push({
        id: nextId++,
        x: pos.x, y: pos.y,
        type: EntityType.Monster,
        glyph: tmpl.glyph,
        color: tmpl.color,
        name: tmpl.name,
        stats: makeStats(tmpl.hp + hpBonus, tmpl.attack + Math.floor(depth / 2), tmpl.defense),
        alive: true,
        level: depth,
        ...(tmpl.special ? { special: tmpl.special } : {}),
      });
    }

    for (let it = 0; it < itemCount; it++) {
      const pos = randomFloorInRoom(room, map, mapWidth, occupied);
      if (!pos) continue;
      const tmpl = eligibleItems[rng(0, eligibleItems.length - 1)];
      entities.push({
        id: nextId++,
        x: pos.x, y: pos.y,
        type: EntityType.Item,
        glyph: tmpl.glyph,
        color: tmpl.color,
        name: tmpl.name,
        itemKind: tmpl.kind,
        alive: true,
      });
    }
  }

  return entities;
}
