import { Tile, type Rect } from './types';
import { type Biome } from './biomes';

export interface DungeonResult {
  map: Uint8Array;
  width: number;
  height: number;
  rooms: Rect[];
  startX: number;
  startY: number;
}

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rectCenter(r: Rect): [number, number] {
  return [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
}

function rectsOverlap(a: Rect, b: Rect, margin = 1): boolean {
  return (
    a.x - margin < b.x + b.w &&
    a.x + a.w + margin > b.x &&
    a.y - margin < b.y + b.h &&
    a.y + a.h + margin > b.y
  );
}

function carveRoom(map: Uint8Array, width: number, room: Rect): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      map[y * width + x] = Tile.Floor;
    }
  }
}

function carveTunnel(
  map: Uint8Array,
  width: number,
  x1: number, y1: number,
  x2: number, y2: number
): void {
  let x = x1, y = y1;
  if (Math.random() < 0.5) {
    while (x !== x2) { map[y * width + x] = Tile.Floor; x += x < x2 ? 1 : -1; }
    while (y !== y2) { map[y * width + x] = Tile.Floor; y += y < y2 ? 1 : -1; }
  } else {
    while (y !== y2) { map[y * width + x] = Tile.Floor; y += y < y2 ? 1 : -1; }
    while (x !== x2) { map[y * width + x] = Tile.Floor; x += x < x2 ? 1 : -1; }
  }
  map[y * width + x] = Tile.Floor;
}

function scatterHazards(
  map: Uint8Array,
  width: number,
  height: number,
  rooms: Rect[],
  hazardTile: number,
  chance: number,
  startRoom: Rect,
  stairsX: number,
  stairsY: number,
): void {
  // Skip first room (player spawn) and don't cover stairs
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
        if (x === stairsX && y === stairsY) continue;
        if (map[y * width + x] === Tile.Floor && Math.random() < chance) {
          map[y * width + x] = hazardTile;
        }
      }
    }
  }
  void startRoom; void height;
}

export function generateDungeon(width: number, height: number, biome: Biome): DungeonResult {
  const map = new Uint8Array(width * height);
  const rooms: Rect[] = [];
  const maxRooms = 14 + biome.depthStart;
  const minSize = 4;
  const maxSize = 10;

  for (let attempt = 0; attempt < 200; attempt++) {
    if (rooms.length >= maxRooms) break;
    const w = rng(minSize, maxSize);
    const h = rng(minSize, maxSize);
    const x = rng(1, width - w - 2);
    const y = rng(1, height - h - 2);
    const room: Rect = { x, y, w, h };

    if (rooms.some(r => rectsOverlap(r, room))) continue;

    carveRoom(map, width, room);

    if (rooms.length > 0) {
      const prev = rooms[rooms.length - 1];
      const [px, py] = rectCenter(prev);
      const [cx, cy] = rectCenter(room);
      carveTunnel(map, width, px, py, cx, cy);
    }

    rooms.push(room);
  }

  // Place stairs in last room
  const lastRoom = rooms[rooms.length - 1];
  const [sx, sy] = rectCenter(lastRoom);
  map[sy * width + sx] = Tile.StairsDown;

  // Scatter biome hazard tiles
  if (biome.hazardChance > 0 && biome.palette.hazardTile !== Tile.Floor) {
    scatterHazards(map, width, height, rooms, biome.palette.hazardTile, biome.hazardChance, rooms[0], sx, sy);
  }

  const [startX, startY] = rectCenter(rooms[0]);
  return { map, width, height, rooms, startX, startY };
}
