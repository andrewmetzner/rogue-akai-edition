import { type GameState, type MonsterBookEntry, Tile, EntityType, ItemKind } from './types';
import { playerLevel } from './combat';
import { THEMES, type Theme } from './themes';
import { getBiome } from './biomes';
import { type SaveMeta } from './save';
import { CLASSES, getClass } from './classes';
import {
  type MetaState,
  META_UPGRADE_LABELS,
  nextUpgradeCost,
} from './meta';

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

    for (const e of entities) {
      if (e.type !== EntityType.Monster || !e.alive) continue;
      const idx = e.y * mapWidth + e.x;
      if (!visible[idx]) continue;
      const vx = e.x - camX;
      const vy = e.y - camY;
      if (vx < 0 || vx >= VIEW_COLS || vy < 0 || vy >= VIEW_ROWS) continue;
      ctx.fillStyle = e.frozenTurns && e.frozenTurns > 0 ? '#44aaff' : e.color;
      ctx.fillText(e.glyph, vx * CELL_W, vy * CELL_H);
    }

    const playerColor = state.frozenTurns > 0 ? '#44aaff' : t.player;
    ctx.fillStyle = playerColor;
    ctx.fillText(player.glyph, (player.x - camX) * CELL_W, (player.y - camY) * CELL_H);

    this.renderHUD(state);
  }

  renderHUD(state: GameState): void {
    const t = this.theme;
    const s = state.player.stats!;
    const level   = playerLevel(s.xp);
    const biome   = getBiome(state.depth);
    const hpPct   = s.hp / s.maxHp;
    const hpColor = hpPct > 0.5 ? '#44ff44' : hpPct > 0.25 ? '#ffaa44' : '#ff4444';
    const hpBar   = makeBar(s.hp, s.maxHp, 10);

    const frozenTag = state.frozenTurns > 0
      ? ` <span style="color:#44aaff">[FROZEN ${state.frozenTurns}]</span>` : '';
    const starTag = state.invincibleUntilTurn > state.turn
      ? ` <span style="color:#ff0">[★ STAR ${state.invincibleUntilTurn - state.turn}]</span>` : '';
    const lanternTag = state.lanternExpiresAt > state.turn
      ? ` <span style="color:#ff8">[LANTERN ${state.lanternExpiresAt - state.turn}]</span>` : '';

    const weaponName = getClass(state.classId).weaponNames[state.weaponTier];
    const goldOrXp   = state.mode === 'roguelite'
      ? `  <span style="color:#ff8">${state.gold}g</span>`
      : `  <span style="color:${t.ui}">XP ${s.xp}</span>`;

    const advTag = state.advancement
      ? `  <span style="color:${t.uiDim}">[${state.advancement}]</span>` : '';

    const left  = document.getElementById('hud-left')!;
    const right = document.getElementById('hud-right')!;
    left.innerHTML =
      `<span style="color:${hpColor}">HP ${s.hp}/${s.maxHp} ${hpBar}</span>` +
      `  <span style="color:${t.ui}">ATK ${s.attack}  DEF ${s.defense}</span>` +
      frozenTag + starTag + lanternTag;
    right.innerHTML =
      `<span style="color:${t.uiDim}">${weaponName}</span>` + advTag + goldOrXp +
      `  <span style="color:${t.ui}">LVL ${level}</span>` +
      `  <span style="color:${biome.palette.stairsVis}">${biome.name} B${state.depth}</span>` +
      `  <span style="color:${t.ui}">T${state.turn}</span>`;
  }

  renderGameOver(won: boolean, state?: GameState): void {
    const t   = this.theme;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.textAlign = 'center';
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;

    ctx.font = '36px monospace';
    ctx.fillStyle = won ? t.accent : '#ff4444';
    ctx.fillText(won ? 'YOU WIN!' : 'YOU DIED', cx, cy - 48);

    if (state) {
      const s = state.player.stats!;
      ctx.font = '14px monospace';
      ctx.fillStyle = t.ui;
      ctx.fillText(
        `Depth ${state.depth}  •  Turn ${state.turn}  •  Level ${playerLevel(s.xp)}`,
        cx, cy - 8,
      );
      if (state.mode === 'roguelite') {
        ctx.font = '13px monospace';
        ctx.fillStyle = '#ff8';
        ctx.fillText(`Gold earned this run: ${state.gold}g`, cx, cy + 14);
      }
    }

    ctx.font = '16px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('Press R to restart', cx, cy + 40);
    ctx.textAlign = 'left';
  }

  renderStartMenu(saveMeta: SaveMeta | null, menuSelection: number): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const cx  = W / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, this.canvas.height);
    ctx.textAlign = 'center';

    // Title
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('ROGUE - Akai Edition', cx, 46);

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('(UnluckyLisp production)', cx, 70);

    const border = '\u2500'.repeat(52);
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, 94);

    // Controls
    const controls: [string, string][] = [
      ['Move',              'WASD / Arrow Keys / Numpad'],
      ['Diagonal Move',     'Y U B N'],
      ['Wait a turn',       '. or Numpad 5'],
      ['Pick up item',      'G'],
      ['Descend stairs',    '> (stand on > first)'],
      ['Pause / Menu',      'ESC'],
      ['Restart',           'R  (after death)'],
    ];

    ctx.textAlign = 'left';
    const leftX  = cx - 205;
    const rightX = cx - 5;
    let y = 118;

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
    y += 18;
    ctx.fillStyle = t.uiDim;
    ctx.font = '11px monospace';
    ctx.fillText('@ you   monsters: r g o T D w Y E I s j S e d F Z   items: ! / ) [', cx, y);
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

    // Save slot — simplified: no "SAVE FILE FOUND" header
    if (saveMeta) {
      ctx.fillStyle = t.border;
      ctx.font = '12px monospace';
      ctx.fillText(border, cx, y);
      y += 20;

      const options = ['Continue', 'New Game'];
      options.forEach((label, i) => {
        const selected = i === menuSelection;
        ctx.font = `${selected ? 'bold ' : ''}15px monospace`;
        ctx.fillStyle = selected ? t.prompt : t.uiDim;
        ctx.fillText((selected ? '▶ ' : '  ') + label, cx, y);
        y += 22;
      });
    } else {
      y += 8;
      ctx.font = 'bold 16px monospace';
      ctx.fillStyle = t.prompt;
      if (Math.floor(Date.now() / 600) % 2 === 0) {
        ctx.fillText('[ Press ENTER or SPACE to begin ]', cx, y);
      }
    }

    ctx.textAlign = 'left';
  }

  // ── Mode Select ──────────────────────────────────────────────────────────

  renderModeSelect(selection: number): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('SELECT MODE', cx, 40);

    ctx.font = '12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('← → to choose   ENTER to confirm   ESC back', cx, 64);

    const cardW = 260;
    const cardH = 200;
    const gap   = 24;
    const totalW = cardW * 2 + gap;
    const startX = cx - totalW / 2;
    const cardY  = 100;

    const modes = [
      {
        label: 'CLASSIC',
        color: '#4af',
        lines: [
          'Permadeath. One save slot.',
          'Auto-saves on stairs.',
          'Die and it\'s gone.',
          '',
          'Pure roguelike.',
        ],
      },
      {
        label: 'ROGUELITE',
        color: '#fa4',
        lines: [
          'Gold carries over.',
          'Meta upgrades persist.',
          'Job advancement every',
          '7 floors.',
          '',
          'Progress survives death.',
        ],
      },
    ];

    modes.forEach((m, i) => {
      const cx2 = startX + i * (cardW + gap);
      const isSel = i === selection;

      ctx.fillStyle = isSel ? m.color + '22' : t.bg;
      ctx.fillRect(cx2, cardY, cardW, cardH);
      ctx.strokeStyle = isSel ? m.color : t.border;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(cx2, cardY, cardW, cardH);

      ctx.textAlign = 'center';
      ctx.font = `bold 18px monospace`;
      ctx.fillStyle = isSel ? m.color : t.uiDim;
      ctx.fillText(m.label, cx2 + cardW / 2, cardY + 20);

      ctx.font = '12px monospace';
      ctx.fillStyle = isSel ? t.ui : t.uiDim;
      m.lines.forEach((line, li) => {
        ctx.fillText(line, cx2 + cardW / 2, cardY + 50 + li * 18);
      });
    });

    const promptY = cardY + cardH + 32;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = t.prompt;
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillText(`[ ${modes[selection].label} — Press ENTER ]`, cx, promptY);
    }
    ctx.textAlign = 'left';
  }

  // ── Class Select ─────────────────────────────────────────────────────────

  renderClassSelect(classIndex: number): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;
    const cls = CLASSES[classIndex];

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('CHOOSE YOUR CLASS', cx, 32);

    ctx.font = '12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('← → to browse   ENTER to begin   ESC back', cx, 58);

    // Tabs
    const tabW = 140;
    const tabH = 30;
    const tabGap = 8;
    const totalTabW = CLASSES.length * (tabW + tabGap) - tabGap;
    let tx = cx - totalTabW / 2;
    const tabY = 78;

    for (let i = 0; i < CLASSES.length; i++) {
      const c     = CLASSES[i];
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

    // Detail card
    const cardX = cx - 280;
    const cardY  = tabY + tabH + 18;
    const cardW  = 560;
    const cardH  = 330;

    ctx.fillStyle = cls.color + '11';
    ctx.fillRect(cardX, cardY, cardW, cardH);
    ctx.strokeStyle = cls.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(cardX, cardY, cardW, cardH);

    ctx.font = 'bold 72px monospace';
    ctx.fillStyle = cls.color + 'aa';
    ctx.textAlign = 'center';
    ctx.fillText(cls.icon, cardX + 80, cardY + 20);

    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = cls.color;
    ctx.textAlign = 'left';
    ctx.fillText(cls.name, cardX + 150, cardY + 24);

    ctx.font = '13px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText(cls.tagline, cardX + 150, cardY + 46);

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

    // Stats block
    const statsY = cardY + 140;
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('STATS', cardX + 20, statsY);

    const swordCount  = cls.gearItems.filter(k => k === ItemKind.Sword).length;
    const shieldCount = cls.gearItems.filter(k => k === ItemKind.Shield).length;
    const stats: [string, number | string][] = [
      ['HP',     cls.hp],
      ['ATK',    cls.attack + swordCount * 3],
      ['DEF',    cls.defense + shieldCount * 2],
      ['FOV',    `${9 + cls.fovBonus} tiles${cls.fovBonus > 0 ? ` (+${cls.fovBonus})` : ''}`],
    ];
    ctx.font = '12px monospace';
    stats.forEach(([label, val], i) => {
      ctx.fillStyle = t.uiDim;
      ctx.fillText(label, cardX + 20, statsY + 18 + i * 18);
      ctx.fillStyle = cls.color;
      ctx.fillText(String(val), cardX + 70, statsY + 18 + i * 18);
    });

    const barX  = cardX + 120;
    const maxStat = { HP: 50, ATK: 15, DEF: 8 };
    (['HP', 'ATK', 'DEF'] as const).forEach((key, i) => {
      const rawVal = key === 'HP' ? cls.hp : key === 'ATK' ? cls.attack : cls.defense;
      const pct = rawVal / maxStat[key];
      const bW  = 160;
      ctx.fillStyle = t.border;
      ctx.fillRect(barX, statsY + 21 + i * 18, bW, 8);
      ctx.fillStyle = cls.color;
      ctx.fillRect(barX, statsY + 21 + i * 18, Math.round(bW * pct), 8);
    });

    // Weapon name
    ctx.font = '12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('Weapon', cardX + 20, statsY + 18 + 4 * 18);
    ctx.fillStyle = cls.color;
    ctx.fillText(cls.weaponNames[0], cardX + 70, statsY + 18 + 4 * 18);

    // Starting gear
    const gearY = statsY;
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.textAlign = 'right';
    ctx.fillText('STARTING GEAR', cardX + cardW - 20, gearY);

    const itemNames: Record<number, string> = {
      [ItemKind.HealthPotion]:    '! Health Potion',
      [ItemKind.ScrollLightning]: '/ Lightning Scroll',
      [ItemKind.Sword]:           ') Sword (+3 ATK)',
      [ItemKind.Shield]:          '[ Shield (+2 DEF)',
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

    const promptY = cardY + cardH + 22;
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = t.prompt;
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillText(`[ Press ENTER to play as ${cls.name} ]`, cx, promptY);
    }
    ctx.textAlign = 'left';
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────

  renderLobby(meta: MetaState, selection: number): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('THE LOBBY', cx, 40);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#ff8';
    ctx.fillText(`Gold: ${meta.gold}g`, cx, 66);

    const border = '\u2500'.repeat(48);
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, 90);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('META UPGRADES', cx, 108);

    const upgradeKeys = ['vitality', 'strength', 'fortitude'] as const;
    const rows = upgradeKeys.map(k => {
      const level = meta.upgrades[k];
      const cost  = nextUpgradeCost(k, level);
      return { label: META_UPGRADE_LABELS[k], level, cost };
    });

    rows.forEach((row, i) => {
      const y       = 134 + i * 32;
      const isSel   = i === selection;
      const maxed   = row.cost === null;

      if (isSel) {
        ctx.fillStyle = t.accent + '22';
        ctx.fillRect(cx - 240, y - 12, 480, 26);
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 240, y - 12, 480, 26);
      }

      ctx.textAlign = 'left';
      ctx.font = `${isSel ? 'bold ' : ''}13px monospace`;
      ctx.fillStyle = maxed ? t.uiDim : (isSel ? t.prompt : t.ui);
      ctx.fillText((isSel ? '▶ ' : '  ') + row.label, cx - 230, y);

      ctx.textAlign = 'right';
      ctx.fillStyle = t.uiDim;
      ctx.fillText(`[Lv ${row.level}/5]`, cx + 10, y);

      if (maxed) {
        ctx.fillStyle = t.uiDim;
        ctx.fillText('[MAX]', cx + 240, y);
      } else {
        const canAfford = meta.gold >= (row.cost ?? 0);
        ctx.fillStyle = canAfford ? '#ff8' : '#a44';
        ctx.fillText(`Next: ${row.cost}g`, cx + 240, y);
      }
      ctx.textAlign = 'center';
    });

    // Divider
    const divY = 134 + rows.length * 32 + 8;
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, divY);

    // Descend option
    const descY   = divY + 24;
    const descSel = selection === upgradeKeys.length;
    if (descSel) {
      ctx.fillStyle = t.accent + '22';
      ctx.fillRect(cx - 240, descY - 12, 480, 26);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 240, descY - 12, 480, 26);
    }
    ctx.textAlign = 'center';
    ctx.font = `${descSel ? 'bold ' : ''}14px monospace`;
    ctx.fillStyle = descSel ? t.prompt : t.ui;
    ctx.fillText((descSel ? '▶ ' : '  ') + 'Descend into the dungeon', cx, descY);

    ctx.fillStyle = t.border;
    ctx.fillText(border, cx, descY + 20);

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('↑ ↓ navigate   ENTER buy / start   ESC main menu', cx, descY + 38);

    ctx.textAlign = 'left';
  }

  // ── Upgrade Room ─────────────────────────────────────────────────────────

  renderUpgradeRoom(opts: { label: string; desc: string; cost: number; disabled: boolean }[], selection: number, gold: number): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;
    const cy  = H / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.80)';
    ctx.fillRect(0, 0, W, H);

    const boxW = 520;
    const boxH = 60 + opts.length * 48 + 50;
    const bx   = cx - boxW / 2;
    const by   = cy - boxH / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('UPGRADE ROOM', cx, by + 24);

    ctx.font = '12px monospace';
    ctx.fillStyle = t.border;
    ctx.fillText('\u2500'.repeat(44), cx, by + 42);

    opts.forEach((opt, i) => {
      const oy    = by + 62 + i * 48;
      const isSel = i === selection;

      if (isSel) {
        ctx.fillStyle = t.accent + '22';
        ctx.fillRect(bx + 16, oy - 10, boxW - 32, 38);
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 16, oy - 10, boxW - 32, 38);
      }

      const labelColor = opt.disabled ? t.uiDim : (isSel ? t.prompt : t.ui);
      const costLabel  = opt.cost > 0 ? `[${opt.cost}g]` : '[FREE]';
      const costColor  = opt.disabled ? t.uiDim : (opt.cost > 0 && opt.cost > gold ? '#a44' : '#ff8');

      ctx.textAlign = 'left';
      ctx.font = `${isSel ? 'bold ' : ''}13px monospace`;
      ctx.fillStyle = labelColor;
      ctx.fillText((isSel ? '▶ ' : '  ') + opt.label, bx + 24, oy);

      ctx.textAlign = 'right';
      ctx.font = '12px monospace';
      ctx.fillStyle = costColor;
      ctx.fillText(costLabel, bx + boxW - 24, oy);

      ctx.textAlign = 'left';
      ctx.font = '11px monospace';
      ctx.fillStyle = t.uiDim;
      ctx.fillText('  ' + opt.desc, bx + 24, oy + 16);
    });

    const footY = by + boxH - 20;
    ctx.textAlign = 'center';
    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText(`Gold: ${gold}g    ↑↓ navigate   ENTER confirm   ESC skip`, cx, footY);
    ctx.textAlign = 'left';
  }

  // ── Pause menu ────────────────────────────────────────────────────────────

  renderPauseMenu(selection: number, mode: 'classic' | 'roguelite'): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;
    const cy  = H / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, W, H);

    const boxW = 300;
    const boxH = 210;
    const bx   = cx - boxW / 2;
    const by   = cy - boxH / 2;

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

    const quitLabel = mode === 'roguelite' ? 'Return to Menu' : 'Save & Quit';
    const options   = ['Resume', 'Clan Primer', quitLabel];
    options.forEach((label, i) => {
      const isSel = i === selection;
      const oy    = by + 72 + i * 36;
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

  // ── Clan Primer ───────────────────────────────────────────────────────────

  renderClanPrimer(
    monsterBook: Record<string, MonsterBookEntry>,
    tab: 'book' | 'hunts',
    scroll: number,
  ): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, W, H);

    const boxW = 560;
    const boxH = 480;
    const bx   = cx - boxW / 2;
    const by   = 40;

    ctx.fillStyle = t.bg;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, boxW, boxH);

    // Tabs
    const tabs: [string, 'book' | 'hunts'][] = [['Monster Book', 'book'], ['Hunts', 'hunts']];
    const tabW = 140;
    tabs.forEach(([label, id], i) => {
      const tx    = bx + 20 + i * (tabW + 8);
      const isSel = tab === id;
      ctx.fillStyle = isSel ? t.accent + '33' : t.bg;
      ctx.fillRect(tx, by + 8, tabW, 28);
      ctx.strokeStyle = isSel ? t.accent : t.border;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(tx, by + 8, tabW, 28);
      ctx.textAlign = 'center';
      ctx.font = `${isSel ? 'bold ' : ''}12px monospace`;
      ctx.fillStyle = isSel ? t.accent : t.uiDim;
      ctx.fillText(label, tx + tabW / 2, by + 16);
    });

    ctx.textAlign = 'left';

    const contentY = by + 48;
    ctx.fillStyle = t.border;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('\u2500'.repeat(46), cx, contentY);
    ctx.textAlign = 'left';

    if (tab === 'book') {
      const entries = Object.values(monsterBook).sort((a, b) => b.killed - a.killed);
      const rowH   = 22;
      const visibleRows = Math.floor((boxH - 80) / rowH);
      const maxScroll   = Math.max(0, entries.length - visibleRows);
      const clampedScroll = Math.min(scroll, maxScroll);

      if (entries.length === 0) {
        ctx.font = '13px monospace';
        ctx.fillStyle = t.uiDim;
        ctx.textAlign = 'center';
        ctx.fillText('No monsters encountered yet.', cx, contentY + 30);
        ctx.textAlign = 'left';
      } else {
        // Header
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = t.uiDim;
        ctx.fillText('  Monster', bx + 24, contentY + 12);
        ctx.textAlign = 'right';
        ctx.fillText('Seen', bx + boxW - 140, contentY + 12);
        ctx.fillText('Killed', bx + boxW - 24, contentY + 12);
        ctx.textAlign = 'left';

        const slice = entries.slice(clampedScroll, clampedScroll + visibleRows);
        slice.forEach((entry, i) => {
          const ey = contentY + 28 + i * rowH;
          ctx.font = '12px monospace';
          ctx.fillStyle = t.ui;
          ctx.fillText('  ' + entry.name, bx + 24, ey);
          ctx.textAlign = 'right';
          ctx.fillStyle = t.uiDim;
          ctx.fillText(String(entry.encountered), bx + boxW - 140, ey);
          ctx.fillStyle = entry.killed > 0 ? '#f44' : t.uiDim;
          ctx.fillText(String(entry.killed), bx + boxW - 24, ey);
          ctx.textAlign = 'left';
        });

        if (entries.length > visibleRows) {
          ctx.font = '11px monospace';
          ctx.fillStyle = t.uiDim;
          ctx.textAlign = 'center';
          ctx.fillText(`↑ ↓ scroll  (${clampedScroll + 1}–${clampedScroll + slice.length} of ${entries.length})`, cx, by + boxH - 28);
          ctx.textAlign = 'left';
        }
      }
    } else {
      // Hunts stub
      ctx.font = '13px monospace';
      ctx.fillStyle = t.uiDim;
      ctx.textAlign = 'center';
      ctx.fillText('No active hunts.', cx, contentY + 30);
      ctx.fillText('(Quests coming soon)', cx, contentY + 52);
      ctx.textAlign = 'left';
    }

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.textAlign = 'center';
    ctx.fillText('← → or TAB switch tabs   ESC close', cx, by + boxH - 14);
    ctx.textAlign = 'left';
  }

  private drawThemeSelector(ctx: CanvasRenderingContext2D, cx: number, y: number): void {
    const swatchW = 72;
    const swatchH = 26;
    const gap     = 6;
    const totalW  = THEMES.length * (swatchW + gap) - gap;
    let sx = cx - totalW / 2;

    for (let i = 0; i < THEMES.length; i++) {
      const th         = THEMES[i];
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
