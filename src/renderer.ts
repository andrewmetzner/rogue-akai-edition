import { type GameState, Tile, EntityType } from './types';
import { playerLevel } from './combat';

const CELL_W = 14;
const CELL_H = 20;
const FONT = `${CELL_H - 2}px monospace`;

// Color for tiles depending on visibility
const COLOR_WALL_VIS    = '#555';
const COLOR_WALL_SEEN   = '#222';
const COLOR_FLOOR_VIS   = '#333';
const COLOR_FLOOR_SEEN  = '#191919';
const COLOR_STAIRS_VIS  = '#ff8';
const COLOR_STAIRS_SEEN = '#554';

// viewport in tiles
const VIEW_COLS = 60;
const VIEW_ROWS = 30;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.canvas.width  = VIEW_COLS * CELL_W;
    this.canvas.height = VIEW_ROWS * CELL_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.textBaseline = 'top';
    this.ctx.font = FONT;
  }

  get viewCols() { return VIEW_COLS; }
  get viewRows() { return VIEW_ROWS; }

  render(state: GameState): void {
    const { map, mapWidth, visible, explored, entities, player } = state;

    // Camera: center on player, clamped to map
    const camX = Math.max(0, Math.min(player.x - Math.floor(VIEW_COLS / 2), mapWidth - VIEW_COLS));
    const camY = Math.max(0, Math.min(player.y - Math.floor(VIEW_ROWS / 2), state.mapHeight - VIEW_ROWS));

    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = FONT;
    ctx.textBaseline = 'top';

    // Draw tiles
    for (let vy = 0; vy < VIEW_ROWS; vy++) {
      for (let vx = 0; vx < VIEW_COLS; vx++) {
        const mx = camX + vx;
        const my = camY + vy;
        if (mx < 0 || mx >= mapWidth || my < 0 || my >= state.mapHeight) continue;

        const idx = my * mapWidth + mx;
        const isVisible  = visible[idx] === 1;
        const isExplored = explored[idx] === 1;

        if (!isExplored) continue;

        const tile = map[idx] as Tile;
        let glyph = '';
        let color = '';

        switch (tile) {
          case Tile.Wall:
            glyph = '#';
            color = isVisible ? COLOR_WALL_VIS : COLOR_WALL_SEEN;
            break;
          case Tile.Floor:
            glyph = '.';
            color = isVisible ? COLOR_FLOOR_VIS : COLOR_FLOOR_SEEN;
            break;
          case Tile.StairsDown:
            glyph = '>';
            color = isVisible ? COLOR_STAIRS_VIS : COLOR_STAIRS_SEEN;
            break;
        }

        ctx.fillStyle = color;
        ctx.fillText(glyph, vx * CELL_W, vy * CELL_H);
      }
    }

    // Draw items (dim if not visible)
    for (const e of entities) {
      if (e.type !== EntityType.Item || !e.alive) continue;
      const vx = e.x - camX;
      const vy = e.y - camY;
      if (vx < 0 || vx >= VIEW_COLS || vy < 0 || vy >= VIEW_ROWS) continue;
      const idx = e.y * mapWidth + e.x;
      if (!explored[idx]) continue;
      const isVis = visible[idx] === 1;
      ctx.fillStyle = isVis ? e.color : dimColor(e.color);
      ctx.fillText(e.glyph, vx * CELL_W, vy * CELL_H);
    }

    // Draw monsters (only when visible)
    for (const e of entities) {
      if (e.type !== EntityType.Monster || !e.alive) continue;
      const idx = e.y * mapWidth + e.x;
      if (!visible[idx]) continue;
      const vx = e.x - camX;
      const vy = e.y - camY;
      if (vx < 0 || vx >= VIEW_COLS || vy < 0 || vy >= VIEW_ROWS) continue;
      ctx.fillStyle = e.color;
      ctx.fillText(e.glyph, vx * CELL_W, vy * CELL_H);
    }

    // Draw player
    const pvx = player.x - camX;
    const pvy = player.y - camY;
    ctx.fillStyle = player.color;
    ctx.fillText(player.glyph, pvx * CELL_W, pvy * CELL_H);

    // HUD
    this.renderHUD(state);
  }

  renderHUD(state: GameState): void {
    const s = state.player.stats!;
    const level = playerLevel(s.xp);
    const hpPct = s.hp / s.maxHp;
    const hpColor = hpPct > 0.5 ? '#4f4' : hpPct > 0.25 ? '#fa4' : '#f44';
    const hpBar = makeBar(s.hp, s.maxHp, 10);

    const left = document.getElementById('hud-left')!;
    const right = document.getElementById('hud-right')!;
    left.innerHTML =
      `<span style="color:${hpColor}">HP ${s.hp}/${s.maxHp} ${hpBar}</span>` +
      `  ATK ${s.attack}  DEF ${s.defense}`;
    right.innerHTML =
      `LVL ${level}  XP ${s.xp}  ` +
      `<span style="color:#ff8">Depth ${state.depth}</span>  ` +
      `Turn ${state.turn}`;
  }

  renderGameOver(won: boolean): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = '36px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? '#ff8' : '#f44';
    ctx.fillText(won ? 'YOU WIN!' : 'YOU DIED', this.canvas.width / 2, this.canvas.height / 2 - 24);
    ctx.font = '16px monospace';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Press R to restart', this.canvas.width / 2, this.canvas.height / 2 + 20);
    ctx.textAlign = 'left';
  }

  renderStartMenu(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Title
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px monospace';
    ctx.fillStyle = '#ff8';
    ctx.fillText('ROGUE', cx, 60);

    ctx.font = '14px monospace';
    ctx.fillStyle = '#555';
    ctx.fillText('a dungeon crawl in ASCII', cx, 110);

    // Decorative border
    ctx.fillStyle = '#333';
    ctx.font = '13px monospace';
    const border = '#'.repeat(48);
    ctx.fillText(border, cx, 140);

    // Controls table
    const controls: [string, string][] = [
      ['Move',          'WASD / Arrow Keys / Numpad'],
      ['Diagonal Move', 'Y U B N  (vim style)'],
      ['Wait a turn',   '. or Numpad 5'],
      ['Pick up item',  'G'],
      ['Descend stairs','> (stand on > first)'],
      ['Restart',       'R  (after death)'],
    ];

    ctx.textAlign = 'left';
    const leftX  = cx - 200;
    const rightX = cx - 10;
    let y = 175;

    ctx.fillStyle = '#888';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('Action', leftX, y);
    ctx.fillText('Key', rightX, y);
    y += 22;

    ctx.font = '13px monospace';
    for (const [action, key] of controls) {
      ctx.fillStyle = '#aaa';
      ctx.fillText(action, leftX, y);
      ctx.fillStyle = '#ff8';
      ctx.fillText(key, rightX, y);
      y += 20;
    }

    y += 10;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#333';
    ctx.fillText(border, cx, y);

    // Legend
    y += 28;
    ctx.fillStyle = '#666';
    ctx.font = '13px monospace';
    ctx.fillText('Symbols:  @ = you   r g o T D = monsters   ! = potion   / = scroll   ) [ = gear', cx, y);

    y += 20;
    ctx.fillStyle = '#ff8';
    ctx.fillText('> = stairs down', cx, y);

    // Goal
    y += 30;
    ctx.fillStyle = '#aaa';
    ctx.font = '13px monospace';
    ctx.fillText('Descend 7 floors and return alive to win.', cx, y);

    // Prompt
    y += 50;
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#4f4';

    // Blink effect via time
    if (Math.floor(Date.now() / 600) % 2 === 0) {
      ctx.fillText('[ Press ENTER or SPACE to begin ]', cx, y);
    }

    ctx.textAlign = 'left';
  }
}

function makeBar(current: number, max: number, width: number): string {
  const filled = Math.round((current / max) * width);
  return '[' + '|'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

function dimColor(hex: string): string {
  // darken hex color for "seen but not visible" items
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 0xff) * 0.3);
  const g = Math.floor(((n >>  8) & 0xff) * 0.3);
  const b = Math.floor(( n        & 0xff) * 0.3);
  return `rgb(${r},${g},${b})`;
}
