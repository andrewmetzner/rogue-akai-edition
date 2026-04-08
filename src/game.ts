import { type GameState, type Entity, EntityType, Tile } from './types';
import { generateDungeon } from './dungeon';
import { createPlayer, spawnEntities, BASE_PLAYER } from './entities';
import { computeFOV } from './fov';
import { attackEntity, useItem, monsterAI, playerLevel } from './combat';
import { Renderer } from './renderer';
import { THEMES } from './themes';
import { getBiome } from './biomes';
import { audio } from './audio';
import { saveGame, loadGame, deleteSave, hasSave, loadSaveMeta, type SaveMeta } from './save';
import { loadDiscoveries, discoverItem, discoverHazard } from './discoveries';
import { ItemKind } from './types';
import {
  loadMeta, saveMeta, applyMetaUpgrades,
  nextUpgradeCost, SKIN_COSTS,
} from './meta';

const MAP_W = 80;
const MAP_H = 45;
const BASE_FOV = 9;
const MAX_DEPTH = 28;
const MAX_LOG = 6;
const SAVE_INTERVAL = 5; // roguelike auto-save every N turns

type Screen = 'menu' | 'playing' | 'paused' | 'lobby' | 'over' | 'clanPrimer';

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class Game {
  private state!: GameState;
  private renderer: Renderer;
  private screen: Screen = 'menu';
  private animId = 0;

  private menuSelection = 0;

  private mode: 'classic' | 'roguelike' = 'classic';

  private pauseSelection = 0;
  private lobbySelection = 0;

  private primerTab: 'book' | 'items' | 'hazards' | 'hunts' = 'book';
  private primerScroll = 0;

  private seenEntityIds = new Set<number>();
  private won = false;
  private roguelikeSaveMeta: SaveMeta | null = null;

  constructor() {
    this.renderer = new Renderer('canvas');
    this.bindKeys();
    this.showMenu();
  }

  // ── Screen transitions ───────────────────────────────────────────────────

  private showMenu(): void {
    this.screen = 'menu';
    this.menuSelection = 0;
    this.roguelikeSaveMeta = loadSaveMeta();
    document.getElementById('hud-left')!.textContent = '';
    document.getElementById('hud-right')!.textContent = '';
    document.getElementById('log')!.innerHTML = '';
    this.startAnimLoop();
  }

  private writeSave(): void {
    // Only roguelike mode saves mid-run state
    if (this.state?.mode !== 'roguelike') return;
    saveGame(this.state, this.state.biomeId, this.renderer.themeIndex);
  }

  private loadSavedGame(): void {
    const loaded = loadGame();
    if (!loaded) { this.showLobby(); return; }
    this.stopAnimLoop();
    this.screen = 'playing';
    this.state = {
      ...loaded.state,
      visible: new Uint8Array(loaded.state.mapWidth * loaded.state.mapHeight),
    };
    this.mode = 'roguelike';
    this.renderer.themeIndex = loaded.themeIndex;
    this.renderer.applyBodyBg(this.state.biomeId);
    audio.start();
    this.seenEntityIds = new Set();
    this.won = false;
    this.updateFOV();
    this.render();
    this.renderLog();
  }

  private showLobby(): void {
    // Apply active skin when entering The Village
    const meta = loadMeta();
    const skinIdx = THEMES.findIndex(t => t.name === meta.activeSkin);
    this.renderer.themeIndex = skinIdx >= 0 ? skinIdx : 0;
    this.renderer.applyBodyBg();
    this.screen = 'lobby';
    this.lobbySelection = 0;
    this.startAnimLoop();
  }

  private openClanPrimer(): void {
    this.screen = 'clanPrimer';
    this.primerTab = 'book';
    this.primerScroll = 0;
    this.render();
  }

  private closeClanPrimer(): void {
    this.screen = 'paused';
    this.render();
  }

  private startGame(): void {
    this.stopAnimLoop();
    this.screen = 'playing';
    const biome = getBiome(1);
    this.renderer.applyBodyBg(biome.palette.bg);
    audio.start();
    this.newGame();
  }

  private openPause(): void {
    this.screen = 'paused';
    this.pauseSelection = 0;
    this.render();
  }

  private closePause(): void {
    this.screen = 'playing';
    this.render();
  }

  // ── rAF loop ─────────────────────────────────────────────────────────────

  private startAnimLoop(): void {
    this.stopAnimLoop();
    const loop = () => {
      const s = this.screen;
      if (s !== 'menu' && s !== 'lobby') return;
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private stopAnimLoop(): void {
    cancelAnimationFrame(this.animId);
  }

  // ── Game lifecycle ────────────────────────────────────────────────────────

  private newGame(): void {
    const depth = 1;
    const biome = getBiome(depth);
    const dungeon = generateDungeon(MAP_W, MAP_H, biome);

    let hp: number = BASE_PLAYER.hp, atk: number = BASE_PLAYER.atk, def: number = BASE_PLAYER.def;
    if (this.mode === 'roguelike') {
      const meta = loadMeta();
      const adj = applyMetaUpgrades({ hp, atk, def }, meta.upgrades);
      hp = adj.hp; atk = adj.atk; def = adj.def;
    }

    const player   = createPlayer(dungeon.startX, dungeon.startY, hp, atk, def);
    const entities = spawnEntities(dungeon.rooms, dungeon.map, dungeon.width, depth, player.x, player.y);

    this.state = {
      map:      dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      visible:  new Uint8Array(dungeon.width * dungeon.height),
      explored: new Uint8Array(dungeon.width * dungeon.height),
      entities,
      player,
      depth,
      biomeId:  biome.id,
      fovRadius: BASE_FOV,
      turn: 0,
      frozenTurns: 0,
      log: ['You enter the dungeon. Good luck.'],
      mode: this.mode,
      gold: 0,
      equippedWeapon: null,
      invincibleUntilTurn: 0,
      lanternExpiresAt: 0,
      monsterBook: {},
    };
    this.won = false;
    this.seenEntityIds = new Set();
    this.updateFOV();
    this.render();
    this.renderLog();
  }

  private descend(): void {
    const depth = this.state.depth + 1;
    if (depth > MAX_DEPTH) {
      this.won = true;
      this.screen = 'over';
      if (this.state.mode === 'roguelike') {
        const meta = loadMeta();
        meta.gold += this.state.gold;
        saveMeta(meta);
      } else {
        deleteSave();
      }
      audio.victory();
      this.render();
      return;
    }
    this.executeDescend(depth);
  }

  private executeDescend(depth: number): void {
    audio.stairs();
    const biome  = getBiome(depth);
    const dungeon = generateDungeon(MAP_W, MAP_H, biome);
    const player  = this.state.player;

    player.x = dungeon.startX;
    player.y = dungeon.startY;

    const entities = spawnEntities(
      dungeon.rooms, dungeon.map, dungeon.width,
      depth, player.x, player.y,
    );

    this.state = {
      ...this.state,
      map:      dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      visible:  new Uint8Array(dungeon.width * dungeon.height),
      explored: new Uint8Array(dungeon.width * dungeon.height),
      entities,
      depth,
      biomeId:  biome.id,
      frozenTurns: 0,
      fovRadius: BASE_FOV,
      invincibleUntilTurn: 0,
      lanternExpiresAt: 0,
    };

    this.addLog(`Depth ${depth}: ${biome.name}. ${biome.flavorText}`);
    this.updateFOV();
    this.renderer.applyBodyBg(biome.palette.bg);
    if (this.state.mode === 'roguelike') this.writeSave();
    this.render();
  }

  // ── Core systems ──────────────────────────────────────────────────────────

  private updateFOV(): void {
    const { map, mapWidth, mapHeight, visible, explored, player, fovRadius } = this.state;
    computeFOV(visible, mapWidth, mapHeight, player.x, player.y, fovRadius, (x, y) => {
      if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return true;
      return map[y * mapWidth + x] === Tile.Wall;
    });
    for (let i = 0; i < visible.length; i++) {
      if (visible[i]) explored[i] = 1;
    }
  }

  private checkNewSightings(): void {
    const { entities, visible, mapWidth, monsterBook } = this.state;
    for (const e of entities) {
      if (e.type !== EntityType.Monster || !e.alive) continue;
      if (!visible[e.y * mapWidth + e.x]) continue;
      if (!this.seenEntityIds.has(e.id)) {
        this.seenEntityIds.add(e.id);
        if (!monsterBook[e.name]) {
          monsterBook[e.name] = { name: e.name, encountered: 0, killed: 0 };
        }
        monsterBook[e.name].encountered++;
      }
    }
  }

  private handleKill(monster: Entity): void {
    const state = this.state;
    if (state.mode === 'roguelike') {
      state.gold += Math.floor(state.depth / 2) + rng(1, 3);
    }
    const book = state.monsterBook;
    if (!book[monster.name]) {
      book[monster.name] = { name: monster.name, encountered: 1, killed: 0 };
    }
    book[monster.name].killed++;
  }

  private addLog(msg: string): void {
    this.state.log.unshift(msg);
    if (this.state.log.length > MAX_LOG) this.state.log.length = MAX_LOG;
    this.renderLog();
  }

  private renderLog(): void {
    const el = document.getElementById('log')!;
    el.innerHTML = this.state.log
      .map((line, i) => `<div class="log-line${i === 0 ? ' new' : ''}">${line}</div>`)
      .join('');
  }

  private render(): void {
    switch (this.screen) {
      case 'menu':
        this.renderer.renderStartMenu(this.menuSelection, this.roguelikeSaveMeta);
        break;
      case 'lobby':
        this.renderer.renderLobby(loadMeta(), this.lobbySelection);
        break;
      case 'playing':
        this.renderer.render(this.state);
        break;
      case 'paused':
        this.renderer.render(this.state);
        this.renderer.renderPauseMenu(this.pauseSelection, this.state.mode);
        break;
      case 'clanPrimer':
        this.renderer.render(this.state);
        this.renderer.renderClanPrimer(this.state.monsterBook, this.primerTab, this.primerScroll, loadDiscoveries());
        break;
      case 'over':
        this.renderer.renderGameOver(this.won, this.state);
        break;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private tileAt(x: number, y: number): Tile {
    const { map, mapWidth, mapHeight } = this.state;
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return Tile.Wall;
    return map[y * mapWidth + x] as Tile;
  }

  private entityAt(x: number, y: number): Entity | undefined {
    return this.state.entities.find(e => e.x === x && e.y === y && e.alive);
  }

  private canWalk(x: number, y: number): boolean {
    return this.tileAt(x, y) !== Tile.Wall;
  }

  // ── Biome hazards ─────────────────────────────────────────────────────────

  private applyHazardDamage(): void {
    const tile = this.tileAt(this.state.player.x, this.state.player.y);
    if (tile === Tile.IceFloor) {
      discoverHazard('Ice Floor');
    } else if (tile === Tile.SlimePool) {
      discoverHazard('Slime Pool');
      if (this.state.invincibleUntilTurn <= this.state.turn) {
        this.state.player.stats!.hp -= 1;
        audio.slime();
        this.addLog('The slime burns! (-1 HP)');
      }
    } else if (tile === Tile.LavaFloor) {
      discoverHazard('Lava Floor');
      if (this.state.invincibleUntilTurn <= this.state.turn) {
        this.state.player.stats!.hp -= 3;
        audio.lava();
        this.addLog('The lava sears your flesh! (-3 HP)');
      }
    }
  }

  private applyIceSlide(dx: number, dy: number): void {
    const { player } = this.state;
    if (this.tileAt(player.x, player.y) !== Tile.IceFloor) return;

    let slid = false;
    for (let step = 0; step < 12; step++) {
      const nx = player.x + dx;
      const ny = player.y + dy;
      const nextTile = this.tileAt(nx, ny);
      if (nextTile === Tile.Wall) break;
      const blocker = this.entityAt(nx, ny);
      if (blocker?.type === EntityType.Monster) {
        const prevLevel = playerLevel(player.stats!.xp);
        audio.attack();
        this.addLog(attackEntity(player, blocker));
        if (!blocker.alive) {
          audio.kill();
          const idx = this.state.entities.indexOf(blocker);
          if (idx !== -1) this.state.entities.splice(idx, 1);
          this.handleKill(blocker);
        }
        if (playerLevel(player.stats!.xp) > prevLevel) {
          audio.levelUp();
          this.addLog('You feel stronger! (Level up)');
        }
        break;
      }
      player.x = nx;
      player.y = ny;
      slid = true;
      if (nextTile !== Tile.IceFloor) break;
    }
    if (slid) {
      audio.ice();
      this.addLog('You slide across the ice!');
    }
  }

  // ── Player actions ────────────────────────────────────────────────────────

  private tryMove(dx: number, dy: number): void {
    if (this.state.frozenTurns > 0) {
      this.state.frozenTurns--;
      this.addLog(`You are frozen! (${this.state.frozenTurns} turns remaining)`);
      this.endTurn();
      return;
    }

    const { player, entities } = this.state;
    const nx = player.x + dx;
    const ny = player.y + dy;

    const target = this.entityAt(nx, ny);
    if (target?.type === EntityType.Monster) {
      const prevLevel = playerLevel(player.stats!.xp);
      audio.attack();
      this.addLog(attackEntity(player, target));

      if (!target.alive) {
        audio.kill();
        const idx = entities.indexOf(target);
        if (idx !== -1) entities.splice(idx, 1);
        this.handleKill(target);
      }

      if (playerLevel(player.stats!.xp) > prevLevel) {
        audio.levelUp();
        this.addLog('You feel stronger! (Level up)');
      }
      this.endTurn();
      return;
    }

    if (!this.canWalk(nx, ny)) { audio.bump(); return; }

    player.x = nx;
    player.y = ny;
    audio.step();
    this.applyIceSlide(dx, dy);

    if (this.tileAt(player.x, player.y) === Tile.StairsDown) {
      this.addLog('You see stairs leading down. Press > to descend.');
    }
    this.endTurn();
  }

  private tryPickup(): void {
    const { player, entities } = this.state;
    const item = entities.find(
      e => e.type === EntityType.Item && e.alive && e.x === player.x && e.y === player.y
    );
    if (!item) { this.addLog('Nothing to pick up here.'); return; }
    audio.pickup();
    // Log to codex (weapons are all logged as 'Weapon')
    const codexName = item.itemKind === ItemKind.Sword ? 'Weapon' : item.name;
    discoverItem(codexName);
    const msg = useItem(player, item.itemKind!, this.state, item);
    item.alive = false;
    this.addLog(`You pick up the ${item.name}. ${msg}`);
    this.endTurn();
    if (this.state.mode === 'roguelike') this.writeSave();
  }

  private tryDescend(): void {
    if (this.tileAt(this.state.player.x, this.state.player.y) === Tile.StairsDown) {
      this.descend();
    } else {
      this.addLog('There are no stairs here.');
    }
  }

  private endTurn(): void {
    this.state.turn++;
    this.applyHazardDamage();
    if (this.checkDeath()) return;

    // Lantern expiry
    if (this.state.lanternExpiresAt > 0 && this.state.turn >= this.state.lanternExpiresAt) {
      this.state.fovRadius      = BASE_FOV;
      this.state.lanternExpiresAt = 0;
      this.addLog('The lantern dims.');
    }

    this.runMonsters();
    if (this.checkDeath()) return;
    if (this.state.mode === 'roguelike' && this.state.turn % SAVE_INTERVAL === 0) this.writeSave();
    this.updateFOV();
    this.checkNewSightings();
    this.render();
  }

  private checkDeath(): boolean {
    if (this.state.player.alive && this.state.player.stats!.hp > 0) return false;
    this.state.player.alive = false;
    this.screen = 'over';
    this.won = false;
    if (this.state.mode === 'roguelike') {
      const meta = loadMeta();
      meta.gold += this.state.gold;
      saveMeta(meta);
    } else {
      deleteSave();
    }
    audio.death();
    this.addLog('You have died. Press R to try again.');
    this.updateFOV();
    this.render();
    return true;
  }

  // ── Monster AI ────────────────────────────────────────────────────────────

  private runMonsters(): void {
    const { entities, player, visible, mapWidth, map } = this.state;
    const mw = mapWidth;
    let playerHurt = false;
    let frozePlayer = false;

    for (const e of entities) {
      if (e.type !== EntityType.Monster || !e.alive) continue;
      if (!visible[e.y * mapWidth + e.x]) continue;

      if (e.frozenTurns && e.frozenTurns > 0) {
        e.frozenTurns--;
        continue;
      }

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const adjacent = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0);

      if (adjacent) {
        const invincible = this.state.invincibleUntilTurn > this.state.turn;

        if (e.special === 'freeze') {
          if (!invincible) {
            this.addLog(attackEntity(e, player));
            this.state.frozenTurns = 2;
            frozePlayer = true;
            playerHurt  = true;
          } else {
            this.addLog(`The ${e.name} attacks, but the star protects you!`);
          }
          continue;
        }
        if (e.special === 'fireline') {
          const stepX = Math.sign(dx);
          const stepY = Math.sign(dy);
          let fx = e.x, fy = e.y, torched = 0;
          for (let i = 0; i < 4 && torched < 3; i++) {
            fx += stepX; fy += stepY;
            if (fx < 0 || fy < 0 || fx >= mw || fy >= this.state.mapHeight) break;
            const t = map[fy * mw + fx];
            if (t === Tile.Floor || t === Tile.IceFloor || t === Tile.SlimePool) {
              map[fy * mw + fx] = Tile.LavaFloor;
              torched++;
            }
          }
          if (!invincible) {
            const dmg = Math.floor(Math.random() * 8) + 10;
            player.stats!.hp -= dmg;
            this.addLog(`The Fire Dragon breathes fire! (${torched} tiles scorched, -${dmg} HP)`);
            audio.fireBreath();
            playerHurt = true;
          } else {
            this.addLog(`The Fire Dragon breathes fire! (${torched} tiles scorched, star protects you!)`);
          }
          continue;
        }
        if (!invincible) {
          this.addLog(attackEntity(e, player));
          playerHurt = true;
        } else {
          this.addLog(`The ${e.name} attacks, but the star protects you!`);
        }
        continue;
      }

      const canMove = (x: number, y: number) => {
        if (!this.canWalk(x, y)) return false;
        if (x === player.x && y === player.y) return false;
        return !entities.some(o => o !== e && o.alive && o.x === x && o.y === y && o.type === EntityType.Monster);
      };

      const step = monsterAI(e, player, canMove);
      if (step.dx !== 0 || step.dy !== 0) {
        const nx = e.x + step.dx;
        const ny = e.y + step.dy;
        if (canMove(nx, ny)) { e.x = nx; e.y = ny; }
      }
    }

    if (frozePlayer) audio.freeze();
    else if (playerHurt) audio.hurt();
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private bindKeys(): void {
    window.addEventListener('keydown', e => {
      switch (this.screen) {

        case 'menu':
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            // toggle between CLASSIC (0) and ROGUELIKE (1)
            this.menuSelection = this.menuSelection === 0 ? 1 : 0;
          } else if (e.key === 'Enter' || e.key === ' ') {
            this.stopAnimLoop();
            if (this.menuSelection === 0) {
              // CLASSIC
              this.mode = 'classic';
              this.startGame();
            } else {
              // ROGUELIKE — resume run if save exists, else go to lobby
              this.mode = 'roguelike';
              if (hasSave()) {
                this.loadSavedGame();
              } else {
                this.showLobby();
              }
            }
          }
          e.preventDefault();
          break;

        case 'lobby': {
          const meta = loadMeta();
          const upgradeKeys = ['vitality', 'strength', 'fortitude'] as const;
          const numOpts = upgradeKeys.length + THEMES.length + 1; // upgrades + skins + descend

          if (e.key === 'ArrowUp') {
            this.lobbySelection = (this.lobbySelection - 1 + numOpts) % numOpts;
          } else if (e.key === 'ArrowDown') {
            this.lobbySelection = (this.lobbySelection + 1) % numOpts;
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (this.lobbySelection < upgradeKeys.length) {
              // Stat upgrade
              const kind = upgradeKeys[this.lobbySelection];
              const cost = nextUpgradeCost(kind, meta.upgrades[kind]);
              if (cost !== null && meta.gold >= cost) {
                meta.gold -= cost;
                meta.upgrades[kind]++;
                saveMeta(meta);
              }
            } else if (this.lobbySelection < upgradeKeys.length + THEMES.length) {
              // Skin buy/equip
              const skinIdx = this.lobbySelection - upgradeKeys.length;
              const theme   = THEMES[skinIdx];
              const cost    = SKIN_COSTS[theme.name] ?? 100;
              const owned   = meta.unlockedSkins.includes(theme.name);
              if (owned) {
                meta.activeSkin = theme.name;
                this.renderer.themeIndex = skinIdx;
                this.renderer.applyBodyBg();
                saveMeta(meta);
              } else if (meta.gold >= cost) {
                meta.gold -= cost;
                meta.unlockedSkins.push(theme.name);
                meta.activeSkin = theme.name;
                this.renderer.themeIndex = skinIdx;
                this.renderer.applyBodyBg();
                saveMeta(meta);
              }
            } else {
              // Descend
              this.stopAnimLoop();
              this.startGame();
            }
          } else if (e.key === 'Escape') {
            this.stopAnimLoop();
            this.showMenu();
          }
          e.preventDefault();
          break;
        }

        case 'playing':
          if (e.key === 'Escape') { this.openPause(); e.preventDefault(); break; }
          switch (e.key) {
            case 'ArrowUp':    case 'w': case 'W': case 'k': this.tryMove(0, -1);  break;
            case 'ArrowDown':  case 's': case 'S': case 'j': this.tryMove(0,  1);  break;
            case 'ArrowLeft':  case 'a': case 'A': case 'h': this.tryMove(-1, 0);  break;
            case 'ArrowRight': case 'd': case 'D': case 'l': this.tryMove( 1, 0);  break;
            case 'y': case '7': this.tryMove(-1, -1); break;
            case 'u': case '9': this.tryMove( 1, -1); break;
            case 'b': case '1': this.tryMove(-1,  1); break;
            case 'n': case '3': this.tryMove( 1,  1); break;
            case '.': case '5': this.endTurn();        break;
            case 'g': case 'G': this.tryPickup();      break;
            case '>':           this.tryDescend();     break;
            default: return;
          }
          e.preventDefault();
          break;

        case 'paused':
          if (e.key === 'Escape') {
            this.closePause();
          } else if (e.key === 'ArrowUp') {
            this.pauseSelection = (this.pauseSelection - 1 + 3) % 3;
            this.render();
          } else if (e.key === 'ArrowDown') {
            this.pauseSelection = (this.pauseSelection + 1) % 3;
            this.render();
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (this.pauseSelection === 0) {
              this.closePause();
            } else if (this.pauseSelection === 1) {
              this.openClanPrimer();
            } else {
              if (this.state.mode === 'roguelike') this.writeSave();
              this.showMenu();
            }
          }
          e.preventDefault();
          break;

        case 'clanPrimer': {
          const primerTabs = ['book', 'items', 'hazards', 'hunts'] as const;
          if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
            this.closeClanPrimer();
          } else if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const idx = primerTabs.indexOf(this.primerTab);
            const dir = e.key === 'ArrowLeft' ? -1 : 1;
            this.primerTab    = primerTabs[(idx + dir + primerTabs.length) % primerTabs.length];
            this.primerScroll = 0;
            this.render();
          } else if (e.key === 'ArrowUp') {
            this.primerScroll = Math.max(0, this.primerScroll - 1);
            this.render();
          } else if (e.key === 'ArrowDown') {
            this.primerScroll++;
            this.render();
          }
          e.preventDefault();
          break;
        }

        case 'over':
          if (e.key === 'r' || e.key === 'R') {
            if (this.mode === 'roguelike') {
              this.showLobby();
            } else {
              this.startGame();
            }
          }
          break;
      }
    });
  }
}
