import { Tile } from './types';

export const BiomeId = {
  Dungeon: 'dungeon',
  Ice:     'ice',
  Slime:   'slime',
  Fire:    'fire',
} as const;
export type BiomeId = (typeof BiomeId)[keyof typeof BiomeId];

export interface BiomePalette {
  wallVis: string;
  wallSeen: string;
  floorVis: string;
  floorSeen: string;
  stairsVis: string;
  stairsSeen: string;
  hazardVis: string;
  hazardSeen: string;
  hazardGlyph: string;
  hazardTile: number;  // Tile value that is the hazard for this biome
  bg: string;          // canvas background override
}

export interface Biome {
  id: BiomeId;
  name: string;
  flavorText: string;
  depthStart: number;
  depthEnd: number;
  hazardChance: number;  // per floor-cell probability [0–1]
  palette: BiomePalette;
}

export const BIOMES: Biome[] = [
  {
    id: BiomeId.Dungeon,
    name: 'The Dungeon',
    flavorText: 'Ancient stone. Dripping water. Something watches.',
    depthStart: 1,
    depthEnd: 7,
    hazardChance: 0,
    palette: {
      wallVis:     '#555',
      wallSeen:    '#222',
      floorVis:    '#333',
      floorSeen:   '#191919',
      stairsVis:   '#ff8',
      stairsSeen:  '#554',
      hazardVis:   '',
      hazardSeen:  '',
      hazardGlyph: '',
      hazardTile:  Tile.Floor,
      bg:          '#000',
    },
  },
  {
    id: BiomeId.Ice,
    name: 'Frozen Caverns',
    flavorText: 'The cold bites. The floor shifts beneath your feet.',
    depthStart: 8,
    depthEnd: 10,
    hazardChance: 0.22,  // 22% of floor cells become ice
    palette: {
      wallVis:     '#88ccee',
      wallSeen:    '#224455',
      floorVis:    '#336677',
      floorSeen:   '#112233',
      stairsVis:   '#aaeeff',
      stairsSeen:  '#336677',
      hazardVis:   '#ccf4ff',
      hazardSeen:  '#2a4a55',
      hazardGlyph: '\u00b0',  // °  ice patch
      hazardTile:  Tile.IceFloor,
      bg:          '#050d10',
    },
  },
  {
    id: BiomeId.Slime,
    name: 'The Slime Pits',
    flavorText: 'Everything drips. The ground pulls at your boots.',
    depthStart: 11,
    depthEnd: 12,
    hazardChance: 0.25,
    palette: {
      wallVis:     '#4a7a3a',
      wallSeen:    '#1a2f15',
      floorVis:    '#2a4a20',
      floorSeen:   '#0d1a0a',
      stairsVis:   '#aaff44',
      stairsSeen:  '#3a5520',
      hazardVis:   '#77cc33',
      hazardSeen:  '#1f3a10',
      hazardGlyph: '%',
      hazardTile:  Tile.SlimePool,
      bg:          '#050d02',
    },
  },
  {
    id: BiomeId.Fire,
    name: 'The Inferno',
    flavorText: 'Heat warps the air. Lava flows where floors once were.',
    depthStart: 13,
    depthEnd: 14,
    hazardChance: 0.28,
    palette: {
      wallVis:     '#993322',
      wallSeen:    '#3a1008',
      floorVis:    '#5a1e0e',
      floorSeen:   '#1e0805',
      stairsVis:   '#ffcc00',
      stairsSeen:  '#664400',
      hazardVis:   '#ff5500',
      hazardSeen:  '#661a00',
      hazardGlyph: '~',
      hazardTile:  Tile.LavaFloor,
      bg:          '#0d0200',
    },
  },
];

export function getBiome(depth: number): Biome {
  for (const b of BIOMES) {
    if (depth >= b.depthStart && depth <= b.depthEnd) return b;
  }
  return BIOMES[BIOMES.length - 1];
}
