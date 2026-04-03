import { type GameState, Tile, EntityType } from './types';
import { playerLevel } from './combat';
import { THEMES, type Theme } from './themes';
import { getBiome } from './biomes';
import { type SaveMeta } from './save';
import { CLASSES } from './classes';

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

  // ── Class Select ─────────────────────────────────────────────────────────

  renderClassSelect(classIndex: number): void {
    const t = this.theme;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cls = CLASSES[classIndex];

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    // Title
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('CHOOSE YOUR CLASS', cx, 32);

    ctx.font = '12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('← → to browse   ENTER to begin', cx, 58);

    // Class tabs row
    const tabW = 120;
    const tabH = 30;
    const tabGap = 8;
    const totalTabW = CLASSES.length * (tabW + tabGap) - tabGap;
    let tx = cx - totalTabW / 2;
    const tabY = 78;

    for (let i = 0; i < CLASSES.length; i++) {
      const c = CLASSES[i];
      const isSel = i === classIndex;
      ctx.fillStyle = isSel ? c.color + '33' : t.bg;
      ctx.fillRect(tx, tabY, tabW, tabH);
      ctx.strokeStyle = isSel ? c.color : t.border;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(tx, tabY, tabW, tabH);
      ctx.font = `${isSel ? 'bold ' : ''}12px monospace`;
      ctx.fillStyle = isSel ? c.color : t.uiDim;
      ctx.textAlign = 'center';
      ctx.fillText(c.name, tx + tabW / 2, tabY + 10);
      tx += tabW + tabGap;
    }

    // ── Detail card for selected class ────────────────────────────────────
    const cardX = cx - 280;
    const cardY = tabY + tabH + 18;
    const cardW = 560;
    const cardH = 330;

    // Card bg + border
    ctx.fillStyle = cls.color + '11';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = cls.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    // Big class icon
    ctx.font = 'bold 72px monospace';
    ctx.fillStyle = cls.color + 'aa';
    ctx.textAlign = 'center';
    ctx.fillText(cls.icon, cardX + 80, cardY + 20);

    // Class name + tagline
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = cls.color;
    ctx.textAlign = 'left';
    ctx.fillText(cls.name, cardX + 150, cardY + 24);

    ctx.font = '13px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText(cls.tagline, cardX + 150, cardY + 46);

    // Description (word-wrapped manually across ~50 chars)
    ctx.font = '12px monospace';
    ctx.fillStyle = t.ui;
    const words = cls.description.split(' ');
    let line = '';
    let dy = cardY + 72;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (test.length > 52) {
        ctx.fillText(line, cardX + 150, dy);
        line = word;
        dy += 16;
      } else {
        line = test;
      }
    }
    if (line) { ctx.fillText(line, cardX + 150, dy); dy += 16; }

    // ── Stats block ────────────────────────────────────────────────────────
    const statsY = cardY + 140;
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('STATS', cardX + 20, statsY);

    const stats: [string, number | string][] = [
      ['HP',      cls.hp],
      ['ATK',     cls.attack + (cls.gearItems.filter(k => k === 3 /* ItemKind.Sword */).length * 3)],
      ['DEF',     cls.defense + (cls.gearItems.filter(k => k === 2 /* ItemKind.Shield */).length * 2)],
      ['FOV',     `${9 + cls.fovBonus} tiles${cls.fovBonus > 0 ? ` (+${cls.fovBonus})` : ''}`],
    ];
    ctx.font = '12px monospace';
    stats.forEach(([label, val], i) => {
      ctx.fillStyle = t.uiDim;
      ctx.fillText(label, cardX + 20, statsY + 18 + i * 18);
      ctx.fillStyle = cls.color;
      ctx.fillText(String(val), cardX + 70, statsY + 18 + i * 18);
    });

    // Visual HP / ATK / DEF bars
    const barX = cardX + 120;
    const maxStat = { HP: 50, ATK: 15, DEF: 8 };
    [['HP', cls.hp, maxStat.HP], ['ATK', cls.attack, maxStat.ATK], ['DEF', cls.defense, maxStat.DEF]].forEach(([, val, max], i) => {
      const pct = (val as number) / (max as number);
      const bW = 160;
      ctx.fillStyle = t.border;
      ctx.fillRect(barX, statsY + 21 + i * 18, bW, 8);
      ctx.fillStyle = cls.color;
      ctx.fillRect(barX, statsY + 21 + i * 18, Math.round(bW * pct), 8);
    });

    // ── Starting gear ──────────────────────────────────────────────────────
    const gearY = statsY;
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.textAlign = 'right';
    ctx.fillText('STARTING GEAR', cardX + cardW - 20, gearY);

    const itemNames: Record<number, string> = {
      0: '! Health Potion',
      3: '/ Lightning Scroll',
      1: ') Sword (+3 ATK)',
      2: '[ Shield (+2 DEF)',
    };
    const allItems = [...cls.gearItems, ...cls.consumables];
    ctx.font = '12px monospace';
    if (allItems.length === 0) {
      ctx.fillStyle = t.uiDim;
      ctx.fillText('Nothing — just grit', cardX + cardW - 20, gearY + 18);
    } else {
      allItems.forEach((kind, i) => {
        ctx.fillStyle = cls.color;
        ctx.fillText(itemNames[kind] ?? `Item ${kind}`, cardX + cardW - 20, gearY + 18 + i * 18);
      });
    }

    ctx.textAlign = 'left';

    // ── Confirm prompt ────────────────────────────────────────────────────
    const promptY = cardY + cardH + 22;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = t.prompt;
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillText(`[ Press ENTER to play as ${cls.name} ]`, cx, promptY);
    }

    ctx.textAlign = 'left';
  }

  // ── Pause menu ────────────────────────────────────────────────────────────

  renderPauseMenu(selection: number): void {
    const t = this.theme;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = W / 2;
    const cy = H / 2;

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);

    // Box
    const boxW = 300;
    const boxH = 180;
    const bx = cx - boxW / 2;
    const by = cy - boxH / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.textAlign = 'center';

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('PAUSED', cx, by + 28);

    ctx.fillStyle = t.border;
    ctx.font = '12px monospace';
    ctx.fillText('\u2500'.repeat(24), cx, by + 46);

    const options = ['Resume', 'Save & Quit'];
    options.forEach((label, i) => {
      const isSel = i === selection;
      const oy = by + 72 + i * 36;
      if (isSel) {
        ctx.fillStyle = t.accent + '22';
        ctx.fillRect(bx + 20, oy - 14, boxW - 40, 26);
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 20, oy - 14, boxW - 40, 26);
      }
      ctx.font = `${isSel ? 'bold ' : ''}14px monospace`;
      ctx.fillStyle = isSel ? t.prompt : t.uiDim;
      ctx.fillText((isSel ? '▶ ' : '  ') + label, cx, oy);
    });

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('↑ ↓ navigate   ENTER select   ESC resume', cx, by + boxH - 16);

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
