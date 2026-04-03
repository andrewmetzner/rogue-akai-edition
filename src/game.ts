import { type GameState, type Entity, EntityType, Tile } from './types';
import { generateDungeon } from './dungeon';
import { createPlayer, spawnEntities } from './entities';
import { computeFOV } from './fov';
import { attackEntity, useItem, monsterAI } from './combat';
import { Renderer } from './renderer';

const MAP_W = 80;
const MAP_H = 45;
const FOV_RADIUS = 9;
const MAX_DEPTH = 7;
const MAX_LOG = 6;

export class Game {
  private state!: GameState;
  private renderer: Renderer;
  private over = false;
  private won = false;
  private atMenu = true;
  private menuAnimId = 0;

  constructor() {
    this.renderer = new Renderer('canvas');
    this.bindKeys();
    this.showMenu();
  }

  // ── Start menu ────────────────────────────────────────────────────────────

  private showMenu(): void {
    this.atMenu = true;
    document.getElementById('hud-left')!.textContent = '';
    document.getElementById('hud-right')!.textContent = '';
    document.getElementById('log')!.innerHTML = '';
    const loop = () => {
      if (!this.atMenu) return;
      this.renderer.renderStartMenu();
      this.menuAnimId = requestAnimationFrame(loop);
    };
    this.menuAnimId = requestAnimationFrame(loop);
  }

  private startGame(): void {
    this.atMenu = false;
    cancelAnimationFrame(this.menuAnimId);
    this.newGame();
  }

  // ── Game lifecycle ────────────────────────────────────────────────────────

  private newGame(): void {
    const depth = 1;
    const dungeon = generateDungeon(MAP_W, MAP_H, depth);
    const player = createPlayer(dungeon.startX, dungeon.startY);
    const monsters = spawnEntities(dungeon.rooms, dungeon.map, dungeon.width, depth, player.x, player.y);

    this.state = {
      map: dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      visible: new Uint8Array(dungeon.width * dungeon.height),
      explored: new Uint8Array(dungeon.width * dungeon.height),
      entities: monsters,
      player,
      depth,
      turn: 0,
      log: ['Welcome! Move to explore. G=get item, >=descend stairs.'],
    };
    this.over = false;
    this.won = false;
    this.updateFOV();
    this.render();
    this.renderLog();
  }

  private descend(): void {
    const depth = this.state.depth + 1;
    if (depth > MAX_DEPTH) {
      this.won = true;
      this.over = true;
      this.renderer.renderGameOver(true);
      return;
    }
    const dungeon = generateDungeon(MAP_W, MAP_H, depth);
    const player = this.state.player;
    player.x = dungeon.startX;
    player.y = dungeon.startY;
    const monsters = spawnEntities(dungeon.rooms, dungeon.map, dungeon.width, depth, player.x, player.y);

    this.state = {
      ...this.state,
      map: dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      visible: new Uint8Array(dungeon.width * dungeon.height),
      explored: new Uint8Array(dungeon.width * dungeon.height),
      entities: monsters,
      depth,
    };
    this.addLog(`You descend to depth ${depth}.`);
    this.updateFOV();
    this.render();
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
      this.renderer.renderGameOver(this.won);
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
    return this.tileAt(x, y) !== Tile.Wall;
  }

  // ── Player actions ────────────────────────────────────────────────────────

  private tryMove(dx: number, dy: number): void {
    if (this.over) return;
    const { player, entities } = this.state;
    const nx = player.x + dx;
    const ny = player.y + dy;

    const target = this.entityAt(nx, ny);
    if (target?.type === EntityType.Monster) {
      const msg = attackEntity(player, target);
      this.addLog(msg);
      if (!target.alive) {
        const idx = entities.indexOf(target);
        if (idx !== -1) entities.splice(idx, 1);
      }
      this.endTurn();
      return;
    }

    if (!this.canWalk(nx, ny)) return;

    player.x = nx;
    player.y = ny;

    if (this.tileAt(nx, ny) === Tile.StairsDown) {
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
    this.runMonsters();
    this.updateFOV();
    this.render();

    if (!this.state.player.alive) {
      this.over = true;
      this.won = false;
      this.addLog('You have died... Press R to restart.');
      this.renderer.renderGameOver(false);
    }
  }

  // ── Monster AI ────────────────────────────────────────────────────────────

  private runMonsters(): void {
    const { entities, player, visible, mapWidth } = this.state;
    for (const e of entities) {
      if (e.type !== EntityType.Monster || !e.alive) continue;

      const idx = e.y * mapWidth + e.x;
      if (!visible[idx]) continue;

      const dx = player.x - e.x;
      const dy = player.y - e.y;

      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0)) {
        this.addLog(attackEntity(e, player));
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
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private bindKeys(): void {
    window.addEventListener('keydown', e => {
      // Menu
      if (this.atMenu) {
        if (e.key === 'Enter' || e.key === ' ') this.startGame();
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
