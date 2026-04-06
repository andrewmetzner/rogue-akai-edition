import { type GameState } from './types';
import { playerLevel } from './combat';

const SAVE_KEY = 'rogue-akai-edition-save';
const SAVE_VERSION = 3;

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
  map: number[];
  explored: number[];
  mapWidth: number;
  mapHeight: number;
  player: object;
  entities: object[];
  depth: number;
  biomeId: string;
  classId: string;
  fovRadius: number;
  turn: number;
  frozenTurns: number;
  log: string[];
  mode: string;
  gold: number;
  advancement: string | null;
  weaponTier: number;
  invincibleUntilTurn: number;
  lanternExpiresAt: number;
  monsterBook: object;
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
    classId:   state.classId,
    fovRadius: state.fovRadius,
    turn:      state.turn,
    frozenTurns: state.frozenTurns,
    log:       state.log,
    mode:      state.mode,
    gold:      state.gold,
    advancement: state.advancement,
    weaponTier: state.weaponTier,
    invincibleUntilTurn: state.invincibleUntilTurn,
    lanternExpiresAt: state.lanternExpiresAt,
    monsterBook: state.monsterBook,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable
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
      classId:     data.classId ?? 'warrior',
      fovRadius:   data.fovRadius ?? 9,
      turn:        data.turn,
      frozenTurns: data.frozenTurns ?? 0,
      log:         data.log,
      mode:        (data.mode as 'classic' | 'roguelite') ?? 'classic',
      gold:        data.gold ?? 0,
      advancement: data.advancement ?? null,
      weaponTier:  data.weaponTier ?? 0,
      invincibleUntilTurn: data.invincibleUntilTurn ?? 0,
      lanternExpiresAt:    data.lanternExpiresAt ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monsterBook: (data.monsterBook as any) ?? {},
    };

    return { state, biomeId: data.biomeId, themeIndex: data.themeIndex };
  } catch {
    deleteSave();
    return null;
  }
}
