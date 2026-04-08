import { type GameState, type MonsterBookEntry, Tile, EntityType } from './types';
import { type Discoveries } from './discoveries';
import { playerLevel } from './combat';
import { THEMES, type Theme } from './themes';
import { getBiome } from './biomes';
import { type SaveMeta } from './save';
import {
  type MetaState,
  META_UPGRADE_LABELS,
  nextUpgradeCost,
  SKIN_COSTS,
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

    const weaponName = state.equippedWeapon?.name ?? 'Unarmed';
    const goldOrXp   = state.mode === 'roguelike'
      ? `  <span style="color:#ff8">${state.gold}g</span>`
      : `  <span style="color:${t.ui}">XP ${s.xp}</span>`;

    const left  = document.getElementById('hud-left')!;
    const right = document.getElementById('hud-right')!;
    left.innerHTML =
      `<span style="color:${hpColor}">HP ${s.hp}/${s.maxHp} ${hpBar}</span>` +
      `  <span style="color:${t.ui}">ATK ${s.attack}  DEF ${s.defense}</span>` +
      frozenTag + starTag + lanternTag;
    right.innerHTML =
      `<span style="color:${t.uiDim}">${weaponName}</span>` + goldOrXp +
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
      if (state.mode === 'roguelike') {
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

  // ── Start Menu ────────────────────────────────────────────────────────────

  renderStartMenu(menuSelection: number, roguelikeSave: SaveMeta | null = null): void {
    const t   = this.theme;
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;
    const cx  = W / 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    // Title — give the subtitle breathing room below
    ctx.font = 'bold 36px monospace';
    ctx.fillStyle = t.accent;
    ctx.fillText('ROGUE - Akai Edition', cx, 46);

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('(UnluckyLisp production)', cx, 90);

    const border = '\u2500'.repeat(52);
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, 110);

    // Compact keybind reference
    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('WASD/Arrows move  •  G pick up  •  > descend  •  Y U B N diagonal  •  ESC pause', cx, 128);

    ctx.fillStyle = t.border;
    ctx.fillText(border, cx, 148);

    // Mode cards
    const cardW  = 270;
    const cardH  = 220;
    const gap    = 20;
    const startX = cx - (cardW * 2 + gap) / 2;
    const cardY  = 168;

    const modes = [
      {
        label: 'CLASSIC',
        color: '#4af',
        lines: [
          'No saves. Pure permadeath.',
          'Start fresh every time.',
          'Die and it\'s over.',
          '',
          'No meta-progression.',
        ],
        saveInfo: null as string | null,
      },
      {
        label: 'ROGUELIKE',
        color: '#fa4',
        lines: [
          'Gold carries over.',
          'Meta upgrades persist.',
          'Unlock skins in The Village.',
          '',
          'Run saves on descend.',
        ],
        saveInfo: roguelikeSave
          ? `Continue: Depth ${roguelikeSave.depth} · ${roguelikeSave.biomeName}`
          : 'No save — start in The Village',
      },
    ];

    modes.forEach((m, i) => {
      const cx2   = startX + i * (cardW + gap);
      const isSel = i === menuSelection;

      ctx.fillStyle = isSel ? m.color + '22' : t.bg;
      ctx.fillRect(cx2, cardY, cardW, cardH);
      ctx.strokeStyle = isSel ? m.color : t.border;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(cx2, cardY, cardW, cardH);

      ctx.textAlign = 'center';
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = isSel ? m.color : t.uiDim;
      ctx.fillText(m.label, cx2 + cardW / 2, cardY + 22);

      ctx.font = '12px monospace';
      ctx.fillStyle = isSel ? t.ui : t.uiDim;
      m.lines.forEach((line, li) => {
        ctx.fillText(line, cx2 + cardW / 2, cardY + 50 + li * 18);
      });

      if (m.saveInfo) {
        ctx.font = '11px monospace';
        ctx.fillStyle = isSel ? t.accent : t.uiDim;
        ctx.fillText(m.saveInfo, cx2 + cardW / 2, cardY + cardH - 18);
      }
    });

    // Blinking prompt
    const promptY = cardY + cardH + 24;
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = t.prompt;
    if (Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillText(`[ ${modes[menuSelection].label} — Press ENTER ]`, cx, promptY);
    }

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('← → choose mode', cx, promptY + 22);

    ctx.textAlign = 'left';
  }

  // ── The Village (Roguelike lobby) ─────────────────────────────────────────

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
    ctx.fillText('THE VILLAGE', cx, 30);

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('upgrades  •  skins  •  then descend', cx, 50);

    ctx.font = '13px monospace';
    ctx.fillStyle = '#ff8';
    ctx.fillText(`Gold: ${meta.gold}g`, cx, 70);

    const border = '\u2500'.repeat(48);
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, 90);

    // ── Stat upgrades ─────────────────────────────────────────────────────
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('UPGRADES', cx, 106);

    const upgradeKeys = ['vitality', 'strength', 'fortitude'] as const;
    const rows = upgradeKeys.map(k => {
      const level = meta.upgrades[k];
      const cost  = nextUpgradeCost(k, level);
      return { label: META_UPGRADE_LABELS[k], level, cost };
    });

    rows.forEach((row, i) => {
      const y     = 124 + i * 28;
      const isSel = i === selection;
      const maxed = row.cost === null;

      if (isSel) {
        ctx.fillStyle = t.accent + '22';
        ctx.fillRect(cx - 240, y - 10, 480, 22);
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 240, y - 10, 480, 22);
      }

      ctx.textAlign = 'left';
      ctx.font = `${isSel ? 'bold ' : ''}12px monospace`;
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
        ctx.fillText(`${row.cost}g`, cx + 240, y);
      }
      ctx.textAlign = 'center';
    });

    // ── Skins ─────────────────────────────────────────────────────────────
    const skinsHeaderY = 124 + rows.length * 28 + 10;
    ctx.fillStyle = t.border;
    ctx.font = '13px monospace';
    ctx.fillText(border, cx, skinsHeaderY);

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('SKINS', cx, skinsHeaderY + 16);

    THEMES.forEach((theme, i) => {
      const si    = upgradeKeys.length + i;
      const y     = skinsHeaderY + 34 + i * 24;
      const isSel = si === selection;
      const owned = meta.unlockedSkins.includes(theme.name);
      const active = meta.activeSkin === theme.name;
      const cost  = SKIN_COSTS[theme.name] ?? 100;

      if (isSel) {
        ctx.fillStyle = t.accent + '22';
        ctx.fillRect(cx - 240, y - 10, 480, 20);
        ctx.strokeStyle = t.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - 240, y - 10, 480, 20);
      }

      // Color swatch
      ctx.fillStyle = theme.player;
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('@', cx - 230, y);

      ctx.fillStyle = isSel ? t.prompt : (owned ? t.ui : t.uiDim);
      ctx.font = `${isSel ? 'bold ' : ''}12px monospace`;
      ctx.fillText((isSel ? '▶ ' : '  ') + theme.name, cx - 215, y);

      ctx.textAlign = 'right';
      if (active) {
        ctx.fillStyle = t.accent;
        ctx.fillText('[equipped]', cx + 240, y);
      } else if (owned) {
        ctx.fillStyle = isSel ? t.prompt : t.uiDim;
        ctx.fillText('ENTER to equip', cx + 240, y);
      } else {
        const canAfford = meta.gold >= cost;
        ctx.fillStyle = canAfford ? '#ff8' : '#a44';
        ctx.fillText(`${cost}g`, cx + 240, y);
      }
      ctx.textAlign = 'center';
    });

    // ── Descend ───────────────────────────────────────────────────────────
    const descIdx  = upgradeKeys.length + THEMES.length;
    const divY     = skinsHeaderY + 34 + THEMES.length * 24 + 4;
    ctx.fillStyle  = t.border;
    ctx.font       = '13px monospace';
    ctx.fillText(border, cx, divY);

    const descY   = divY + 20;
    const descSel = selection === descIdx;
    if (descSel) {
      ctx.fillStyle = t.accent + '22';
      ctx.fillRect(cx - 240, descY - 10, 480, 22);
      ctx.strokeStyle = t.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - 240, descY - 10, 480, 22);
    }
    ctx.font = `${descSel ? 'bold ' : ''}14px monospace`;
    ctx.fillStyle = descSel ? t.prompt : t.ui;
    ctx.fillText((descSel ? '▶ ' : '  ') + 'Descend into the dungeon', cx, descY);

    ctx.fillStyle = t.border;
    ctx.fillText(border, cx, descY + 18);

    ctx.font = '11px monospace';
    ctx.fillStyle = t.uiDim;
    ctx.fillText('↑ ↓ navigate   ENTER buy/equip/start   ESC main menu', cx, descY + 34);

    ctx.textAlign = 'left';
  }

  // ── Pause menu ────────────────────────────────────────────────────────────

  renderPauseMenu(selection: number, mode: 'classic' | 'roguelike'): void {
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

    const quitLabel = mode === 'roguelike' ? 'Save & Quit' : 'Quit to Menu';
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
    tab: 'book' | 'items' | 'hazards' | 'hunts',
    scroll: number,
    discoveries: Discoveries,
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
    const tabs: [string, typeof tab][] = [
      ['Monsters', 'book'],
      ['Items',    'items'],
      ['Hazards',  'hazards'],
      ['Hunts',    'hunts'],
    ];
    const tabW = (boxW - 40 - (tabs.length - 1) * 6) / tabs.length;
    tabs.forEach(([label, id], i) => {
      const tx    = bx + 20 + i * (tabW + 6);
      const isSel = tab === id;
      ctx.fillStyle = isSel ? t.accent + '33' : t.bg;
      ctx.fillRect(tx, by + 8, tabW, 28);
      ctx.strokeStyle = isSel ? t.accent : t.border;
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeRect(tx, by + 8, tabW, 28);
      ctx.textAlign = 'center';
      ctx.font = `${isSel ? 'bold ' : ''}11px monospace`;
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

    } else if (tab === 'items') {
      const ALL_ITEMS: [string, string, string, string][] = [
        // [codexName, glyph, color, desc]
        ['Health Potion',    '!',      '#f44', 'Health Potion    — Restore 10–20 HP'],
        ['Super Mushroom',   '\u25c6', '#f44', 'Super Mushroom   — Restore 25–40 HP'],
        ['Coin Bag',         '\u00a2', '#ff8', 'Coin Bag         — +20–40g (roguelike) or +15 XP (classic)'],
        ['Shield',           '[',      '#4af', 'Shield           — +2 DEF permanently'],
        ['Lightning Scroll', '/',      '#fa4', 'Lightning Scroll — 15–25 dmg to nearest monster'],
        ['Fire Flower',      '\u2660', '#f80', 'Fire Flower      — Burn all visible enemies 8–14 dmg'],
        ['Bomb',             '\u263b', '#888', 'Bomb             — Blast adjacent enemies 10–18 dmg'],
        ['Lantern',          ':',      '#ff8', 'Lantern          — +5 FOV for 15 turns'],
        ['Star',             '*',      '#ff0', 'Star             — 3 turns of invincibility'],
        ['Magic Map',        '?',      '#fff', 'Magic Map        — Reveal entire current floor'],
        ['Ice Bomb',         '*',      '#4af', 'Ice Bomb         — Freeze all visible enemies 2 turns'],
        ['Weapon',           ')',      '#aaf', 'Weapon (proc.)   — ATK scales with depth; equip replaces current'],
      ];
      const found = ALL_ITEMS.filter(([name]) => discoveries.items.includes(name));
      if (found.length === 0) {
        ctx.font = '13px monospace';
        ctx.fillStyle = t.uiDim;
        ctx.textAlign = 'center';
        ctx.fillText('No items discovered yet.', cx, contentY + 30);
        ctx.fillText('Pick up items to add them here.', cx, contentY + 52);
        ctx.textAlign = 'left';
      } else {
        const rowH = 22;
        found.forEach(([, glyph, color, desc], i) => {
          const ey = contentY + 16 + i * rowH;
          ctx.font = '13px monospace';
          ctx.fillStyle = color;
          ctx.fillText(glyph, bx + 28, ey);
          ctx.fillStyle = t.ui;
          ctx.font = '12px monospace';
          ctx.fillText(desc, bx + 48, ey);
        });
      }

    } else if (tab === 'hazards') {
      const ALL_HAZARDS: [string, string, string, string][] = [
        ['Ice Floor',  '\u00b0', '#44aaff', 'You slide — momentum carries you until hitting a wall or monster. Floors 8–14.'],
        ['Slime Pool', '%',      '#66cc33', 'Deals 1 HP per turn while you stand in it. Floors 15–21.'],
        ['Lava Floor', '~',      '#ff6600', 'Deals 3 HP per turn. Also created by Fire Dragon attacks. Floors 22–28.'],
      ];
      const found = ALL_HAZARDS.filter(([name]) => discoveries.hazards.includes(name));
      if (found.length === 0) {
        ctx.font = '13px monospace';
        ctx.fillStyle = t.uiDim;
        ctx.textAlign = 'center';
        ctx.fillText('No hazards encountered yet.', cx, contentY + 30);
        ctx.fillText('Step on a hazard tile to log it here.', cx, contentY + 52);
        ctx.textAlign = 'left';
      } else {
        found.forEach(([name, glyph, color, desc], i) => {
          const ey = contentY + 30 + i * 72;
          ctx.font = 'bold 22px monospace';
          ctx.fillStyle = color;
          ctx.fillText(glyph, bx + 30, ey);
          ctx.font = 'bold 13px monospace';
          ctx.fillStyle = color;
          ctx.fillText(name, bx + 60, ey + 2);
          ctx.font = '12px monospace';
          ctx.fillStyle = t.ui;
          const words = desc.split(' ');
          let line = '';
          let dy = ey + 20;
          for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (test.length > 58) { ctx.fillText(line, bx + 60, dy); line = word; dy += 16; }
            else { line = test; }
          }
          if (line) ctx.fillText(line, bx + 60, dy);
        });
      }

    } else {
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
    ctx.fillText('← → switch tabs   ESC close', cx, by + boxH - 14);
    ctx.textAlign = 'left';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBar(current: number, max: number, width: number): string {
  const filled = Math.round((current / max) * width);
  return '[' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, width - filled)) + ']';
}

function dimColor(hex: string): string {
  // Parse hex color and dim it by ~50%
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.4)},${Math.round(g * 0.4)},${Math.round(b * 0.4)})`;
}
