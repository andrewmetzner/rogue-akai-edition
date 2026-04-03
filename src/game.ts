import { type GameState, type Entity, EntityType, Tile } from './types';
import { generateDungeon } from './dungeon';
import { createPlayer, spawnEntities } from './entities';
import { computeFOV } from './fov';
import { attackEntity, useItem, monsterAI, playerLevel } from './combat';
import { Renderer } from './renderer';
import { THEMES } from './themes';
import { getBiome } from './biomes';
import { audio } from './audio';
import { saveGame, deleteSave, loadSaveMeta, loadGame, type SaveMeta } from './save';

const MAP_W = 80;
const MAP_H = 45;
const FOV_RADIUS = 9;
const MAX_DEPTH = 28;
const MAX_LOG = 6;
const SAVE_INTERVAL = 10; // auto-save every N turns

export class Game {
  private state!: GameState;
  private renderer: Renderer;
  private over = false;
  private won = false;
  private atMenu = true;
  private menuAnimId = 0;
  private menuSelection = 0; // 0=Continue 1=New Game (when save exists)
  private saveMeta: SaveMeta | null = null;

  constructor() {
    this.renderer = new Renderer('canvas');
    this.bindKeys();
    this.showMenu();
  }

  // ── Start menu ────────────────────────────────────────────────────────────

  private showMenu(): void {
    this.atMenu = true;
    this.saveMeta = loadSaveMeta();
    this.menuSelection = 0; // default: Continue (if save exists) or New Game
    document.getElementById('hud-left')!.textContent = '';
    document.getElementById('hud-right')!.textContent = '';
    document.getElementById('log')!.innerHTML = '';
    const loop = () => {
      if (!this.atMenu) return;
      this.renderer.renderStartMenu(this.saveMeta, this.menuSelection);
      this.menuAnimId = requestAnimationFrame(loop);
    };
    this.menuAnimId = requestAnimationFrame(loop);
  }

  private startFromMenu(): void {
    this.atMenu = false;
    cancelAnimationFrame(this.menuAnimId);

    const biome = getBiome(1);
    this.renderer.applyBodyBg(biome.palette.bg);
    audio.start();

    if (this.saveMeta && this.menuSelection === 0) {
      this.loadSavedGame();
    } else {
      deleteSave();
      this.newGame();
    }
  }

  // ── Game lifecycle ────────────────────────────────────────────────────────

  private newGame(): void {
    const depth = 1;
    const biome = getBiome(depth);
    const dungeon = generateDungeon(MAP_W, MAP_H, biome);
    const player = createPlayer(dungeon.startX, dungeon.startY);
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
      biomeId: biome.id,
      turn: 0,
      frozenTurns: 0,
      log: ['Welcome! Move to explore. G=pick up item, >=descend stairs.'],
    };
    this.over = false;
    this.won = false;
    this.updateFOV();
    this.render();
    this.renderLog();
  }

  private loadSavedGame(): void {
    const loaded = loadGame();
    if (!loaded) { this.newGame(); return; }

    const biome = getBiome(loaded.state.depth);
    this.state = {
      ...loaded.state,
      visible: new Uint8Array(loaded.state.mapWidth * loaded.state.mapHeight),
      frozenTurns: 0,
      biomeId: loaded.biomeId,
    };
    this.renderer.themeIndex = loaded.themeIndex;
    this.renderer.applyBodyBg(biome.palette.bg);
    this.over = false;
    this.won = false;
    this.updateFOV();
    this.render();
    this.renderLog();
    this.addLog(`Welcome back. Depth ${this.state.depth} — ${biome.name}.`);
  }

  private descend(): void {
    const depth = this.state.depth + 1;
    if (depth > MAX_DEPTH) {
      this.won = true;
      this.over = true;
      deleteSave();
      audio.victory();
      this.renderer.renderGameOver(true, this.state);
      return;
    }

    audio.stairs();
    const biome = getBiome(depth);
    const dungeon = generateDungeon(MAP_W, MAP_H, biome);
    const player = this.state.player;
    player.x = dungeon.startX;
    player.y = dungeon.startY;
    const entities = spawnEntities(dungeon.rooms, dungeon.map, dungeon.width, depth, player.x, player.y);

    this.state = {
      ...this.state,
      map:      dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      visible:  new Uint8Array(dungeon.width * dungeon.height),
      explored: new Uint8Array(dungeon.width * dungeon.height),
      entities,
      depth,
      biomeId: biome.id,
      frozenTurns: 0,
    };

    this.addLog(`Depth ${depth}: ${biome.name}. ${biome.flavorText}`);
    this.updateFOV();
    this.renderer.applyBodyBg(biome.palette.bg);
    this.writeSave();
    this.render();
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  private writeSave(): void {
    saveGame(this.state, this.state.biomeId, this.renderer.themeIndex);
    audio.save();
  }

  // ── Core systems ──────────────────────────────────────────────────────────

  private updateFOV(): void {
    const { map, mapWidth, mapHeight, visible, explored, player } = this.state;
    computeFOV(visible, mapWidth, mapHeight, player.x, player.y, FOV_RADIUS, (x, y) => {
      if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return true;
      return map[y * mapWidth + x] === Tile.Wall;
    });
    for (let i = 0; i < visible.length; i++) {
      if (visible[i]) explored[i] = 1;
    }
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
    if (this.over) {
      this.renderer.renderGameOver(this.won, this.state);
    } else {
      this.renderer.render(this.state);
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
    const t = this.tileAt(x, y);
    return t !== Tile.Wall;
  }

  // ── Biome hazards ─────────────────────────────────────────────────────────

  private applyHazardDamage(): void {
    const tile = this.tileAt(this.state.player.x, this.state.player.y);
    const s = this.state.player.stats!;
    if (tile === Tile.LavaFloor) {
      const dmg = 3;
      s.hp -= dmg;
      audio.lava();
      this.addLog(`The lava sears your flesh! (-${dmg} HP)`);
    } else if (tile === Tile.SlimePool) {
      const dmg = 1;
      s.hp -= dmg;
      audio.slime();
      this.addLog(`The slime burns! (-${dmg} HP)`);
    }
  }

  /** Try to slide on ice: keep moving in direction until non-ice or wall. */
  private applyIceSlide(dx: number, dy: number): boolean {
    const { player } = this.state;
    if (this.tileAt(player.x, player.y) !== Tile.IceFloor) return false;

    let slid = false;
    for (let step = 0; step < 10; step++) {
      const nx = player.x + dx;
      const ny = player.y + dy;
      const nextTile = this.tileAt(nx, ny);
      if (nextTile === Tile.Wall) break;
      const blocker = this.entityAt(nx, ny);
      if (blocker?.type === EntityType.Monster) {
        // Slam into monster while sliding
        const prevLevel = playerLevel(player.stats!.xp);
        audio.attack();
        this.addLog(attackEntity(player, blocker));
        if (!blocker.alive) {
          audio.kill();
          const idx = this.state.entities.indexOf(blocker);
          if (idx !== -1) this.state.entities.splice(idx, 1);
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
    return slid;
  }

  // ── Player actions ────────────────────────────────────────────────────────

  private tryMove(dx: number, dy: number): void {
    if (this.over) return;
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
      }
      if (playerLevel(player.stats!.xp) > prevLevel) {
        audio.levelUp();
        this.addLog('You feel stronger! (Level up)');
      }
      this.endTurn();
      return;
    }

    if (!this.canWalk(nx, ny)) {
      audio.bump();
      return;
    }

    player.x = nx;
    player.y = ny;
    audio.step();

    // Ice sliding (recursive until non-ice)
    this.applyIceSlide(dx, dy);

    if (this.tileAt(player.x, player.y) === Tile.StairsDown) {
      this.addLog('You see stairs leading down. Press > to descend.');
    }

    this.endTurn();
  }

  private tryPickup(): void {
    if (this.over) return;
    const { player, entities } = this.state;
    const item = entities.find(
      e => e.type === EntityType.Item && e.alive && e.x === player.x && e.y === player.y
    );
    if (!item) { this.addLog('Nothing to pick up here.'); return; }

    audio.pickup();
    const msg = useItem(player, item.itemKind!, entities);
    item.alive = false;
    this.addLog(`You pick up the ${item.name}. ${msg}`);
    this.endTurn();
  }

  private tryDescend(): void {
    if (this.over) return;
    if (this.tileAt(this.state.player.x, this.state.player.y) === Tile.StairsDown) {
      this.descend();
    } else {
      this.addLog('There are no stairs here.');
    }
  }

  private endTurn(): void {
    if (this.over) return;
    this.state.turn++;

    // Hazard damage before monsters act
    this.applyHazardDamage();
    if (this.checkDeath()) return;

    this.runMonsters();
    if (this.checkDeath()) return;

    // Auto-save periodically
    if (this.state.turn % SAVE_INTERVAL === 0) this.writeSave();

    this.updateFOV();
    this.render();
  }

  private checkDeath(): boolean {
    if (this.state.player.alive && this.state.player.stats!.hp > 0) return false;
    this.state.player.alive = false;
    this.over = true;
    this.won = false;
    deleteSave(); // permadeath — save is gone
    audio.death();
    this.addLog('You have died... Press R to restart.');
    this.updateFOV();
    this.renderer.renderGameOver(false, this.state);
    return true;
  }

  // ── Monster AI ────────────────────────────────────────────────────────────

  private runMonsters(): void {
    const { entities, player, visible, mapWidth, map, mapWidth: mw } = this.state;
    let playerHurt = false;
    let frozePlayer = false;

    for (const e of entities) {
      if (e.type !== EntityType.Monster || !e.alive) continue;

      const idx = e.y * mapWidth + e.x;
      if (!visible[idx]) continue;

      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const adjacent = Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0);

      if (adjacent) {
        // Special attacks
        if (e.special === 'freeze') {
          this.addLog(attackEntity(e, player));
          this.state.frozenTurns = 2;
          frozePlayer = true;
          playerHurt = true;
          continue;
        }
        if (e.special === 'fireline') {
          // Breathe fire in a 3-tile line from dragon toward player
          const stepX = Math.sign(dx);
          const stepY = Math.sign(dy);
          let fx = e.x, fy = e.y;
          let torched = 0;
          for (let i = 0; i < 4 && torched < 3; i++) {
            fx += stepX; fy += stepY;
            if (fx < 0 || fy < 0 || fx >= mw || fy >= this.state.mapHeight) break;
            const t = map[fy * mw + fx];
            if (t === Tile.Floor || t === Tile.IceFloor || t === Tile.SlimePool) {
              map[fy * mw + fx] = Tile.LavaFloor;
              torched++;
            }
          }
          const dmg = Math.floor(Math.random() * 8) + 10;
          player.stats!.hp -= dmg;
          this.addLog(`The Fire Dragon breathes fire! (${torched} tiles scorched, -${dmg} HP)`);
          audio.fireBreath();
          playerHurt = true;
          continue;
        }
        // Normal attack
        this.addLog(attackEntity(e, player));
        playerHurt = true;
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
      // Menu
      if (this.atMenu) {
        if (e.key === 'Enter' || e.key === ' ') {
          this.startFromMenu();
        } else if (e.key === 'ArrowLeft') {
          this.renderer.themeIndex = (this.renderer.themeIndex - 1 + THEMES.length) % THEMES.length;
          this.renderer.applyBodyBg();
        } else if (e.key === 'ArrowRight') {
          this.renderer.themeIndex = (this.renderer.themeIndex + 1) % THEMES.length;
          this.renderer.applyBodyBg();
        } else if (this.saveMeta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          this.menuSelection = this.menuSelection === 0 ? 1 : 0;
        }
        e.preventDefault();
        return;
      }

      // Post-game
      if (this.over) {
        if (e.key === 'r' || e.key === 'R') this.newGame();
        return;
      }

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
    });
  }
}
