import { type GameState, Tile, EntityType } from './types';
import { playerLevel } from './combat';
import { THEMES, type Theme } from './themes';
import { getBiome } from './biomes';
import { type SaveMeta } from './save';

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

  applyBodyBg(bgOverride?: string): void {
    document.body.style.background = bgOverride ?? this.theme.bg;
    document.body.style.color = this.theme.ui;
  }

  render(state: GameState): void {
    const t = this.theme;
    const biome = getBiome(state.depth);
    const p = biome.palette;
    const { map, mapWidth, visible, explored, entities, player } = state;

    const camX = Math.max(0, Math.min(player.x - Math.floor(VIEW_COLS / 2), mapWidth - VIEW_COLS));
    const camY = Math.max(0, Math.min(player.y - Math.floor(VIEW_ROWS / 2), state.mapHeight - VIEW_ROWS));

    const ctx = this.ctx;
    ctx.fillStyle = p.bg;
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
            glyph = '#';
            color = isVisible ? p.wallVis : p.wallSeen;
            break;
          case Tile.Floor:
            glyph = '.';
            color = isVisible ? p.floorVis : p.floorSeen;
            break;
          case Tile.StairsDown:
            glyph = '>';
            color = isVisible ? p.stairsVis : p.stairsSeen;
            break;
          case Tile.IceFloor:
            glyph = p.hazardGlyph || '\u00b0';
            color = isVisible ? p.hazardVis : p.hazardSeen;
            break;
          case Tile.SlimePool:
            glyph = p.hazardGlyph || '%';
            color = isVisible ? p.hazardVis : p.hazardSeen;
            break;
          case Tile.LavaFloor:
            // Lava flickers slightly using time
            glyph = p.hazardGlyph || '~';
            if (isVisible) {
              color = Math.floor(Date.now() / 250) % 2 === 0 ? p.hazardVis : '#ff8800';
            } else {
              color = p.hazardSeen;
            }
            break;
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

    // Player — frozen = blue tint, otherwise theme color
    const playerColor = state.frozenTurns > 0 ? '#44aaff' : t.player;
    ctx.fillStyle = playerColor;
    ctx.fillText(player.glyph, (player.x - camX) * CELL_W, (player.y - camY) * CELL_H);

    this.renderHUD(state);
  }

  renderHUD(state: GameState): void {
    const t = this.theme;
    const s = state.player.stats!;
    const level = playerLevel(s.xp);
    const biome = getBiome(state.depth);
    const hpPct = s.hp / s.maxHp;
    const hpColor = hpPct > 0.5 ? '#44ff44' : hpPct > 0.25 ? '#ffaa44' : '#ff4444';
    const hpBar = makeBar(s.hp, s.maxHp, 10);
    const frozenTag = state.frozenTurns > 0 ? ` <span style="color:#44aaff">[FROZEN ${state.frozenTurns}]</span>` : '';

    const left = document.getElementById('hud-left')!;
    const right = document.getElementById('hud-right')!;
    left.innerHTML =
      `<span style="color:${hpColor}">HP ${s.hp}/${s.maxHp} ${hpBar}</span>` +
      `  <span style="color:${t.ui}">ATK ${s.attack}  DEF ${s.defense}</span>` +
      frozenTag;
    right.innerHTML =
      `<span style="color:${t.ui}">LVL ${level}  XP ${s.xp}  </span>` +
      `<span style="color:${biome.palette.stairsVis}">${biome.name} B${state.depth}</span>` +
      `<span style="color:${t.ui}">  T${state.turn}</span>`;
  }

  renderGameOver(won: boolean, state?: GameState): void {
    const t = this.theme;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.textAlign = 'center';
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    ctx.font = '36px monospace';
    ctx.fillStyle = won ? t.accent : '#ff4444';
    ctx.fillText(won ? 'YOU WIN!' : 'YOU DIED', cx, cy - 40);

    if (state) {
      const s = state.player.stats!;
      ctx.font = '14px monospace';
      ctx.fillStyle = t.ui;
      ctx.fillText(
        `Depth ${state.depth}  •  Turn ${state.turn}  •  Level ${playerLevel(s.xp)}  •  XP ${s.xp}`,
        cx, cy
      );
    }

    ctx.font = '16px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('Press R to restart', cx, cy + 32);
    ctx.textAlign = 'left';
  }

  renderStartMenu(saveMeta: SaveMeta | null, menuSelection: number): void {
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

    const border = '\u2500'.repeat(52);
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, 128);

    // Controls
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
    let y = 156;

    ctx.fillStyle = t.uiDim;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Action', leftX, y);
    ctx.fillText('Key', rightX, y);
    y += 18;

    ctx.font = '12px monospace';
    for (const [action, key] of controls) {
      ctx.fillStyle = t.ui;
      ctx.fillText(action, leftX, y);
      ctx.fillStyle = t.accent;
      ctx.fillText(key, rightX, y);
      y += 17;
    }

    y += 6;
    ctx.textAlign = 'center';
    ctx.fillStyle = t.border;
    ctx.fillText(border, cx, y);

    // Legend
    y += 20;
    ctx.fillStyle = t.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('@ you   monsters: r g o T D Y I S Z F   items: ! / ) [', cx, y);
    y += 14;
    ctx.fillText('hazards: \u00b0 ice (slide)   % slime (-1HP/turn)   ~ lava (-3HP/turn)', cx, y);
    y += 14;
    ctx.fillText('14 floors across 4 biomes: Dungeon → Ice → Slime → Fire', cx, y);

    // Theme selector
    y += 22;
    ctx.fillStyle = t.uiDim;
    ctx.font = 'bold 11px monospace';
    ctx.fillText('STYLE  (← →)', cx, y);
    y += 16;
    this.drawThemeSelector(ctx, cx, y);
    y += 50;

    // ── Save slot ───────────────────────────────────────────────────────────
    if (saveMeta) {
      ctx.fillStyle = t.border;
      ctx.font = '12px monospace';
      ctx.fillText(border, cx, y);
      y += 18;

      ctx.font = 'bold 12px monospace';
      ctx.fillStyle = t.accent;
      ctx.fillText('SAVE FILE FOUND', cx, y);
      y += 16;

      ctx.font = '11px monospace';
      ctx.fillStyle = t.ui;
      ctx.fillText(
        `Depth ${saveMeta.depth}  •  Level ${saveMeta.playerLevel}  •  ` +
        `HP ${saveMeta.playerHp}/${saveMeta.playerMaxHp}  •  Turn ${saveMeta.turn}`,
        cx, y
      );
      y += 22;

      // Continue / New Game
      const options = ['Continue', 'New Game'];
      options.forEach((label, i) => {
        const selected = i === menuSelection;
        ctx.font = `${selected ? 'bold ' : ''}15px monospace`;
        ctx.fillStyle = selected ? t.prompt : t.uiDim;
        const prefix = selected ? '▶ ' : '  ';
        ctx.fillText(prefix + label, cx, y);
        y += 22;
      });
    } else {
      // No save — single prompt
      y += 8;
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = t.prompt;
      if (Math.floor(Date.now() / 600) % 2 === 0) {
        ctx.fillText('[ Press ENTER or SPACE to begin ]', cx, y);
      }
    }

    ctx.textAlign = 'left';
  }

  private drawThemeSelector(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
    const swatchW = 72;
    const swatchH = 26;
    const gap = 6;
    const totalW = THEMES.length * (swatchW + gap) - gap;
    let sx = cx - totalW / 2;

    for (let i = 0; i < THEMES.length; i++) {
      const th = THEMES[i];
      const isSelected = i === this.themeIndex;

      ctx.fillStyle = th.bg;
      ctx.fillRect(sx, y, swatchW, swatchH);
      ctx.strokeStyle = isSelected ? th.accent : th.border;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(sx, y, swatchW, swatchH);

      ctx.textAlign = 'center';
      ctx.font = `${isSelected ? 'bold ' : ''}10px monospace`;
      ctx.fillStyle = isSelected ? th.accent : th.uiDim;
      ctx.fillText(th.name, sx + swatchW / 2, y + 7);

      ctx.font = '10px monospace';
      ctx.fillStyle = th.player;
      ctx.fillText('@', sx + swatchW / 2 - 11, y + swatchH - 11);
      ctx.fillStyle = th.wallVis;
      ctx.fillText('#', sx + swatchW / 2, y + swatchH - 11);
      ctx.fillStyle = th.floorVis;
      ctx.fillText('.', sx + swatchW / 2 + 10, y + swatchH - 11);

      if (isSelected) {
        ctx.fillStyle = th.accent;
        ctx.font = '10px monospace';
        ctx.fillText('▲', sx + swatchW / 2, y + swatchH + 3);
      }

      sx += swatchW + gap;
    }
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
