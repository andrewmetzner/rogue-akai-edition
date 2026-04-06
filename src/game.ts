import { type GameState, type Entity, EntityType, Tile } from './types';
import { generateDungeon } from './dungeon';
import { createPlayer, spawnEntities, spawnStartItems } from './entities';
import { computeFOV } from './fov';
import { attackEntity, useItem, monsterAI, playerLevel } from './combat';
import { Renderer } from './renderer';
import { THEMES } from './themes';
import { getBiome } from './biomes';
import { CLASSES, getClass, type CharClass } from './classes';
import { audio } from './audio';
import { saveGame, deleteSave, loadSaveMeta, loadGame, type SaveMeta } from './save';
import {
  loadMeta, saveMeta, applyMetaUpgrades,
  getAdvancement, getAdvancements, nextUpgradeCost,
} from './meta';

const MAP_W = 80;
const MAP_H = 45;
const BASE_FOV = 9;
const MAX_DEPTH = 28;
const MAX_LOG = 6;
const SAVE_INTERVAL = 10;

type Screen =
  | 'menu' | 'modeSelect' | 'classSelect'
  | 'playing' | 'paused' | 'upgradeRoom' | 'lobby'
  | 'over' | 'clanPrimer';

interface UpgradeRoomOption {
  label: string;
  desc: string;
  cost: number;
  disabled: boolean;
  action: 'advance-a' | 'advance-b' | 'weapon' | 'rest';
}

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class Game {
  private state!: GameState;
  private renderer: Renderer;
  private screen: Screen = 'menu';
  private animId = 0;

  private saveMeta: SaveMeta | null = null;
  private menuSelection = 0;

  private mode: 'classic' | 'roguelite' = 'classic';
  private modeSelection = 0;

  private classIndex = 0;

  private pauseSelection = 0;

  private upgradeRoomOpts: UpgradeRoomOption[] = [];
  private upgradeRoomSel = 0;
  private pendingDepth = 0;

  private lobbySelection = 0;

  private primerTab: 'book' | 'hunts' = 'book';
  private primerScroll = 0;

  private seenEntityIds = new Set<number>();

  private won = false;

  constructor() {
    this.renderer = new Renderer('canvas');
    this.bindKeys();
    this.showMenu();
  }

  // ── Screen transitions ───────────────────────────────────────────────────

  private showMenu(): void {
    this.screen = 'menu';
    this.saveMeta = loadSaveMeta();
    this.menuSelection = 0;
    document.getElementById('hud-left')!.textContent = '';
    document.getElementById('hud-right')!.textContent = '';
    document.getElementById('log')!.innerHTML = '';
    this.startAnimLoop();
  }

  private showModeSelect(): void {
    this.screen = 'modeSelect';
    this.modeSelection = 0;
    this.startAnimLoop();
  }

  private showClassSelect(): void {
    this.screen = 'classSelect';
    this.classIndex = 0;
    this.startAnimLoop();
  }

  private showLobby(): void {
    this.screen = 'lobby';
    this.lobbySelection = 0;
    this.startAnimLoop();
  }

  private showUpgradeRoom(nextDepth: number): void {
    this.pendingDepth = nextDepth;
    this.upgradeRoomOpts = this.buildUpgradeOpts();
    this.upgradeRoomSel = 0;
    this.screen = 'upgradeRoom';
    this.render();
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

  private startGame(cls: CharClass): void {
    this.stopAnimLoop();
    this.screen = 'playing';
    const biome = getBiome(1);
    this.renderer.applyBodyBg(biome.palette.bg);
    audio.start();
    this.newGame(cls);
  }

  private loadSavedGame(): void {
    const loaded = loadGame();
    if (!loaded) { this.showClassSelect(); return; }

    const biome = getBiome(loaded.state.depth);
    this.state = {
      ...loaded.state,
      visible: new Uint8Array(loaded.state.mapWidth * loaded.state.mapHeight),
    };
    this.mode = this.state.mode;
    this.renderer.themeIndex = loaded.themeIndex;
    this.renderer.applyBodyBg(biome.palette.bg);
    this.screen = 'playing';
    this.won = false;
    this.seenEntityIds = new Set();
    this.updateFOV();
    this.render();
    this.renderLog();
    this.addLog(`Welcome back. Depth ${this.state.depth} — ${biome.name}.`);
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
      if (s !== 'menu' && s !== 'classSelect' && s !== 'modeSelect' && s !== 'lobby') return;
      this.render();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  private stopAnimLoop(): void {
    cancelAnimationFrame(this.animId);
  }

  // ── Game lifecycle ────────────────────────────────────────────────────────

  private newGame(cls: CharClass): void {
    const depth = 1;
    const biome = getBiome(depth);
    const dungeon = generateDungeon(MAP_W, MAP_H, biome);
    const fovRadius = BASE_FOV + cls.fovBonus;

    let hpOverride: number | undefined;
    let atkOverride: number | undefined;
    let defOverride: number | undefined;
    if (this.mode === 'roguelite') {
      const meta = loadMeta();
      const adj = applyMetaUpgrades({ hp: cls.hp, atk: cls.attack, def: cls.defense }, meta.upgrades);
      hpOverride  = adj.hp;
      atkOverride = adj.atk;
      defOverride = adj.def;
    }

    const player     = createPlayer(dungeon.startX, dungeon.startY, cls, hpOverride, atkOverride, defOverride);
    const entities   = spawnEntities(dungeon.rooms, dungeon.map, dungeon.width, depth, player.x, player.y);
    const startItems = spawnStartItems(cls, dungeon.startX, dungeon.startY);

    this.state = {
      map:      dungeon.map,
      mapWidth: dungeon.width,
      mapHeight: dungeon.height,
      visible:  new Uint8Array(dungeon.width * dungeon.height),
      explored: new Uint8Array(dungeon.width * dungeon.height),
      entities: [...entities, ...startItems],
      player,
      depth,
      biomeId:  biome.id,
      classId:  cls.id,
      fovRadius,
      turn: 0,
      frozenTurns: 0,
      log: [`You enter the dungeon as a ${cls.name}. Good luck.`],
      mode: this.mode,
      gold: 0,
      advancement: null,
      weaponTier: 0,
      invincibleUntilTurn: 0,
      lanternExpiresAt: 0,
      monsterBook: {},
    };
    this.won = false;
    this.seenEntityIds = new Set();
    this.updateFOV();
    this.render();
    this.renderLog();
    if (startItems.length > 0) {
      this.addLog(`Starting items are at your feet — press G to pick them up.`);
    }
  }

  private descend(): void {
    const depth = this.state.depth + 1;
    if (depth > MAX_DEPTH) {
      this.won = true;
      this.screen = 'over';
      if (this.state.mode === 'roguelite') {
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

    if (this.state.mode === 'roguelite' && [7, 14, 21].includes(this.state.depth)) {
      this.showUpgradeRoom(depth);
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

    const bonusItemChance = this.state.advancement === 'chief-bandit' ? 0.1 : 0;
    const entities = spawnEntities(
      dungeon.rooms, dungeon.map, dungeon.width,
      depth, player.x, player.y, bonusItemChance,
    );

    const cls        = getClass(this.state.classId);
    const sniperBonus = this.state.advancement === 'sniper' ? 5 : 0;
    const baseFov    = BASE_FOV + cls.fovBonus + sniperBonus;

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
      fovRadius: baseFov,
      invincibleUntilTurn: 0,
      lanternExpiresAt: 0,
    };

    this.addLog(`Depth ${depth}: ${biome.name}. ${biome.flavorText}`);
    this.updateFOV();
    this.renderer.applyBodyBg(biome.palette.bg);
    if (this.state.mode === 'classic') this.writeSave();
    this.render();
  }

  private buildUpgradeOpts(): UpgradeRoomOption[] {
    const opts: UpgradeRoomOption[] = [];
    const cls         = getClass(this.state.classId);
    const advancements = getAdvancements(this.state.classId);

    for (const adv of advancements) {
      const alreadyAdvanced = this.state.advancement !== null;
      const cantAfford      = this.state.gold < adv.cost;
      opts.push({
        label:    `Become ${adv.name}`,
        desc:     adv.description,
        cost:     adv.cost,
        disabled: alreadyAdvanced || cantAfford,
        action:   adv.path === 'A' ? 'advance-a' : 'advance-b',
      });
    }

    const nextTier = Math.min(this.state.weaponTier + 1, 3);
    opts.push({
      label:    `Upgrade: ${cls.weaponNames[nextTier]}`,
      desc:     `Weapon tier ${nextTier}/3 (+4 ATK)`,
      cost:     0,
      disabled: this.state.weaponTier >= 3,
      action:   'weapon',
    });

    opts.push({
      label:    'Rest',
      desc:     'Restore 40% of max HP',
      cost:     0,
      disabled: false,
      action:   'rest',
    });

    return opts;
  }

  private applyAdvancement(id: string): void {
    const adv = getAdvancement(id);
    if (!adv || this.state.advancement !== null) return;
    if (this.state.gold < adv.cost) return;
    this.state.gold -= adv.cost;
    this.state.advancement = id;
    const s = this.state.player.stats!;
    if (adv.statBonus.hp)  { s.maxHp += adv.statBonus.hp; s.hp = Math.min(s.hp + adv.statBonus.hp, s.maxHp); }
    if (adv.statBonus.atk) s.attack  += adv.statBonus.atk;
    if (adv.statBonus.def) s.defense += adv.statBonus.def;
    if (adv.statBonus.fov) this.state.fovRadius += adv.statBonus.fov;
    this.addLog(`You have become the ${adv.name}!`);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  private writeSave(): void {
    if (this.state.mode !== 'classic') return;
    saveGame(this.state, this.state.biomeId, this.renderer.themeIndex);
    audio.save();
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
    if (state.mode === 'roguelite') {
      const goldDrop = Math.floor(state.depth / 2) + rng(1, 3) +
        (state.advancement === 'chief-bandit' ? 2 : 0);
      state.gold += goldDrop;
    }
    if (state.advancement === 'dragon-knight') {
      state.map[monster.y * state.mapWidth + monster.x] = Tile.LavaFloor;
    }
    if (state.advancement === 'priest' && Math.random() < 0.2) {
      state.player.stats!.hp = state.player.stats!.maxHp;
      this.addLog('You feel refreshed! (Priest: full heal)');
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
        this.renderer.renderStartMenu(this.saveMeta, this.menuSelection);
        break;
      case 'modeSelect':
        this.renderer.renderModeSelect(this.modeSelection);
        break;
      case 'classSelect':
        this.renderer.renderClassSelect(this.classIndex);
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
      case 'upgradeRoom':
        this.renderer.render(this.state);
        this.renderer.renderUpgradeRoom(this.upgradeRoomOpts, this.upgradeRoomSel, this.state.gold);
        break;
      case 'clanPrimer':
        this.renderer.render(this.state);
        this.renderer.renderClanPrimer(this.state.monsterBook, this.primerTab, this.primerScroll);
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
    if (this.state.invincibleUntilTurn > this.state.turn) return;
    const tile = this.tileAt(this.state.player.x, this.state.player.y);
    const s    = this.state.player.stats!;
    if (tile === Tile.LavaFloor) {
      s.hp -= 3;
      audio.lava();
      this.addLog('The lava sears your flesh! (-3 HP)');
    } else if (tile === Tile.SlimePool) {
      s.hp -= 1;
      audio.slime();
      this.addLog('The slime burns! (-1 HP)');
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

      // Hero: 20% chance to ignore monster defense
      const origDef = target.stats!.defense;
      if (this.state.advancement === 'hero' && Math.random() < 0.2) {
        target.stats!.defense = 0;
      }
      // Sniper: 25% chance to double attack
      const origAtk = player.stats!.attack;
      if (this.state.advancement === 'sniper' && Math.random() < 0.25) {
        player.stats!.attack *= 2;
      }

      this.addLog(attackEntity(player, target));
      target.stats!.defense = origDef;
      player.stats!.attack  = origAtk;

      if (!target.alive) {
        audio.kill();
        const idx = entities.indexOf(target);
        if (idx !== -1) entities.splice(idx, 1);
        this.handleKill(target);
      }

      // Bowmaster: also hit nearest other visible monster
      if (this.state.advancement === 'bowmaster') {
        const vis = this.state.visible;
        const mw  = this.state.mapWidth;
        const second = entities
          .filter(e => e.type === EntityType.Monster && e.alive && vis[e.y * mw + e.x] && e !== target)
          .sort((a, b) =>
            (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) -
            (Math.abs(b.x - player.x) + Math.abs(b.y - player.y))
          )[0];
        if (second) {
          this.addLog(attackEntity(player, second));
          if (!second.alive) {
            audio.kill();
            const i2 = entities.indexOf(second);
            if (i2 !== -1) entities.splice(i2, 1);
            this.handleKill(second);
          }
        }
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
    const msg = useItem(player, item.itemKind!, this.state);
    item.alive = false;
    this.addLog(`You pick up the ${item.name}. ${msg}`);
    this.endTurn();
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
      const cls         = getClass(this.state.classId);
      const sniperBonus = this.state.advancement === 'sniper' ? 5 : 0;
      this.state.fovRadius      = BASE_FOV + cls.fovBonus + sniperBonus;
      this.state.lanternExpiresAt = 0;
      this.addLog('The lantern dims.');
    }

    // Night Lord: free throwing star each turn
    if (this.state.advancement === 'night-lord') {
      const { entities, visible, mapWidth, player } = this.state;
      const nearest = entities
        .filter(e => e.type === EntityType.Monster && e.alive && visible[e.y * mapWidth + e.x])
        .sort((a, b) =>
          (Math.abs(a.x - player.x) + Math.abs(a.y - player.y)) -
          (Math.abs(b.x - player.x) + Math.abs(b.y - player.y))
        )[0];
      if (nearest) {
        nearest.stats!.hp -= 3;
        if (nearest.stats!.hp <= 0) {
          nearest.alive = false;
          const idx = entities.indexOf(nearest);
          if (idx !== -1) entities.splice(idx, 1);
          this.handleKill(nearest);
          this.addLog(`Throwing star kills the ${nearest.name}!`);
        }
      }
    }

    this.runMonsters();
    if (this.checkDeath()) return;
    if (this.state.mode === 'classic' && this.state.turn % SAVE_INTERVAL === 0) this.writeSave();
    this.updateFOV();
    this.checkNewSightings();
    this.render();
  }

  private checkDeath(): boolean {
    if (this.state.player.alive && this.state.player.stats!.hp > 0) return false;
    this.state.player.alive = false;
    this.screen = 'over';
    this.won = false;
    if (this.state.mode === 'roguelite') {
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
          if (e.key === 'Enter' || e.key === ' ') {
            this.stopAnimLoop();
            if (this.saveMeta && this.menuSelection === 0) {
              this.loadSavedGame();
            } else {
              deleteSave();
              this.showModeSelect();
            }
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
          break;

        case 'modeSelect':
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            this.modeSelection = this.modeSelection === 0 ? 1 : 0;
          } else if (e.key === 'Enter' || e.key === ' ') {
            this.mode = this.modeSelection === 0 ? 'classic' : 'roguelite';
            this.stopAnimLoop();
            if (this.mode === 'roguelite') {
              this.showLobby();
            } else {
              this.showClassSelect();
            }
          } else if (e.key === 'Escape') {
            this.stopAnimLoop();
            this.showMenu();
          }
          e.preventDefault();
          break;

        case 'classSelect':
          if (e.key === 'ArrowLeft') {
            this.classIndex = (this.classIndex - 1 + CLASSES.length) % CLASSES.length;
          } else if (e.key === 'ArrowRight') {
            this.classIndex = (this.classIndex + 1) % CLASSES.length;
          } else if (e.key === 'Enter' || e.key === ' ') {
            this.startGame(CLASSES[this.classIndex]);
          } else if (e.key === 'Escape') {
            this.stopAnimLoop();
            if (this.mode === 'roguelite') {
              this.showLobby();
            } else {
              this.showMenu();
            }
          }
          e.preventDefault();
          break;

        case 'lobby': {
          const meta = loadMeta();
          const upgradeKeys = ['vitality', 'strength', 'fortitude'] as const;
          const numOpts = upgradeKeys.length + 1;
          if (e.key === 'ArrowUp') {
            this.lobbySelection = (this.lobbySelection - 1 + numOpts) % numOpts;
          } else if (e.key === 'ArrowDown') {
            this.lobbySelection = (this.lobbySelection + 1) % numOpts;
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (this.lobbySelection < upgradeKeys.length) {
              const kind = upgradeKeys[this.lobbySelection];
              const cost = nextUpgradeCost(kind, meta.upgrades[kind]);
              if (cost !== null && meta.gold >= cost) {
                meta.gold -= cost;
                meta.upgrades[kind]++;
                saveMeta(meta);
              }
            } else {
              this.stopAnimLoop();
              this.showClassSelect();
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
              if (this.state.mode === 'classic') this.writeSave();
              this.showMenu();
            }
          }
          e.preventDefault();
          break;

        case 'upgradeRoom':
          if (e.key === 'ArrowUp') {
            this.upgradeRoomSel = (this.upgradeRoomSel - 1 + this.upgradeRoomOpts.length) % this.upgradeRoomOpts.length;
            this.render();
          } else if (e.key === 'ArrowDown') {
            this.upgradeRoomSel = (this.upgradeRoomSel + 1) % this.upgradeRoomOpts.length;
            this.render();
          } else if (e.key === 'Enter' || e.key === ' ') {
            const opt = this.upgradeRoomOpts[this.upgradeRoomSel];
            if (!opt.disabled) {
              if (opt.action === 'advance-a' || opt.action === 'advance-b') {
                const path = opt.action === 'advance-a' ? 'A' : 'B';
                const adv  = getAdvancements(this.state.classId).find(a => a.path === path);
                if (adv) this.applyAdvancement(adv.id);
              } else if (opt.action === 'weapon') {
                if (this.state.weaponTier < 3) {
                  this.state.weaponTier++;
                  this.state.player.stats!.attack += 4;
                  const name = getClass(this.state.classId).weaponNames[this.state.weaponTier];
                  this.addLog(`Weapon upgraded to ${name}! (+4 ATK)`);
                }
              } else if (opt.action === 'rest') {
                const s   = this.state.player.stats!;
                const heal = Math.floor(s.maxHp * 0.4);
                s.hp = Math.min(s.hp + heal, s.maxHp);
                this.addLog(`You rest and recover ${heal} HP.`);
              }
            }
            this.executeDescend(this.pendingDepth);
          } else if (e.key === 'Escape') {
            this.executeDescend(this.pendingDepth);
          }
          e.preventDefault();
          break;

        case 'clanPrimer':
          if (e.key === 'Escape' || e.key === 'q' || e.key === 'Q') {
            this.closeClanPrimer();
          } else if (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            this.primerTab    = this.primerTab === 'book' ? 'hunts' : 'book';
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

        case 'over':
          if (e.key === 'r' || e.key === 'R') {
            if (this.mode === 'roguelite') {
              this.showLobby();
            } else {
              this.showClassSelect();
            }
          }
          break;
      }
    });
  }
}
