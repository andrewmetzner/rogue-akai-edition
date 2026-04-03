import { type Entity, EntityType, ItemKind, type Rect, type Stats, Tile } from './types';

let nextId = 1;

function makeStats(hp: number, attack: number, defense: number): Stats {
  return { hp, maxHp: hp, attack, defense, xp: 0 };
}

export function createPlayer(x: number, y: number): Entity {
  return {
    id: nextId++,
    x, y,
    type: EntityType.Player,
    glyph: '@',
    color: '#fff',
    name: 'Player',
    stats: { hp: 30, maxHp: 30, attack: 5, defense: 2, xp: 0 },
    alive: true,
  };
}

interface MonsterTemplate {
  glyph: string;
  color: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  minDepth: number;
}

const MONSTERS: MonsterTemplate[] = [
  { glyph: 'r', color: '#a44', name: 'Rat',      hp: 4,  attack: 2, defense: 0, minDepth: 1 },
  { glyph: 'g', color: '#4a4', name: 'Goblin',   hp: 8,  attack: 4, defense: 1, minDepth: 1 },
  { glyph: 'o', color: '#a74', name: 'Orc',      hp: 14, attack: 6, defense: 2, minDepth: 2 },
  { glyph: 'T', color: '#4aa', name: 'Troll',    hp: 22, attack: 8, defense: 3, minDepth: 3 },
  { glyph: 'D', color: '#f60', name: 'Dragon',   hp: 40, attack: 12, defense: 5, minDepth: 5 },
];

const ITEMS: { glyph: string; color: string; name: string; kind: ItemKind; minDepth: number }[] = [
  { glyph: '!', color: '#f44', name: 'Health Potion',   kind: ItemKind.HealthPotion,    minDepth: 1 },
  { glyph: '/', color: '#fa4', name: 'Lightning Scroll', kind: ItemKind.ScrollLightning, minDepth: 2 },
  { glyph: ')', color: '#aaf', name: 'Sword',            kind: ItemKind.Sword,           minDepth: 1 },
  { glyph: '[', color: '#4af', name: 'Shield',           kind: ItemKind.Shield,          minDepth: 1 },
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
    if (map[y * mapWidth + x] === Tile.Floor && !occupied.has(key)) {
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
  playerY: number
): Entity[] {
  const entities: Entity[] = [];
  const occupied = new Set<string>();
  occupied.add(`${playerX},${playerY}`);

  const eligible = MONSTERS.filter(m => m.minDepth <= depth);
  const eligibleItems = ITEMS.filter(i => i.minDepth <= depth);

  // skip first room (player start)
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const monsterCount = rng(0, 2 + Math.floor(depth / 2));
    const itemCount = rng(0, 1);

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
        stats: makeStats(tmpl.hp + hpBonus, tmpl.attack + depth - 1, tmpl.defense),
        alive: true,
        level: depth,
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
