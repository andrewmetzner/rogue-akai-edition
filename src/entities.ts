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
  maxDepth?: number;
  special?: 'freeze' | 'fireline';  // special attack behaviour (handled in game.ts)
}

const MONSTERS: MonsterTemplate[] = [
  // ── Classic dungeon (1–7) ──────────────────────────────────────────────
  { glyph: 'r', color: '#a44',    name: 'Rat',          hp: 4,  attack: 2,  defense: 0, minDepth: 1, maxDepth: 4  },
  { glyph: 'g', color: '#4a4',    name: 'Goblin',       hp: 8,  attack: 4,  defense: 1, minDepth: 1, maxDepth: 6  },
  { glyph: 'o', color: '#a74',    name: 'Orc',          hp: 14, attack: 6,  defense: 2, minDepth: 2, maxDepth: 8  },
  { glyph: 'T', color: '#4aa',    name: 'Troll',        hp: 22, attack: 8,  defense: 3, minDepth: 3, maxDepth: 10 },
  { glyph: 'D', color: '#f60',    name: 'Dragon',       hp: 40, attack: 12, defense: 5, minDepth: 5, maxDepth: 12 },

  // ── Frozen Caverns (8–10) ─────────────────────────────────────────────
  { glyph: 'w', color: '#aaddff', name: 'Frost Wolf',   hp: 18, attack: 8,  defense: 2, minDepth: 8,  maxDepth: 11 },
  { glyph: 'Y', color: '#ddeeff', name: 'Yeti',         hp: 30, attack: 10, defense: 4, minDepth: 8,  maxDepth: 11 },
  { glyph: 'E', color: '#88ccff', name: 'Ice Elemental',hp: 22, attack: 9,  defense: 3, minDepth: 9,  maxDepth: 11 },
  // Ice Dragon: freezes player on attack (turns blue, loses 1 turn)
  { glyph: 'I', color: '#00eeff', name: 'Ice Dragon',   hp: 50, attack: 13, defense: 5, minDepth: 9,  maxDepth: 11, special: 'freeze' },

  // ── Slime Pits (11–12) ────────────────────────────────────────────────
  { glyph: 's', color: '#66cc33', name: 'Slime',        hp: 14, attack: 5,  defense: 0, minDepth: 10, maxDepth: 13 },
  { glyph: 'j', color: '#88ff44', name: 'Jelly',        hp: 10, attack: 6,  defense: 1, minDepth: 10, maxDepth: 13 },
  { glyph: 'S', color: '#44ff00', name: 'Slime Lord',   hp: 38, attack: 11, defense: 3, minDepth: 11, maxDepth: 13 },

  // ── The Inferno (13–14) ───────────────────────────────────────────────
  { glyph: 'e', color: '#ff8833', name: 'Ember Spirit', hp: 20, attack: 10, defense: 2, minDepth: 12, maxDepth: 15 },
  { glyph: 'd', color: '#ff5500', name: 'Drake',        hp: 28, attack: 12, defense: 3, minDepth: 13, maxDepth: 15 },
  { glyph: 'F', color: '#ff2200', name: 'Fire Demon',   hp: 45, attack: 15, defense: 6, minDepth: 13, maxDepth: 15 },
  // Fire Dragon: breathes a line of fire, scorching 3 tiles toward the player
  { glyph: 'Z', color: '#ff6600', name: 'Fire Dragon',  hp: 55, attack: 14, defense: 6, minDepth: 13, maxDepth: 15, special: 'fireline' },
];

const ITEMS: { glyph: string; color: string; name: string; kind: ItemKind; minDepth: number }[] = [
  { glyph: '!', color: '#f44', name: 'Health Potion',    kind: ItemKind.HealthPotion,    minDepth: 1  },
  { glyph: '/', color: '#fa4', name: 'Lightning Scroll', kind: ItemKind.ScrollLightning, minDepth: 2  },
  { glyph: ')', color: '#aaf', name: 'Sword',            kind: ItemKind.Sword,           minDepth: 1  },
  { glyph: '[', color: '#4af', name: 'Shield',           kind: ItemKind.Shield,          minDepth: 1  },
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
    // Spawn on floor or ice/slime — not lava
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
  playerY: number
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
