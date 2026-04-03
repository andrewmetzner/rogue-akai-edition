import { type GameState, Tile, EntityType } from './types';
import { playerLevel } from './combat';
import { THEMES, type Theme } from './themes';

const CELL_W = 14;
const CELL_H = 20;
const FONT = `${CELL_H - 2}px monospace`;

const VIEW_COLS = 60;
const VIEW_ROWS = 30;

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  themeIndex = 0;

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.canvas.width  = VIEW_COLS * CELL_W;
    this.canvas.height = VIEW_ROWS * CELL_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.textBaseline = 'top';
    this.ctx.font = FONT;
  }

  get theme(): Theme { return THEMES[this.themeIndex]; }

  applyBodyBg(): void {
    document.body.style.background = this.theme.bg;
    document.body.style.color = this.theme.ui;
  }

  render(state: GameState): void {
    const t = this.theme;
    const { map, mapWidth, visible, explored, entities, player } = state;

    const camX = Math.max(0, Math.min(player.x - Math.floor(VIEW_COLS / 2), mapWidth - VIEW_COLS));
    const camY = Math.max(0, Math.min(player.y - Math.floor(VIEW_ROWS / 2), state.mapHeight - VIEW_ROWS));

    const ctx = this.ctx;
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = FONT;
    ctx.textBaseline = 'top';

    for (let vy = 0; vy < VIEW_ROWS; vy++) {
      for (let vx = 0; vx < VIEW_COLS; vx++) {
        const mx = camX + vx;
        const my = camY + vy;
        if (mx < 0 || mx >= mapWidth || my < 0 || my >= state.mapHeight) continue;

        const idx = my * mapWidth + mx;
        if (!explored[idx]) continue;
        const isVisible = visible[idx] === 1;
        const tile = map[idx] as Tile;

        let glyph = '';
        let color = '';
        switch (tile) {
          case Tile.Wall:
            glyph = '#'; color = isVisible ? t.wallVis : t.wallSeen; break;
          case Tile.Floor:
            glyph = '.'; color = isVisible ? t.floorVis : t.floorSeen; break;
          case Tile.StairsDown:
            glyph = '>'; color = isVisible ? t.stairsVis : t.stairsSeen; break;
        }

        ctx.fillStyle = color;
        ctx.fillText(glyph, vx * CELL_W, vy * CELL_H);
      }
    }

    // Items — dim when explored but not visible
    for (const e of entities) {
      if (e.type !== EntityType.Item || !e.alive) continue;
      const vx = e.x - camX;
      const vy = e.y - camY;
      if (vx < 0 || vx >= VIEW_COLS || vy < 0 || vy >= VIEW_ROWS) continue;
      const idx = e.y * mapWidth + e.x;
      if (!explored[idx]) continue;
      ctx.fillStyle = visible[idx] ? e.color : dimColor(e.color);
      ctx.fillText(e.glyph, vx * CELL_W, vy * CELL_H);
    }

    // Monsters — only when visible
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

    // Player
    ctx.fillStyle = t.player;
    ctx.fillText(player.glyph, (player.x - camX) * CELL_W, (player.y - camY) * CELL_H);

    this.renderHUD(state);
  }

  renderHUD(state: GameState): void {
    const t = this.theme;
    const s = state.player.stats!;
    const level = playerLevel(s.xp);
    const hpPct = s.hp / s.maxHp;
    const hpColor = hpPct > 0.5 ? '#44ff44' : hpPct > 0.25 ? '#ffaa44' : '#ff4444';
    const hpBar = makeBar(s.hp, s.maxHp, 10);

    const left = document.getElementById('hud-left')!;
    const right = document.getElementById('hud-right')!;
    left.innerHTML =
      `<span style="color:${hpColor}">HP ${s.hp}/${s.maxHp} ${hpBar}</span>` +
      `  <span style="color:${t.ui}">ATK ${s.attack}  DEF ${s.defense}</span>`;
    right.innerHTML =
      `<span style="color:${t.ui}">LVL ${level}  XP ${s.xp}  </span>` +
      `<span style="color:${t.accent}">Depth ${state.depth}</span>` +
      `<span style="color:${t.ui}">  Turn ${state.turn}</span>`;
  }

  renderGameOver(won: boolean): void {
    const t = this.theme;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = '36px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? t.accent : '#ff4444';
    ctx.fillText(won ? 'YOU WIN!' : 'YOU DIED', this.canvas.width / 2, this.canvas.height / 2 - 24);
    ctx.font = '16px monospace';
    ctx.fillStyle = t.ui;
    ctx.fillText('Press R to restart', this.canvas.width / 2, this.canvas.height / 2 + 20);
    ctx.textAlign = 'left';
  }

  renderStartMenu(): void {
    const t = this.theme;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    // Title
    ctx.font = 'bold 42px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('ROGUE', cx, 52);

    ctx.font = '14px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('a dungeon crawl in ASCII', cx, 102);

    // Border
    const border = '\u2500'.repeat(52); // ─────
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, 128);

    // Controls table
    const controls: [string, string][] = [
      ['Move',           'WASD / Arrow Keys / Numpad'],
      ['Diagonal Move',  'Y U B N'],
      ['Wait a turn',    '. or Numpad 5'],
      ['Pick up item',   'G'],
      ['Descend stairs', '> (stand on > first)'],
      ['Restart',        'R  (after death)'],
    ];

    ctx.textAlign = 'left';
    const leftX  = cx - 205;
    const rightX = cx - 5;
    let y = 160;

    ctx.fillStyle = t.uiDim;
    ctx.font = 'bold 13px monospace';
    ctx.fillText('Action', leftX, y);
    ctx.fillText('Key', rightX, y);
    y += 20;

    ctx.font = '13px monospace';
    for (const [action, key] of controls) {
      ctx.fillStyle = t.ui;
      ctx.fillText(action, leftX, y);
      ctx.fillStyle = t.accent;
      ctx.fillText(key, rightX, y);
      y += 19;
    }

    y += 8;
    ctx.textAlign = 'center';
    ctx.fillStyle = t.border;
    ctx.fillText(border, cx, y);

    // Symbol legend
    y += 24;
    ctx.fillStyle = t.uiDim;
    ctx.font = '12px monospace';
    ctx.fillText('@ you   r g o T D monsters   ! potion   / scroll   ) sword   [ shield   > stairs', cx, y);

    y += 18;
    ctx.fillStyle = t.uiDim;
    ctx.fillText('Descend 7 floors to win.', cx, y);

    // ── Theme selector ────────────────────────────────────────────────────
    y += 32;
    ctx.fillStyle = t.uiDim;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('STYLE', cx, y);

    y += 18;
    this.drawThemeSelector(ctx, cx, y);

    // ── Prompt ────────────────────────────────────────────────────────────
    y += 52;
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = t.prompt;
    if (Math.floor(Date.now() / 600) % 2 === 0) {
      ctx.fillText('[ Press ENTER or SPACE to begin ]', cx, y);
    }

    ctx.textAlign = 'left';
  }

  private drawThemeSelector(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
    // Draw all theme swatches in a row, highlight the active one
    const swatchW = 72;
    const swatchH = 28;
    const gap = 6;
    const totalW = THEMES.length * (swatchW + gap) - gap;
    let sx = cx - totalW / 2;

    for (let i = 0; i < THEMES.length; i++) {
      const th = THEMES[i];
      const isSelected = i === this.themeIndex;

      // Swatch background
      ctx.fillStyle = th.bg;
      ctx.fillRect(sx, y, swatchW, swatchH);

      // Border: bright accent if selected, dim otherwise
      ctx.strokeStyle = isSelected ? th.accent : th.border;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(sx, y, swatchW, swatchH);

      // Theme name in its own accent color
      ctx.textAlign = 'center';
      ctx.font = `${isSelected ? 'bold ' : ''}11px monospace`;
      ctx.fillStyle = isSelected ? th.accent : th.uiDim;
      ctx.fillText(th.name, sx + swatchW / 2, y + 9);

      // Mini glyph preview  @  #  .
      ctx.font = '11px monospace';
      ctx.fillStyle = th.player;
      ctx.fillText('@', sx + swatchW / 2 - 12, y + swatchH - 13);
      ctx.fillStyle = th.wallVis;
      ctx.fillText('#', sx + swatchW / 2, y + swatchH - 13);
      ctx.fillStyle = th.floorVis;
      ctx.fillText('.', sx + swatchW / 2 + 11, y + swatchH - 13);

      // Selection arrow below
      if (isSelected) {
        ctx.fillStyle = th.accent;
        ctx.font = '12px monospace';
        ctx.fillText('▲', sx + swatchW / 2, y + swatchH + 4);
      }

      sx += swatchW + gap;
    }

    // Navigation hint
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = THEMES[this.themeIndex].uiDim;
    ctx.fillText('← → to change style', cx, y + swatchH + 20);
  }
}

function makeBar(current: number, max: number, width: number): string {
  const filled = Math.round((current / max) * width);
  return '[' + '|'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

function dimColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.floor(((n >> 16) & 0xff) * 0.3);
  const g = Math.floor(((n >>  8) & 0xff) * 0.3);
  const b = Math.floor(( n        & 0xff) * 0.3);
  return `rgb(${r},${g},${b})`;
}
