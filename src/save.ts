// Roguelike save system — one save slot, stored in localStorage.
// Permadeath: dying deletes the save. Loading resumes exactly where you left off.

import { type GameState } from './types';
import { playerLevel } from './combat';

const SAVE_KEY = 'rogue-akai-edition-save';
const SAVE_VERSION = 2;

export interface SaveMeta {
  depth: number;
  biomeName: string;
  turn: number;
  playerLevel: number;
  playerHp: number;
  playerMaxHp: number;
  timestamp: number;
}

interface SaveData {
  version: number;
  timestamp: number;
  meta: SaveMeta;
  themeIndex: number;
  // GameState fields (Uint8Arrays stored as plain arrays)
  map: number[];
  explored: number[];
  mapWidth: number;
  mapHeight: number;
  player: object;
  entities: object[];
  depth: number;
  biomeId: string;
  turn: number;
  log: string[];
}

export function saveGame(state: GameState, biomeId: string, themeIndex: number): void {
  const data: SaveData = {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    meta: {
      depth: state.depth,
      biomeName: biomeId,
      turn: state.turn,
      playerLevel: playerLevel(state.player.stats!.xp),
      playerHp: state.player.stats!.hp,
      playerMaxHp: state.player.stats!.maxHp,
      timestamp: Date.now(),
    },
    themeIndex,
    map:      Array.from(state.map),
    explored: Array.from(state.explored),
    mapWidth:  state.mapWidth,
    mapHeight: state.mapHeight,
    player:    state.player,
    entities:  state.entities,
    depth:     state.depth,
    biomeId,
    turn:      state.turn,
    log:       state.log,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silently skip
  }
}

export function deleteSave(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function loadSaveMeta(): SaveMeta | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION) { deleteSave(); return null; }
    return data.meta;
  } catch {
    return null;
  }
}

export interface LoadedGame {
  state: Omit<GameState, 'visible'>;
  biomeId: string;
  themeIndex: number;
}

export function loadGame(): LoadedGame | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SaveData;
    if (data.version !== SAVE_VERSION) { deleteSave(); return null; }

    const state: Omit<GameState, 'visible'> = {
      map:       new Uint8Array(data.map),
      explored:  new Uint8Array(data.explored),
      mapWidth:  data.mapWidth,
      mapHeight: data.mapHeight,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      player:      data.player as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      entities:    data.entities as any[],
      depth:       data.depth,
      biomeId:     data.biomeId,
      turn:        data.turn,
      frozenTurns: 0,
      log:         data.log,
    };

    return { state, biomeId: data.biomeId, themeIndex: data.themeIndex };
  } catch {
    deleteSave();
    return null;
  }
}
