# CLAUDE.md

GitHub: https://github.com/andrewmetzner/rogue-akai-edition
Working directory: ~/prog/claude/dungeongame/current-project/


## TypeScript Rules

- `erasableSyntaxOnly: true` — no `enum`. Use `as const` + type union (see types.ts).
- `verbatimModuleSyntax: true` — type-only imports must use `import type` or inline `type`.
- `noUnusedLocals` / `noUnusedParameters` are on.
- No comments unless the logic is genuinely non-obvious. Don't comment what the code already says.


## Canvas / Viewport

- Cell: 14px × 20px. Viewport: 60 cols × 30 rows. Map: 80 × 45 tiles.
- FOV base: 9 tiles. Stored as `state.fovRadius` (modified by Lantern).


## Architecture

```
types.ts        value-object enums, shared interfaces (GameState, Entity, ItemKind…)
dungeon.ts      BSP dungeon generation
fov.ts          recursive shadowcasting
entities.ts     player/monster/item factories, spawn logic, procedural weapon gen
combat.ts       damage rolls, useItem effects, monster step-AI
meta.ts         roguelike meta: MetaState, skin unlocks, lobby save/load
save.ts         classic-mode save (localStorage, version 3)
renderer.ts     all canvas draw calls — every screen
game.ts         GameState owner, turn loop, input binding, screen state machine
themes.ts       color palette themes (skins)
audio.ts        sound effects
biomes.ts       biome definitions and palette (BIOMES[], getBiome())
discoveries.ts  cross-run item/hazard discovery log (Clan Primer codex)
classes.ts      stub — classes removed, classless system
```


## Game Modes

**Classic**: permadeath, auto-saves to `localStorage['rogue-akai-edition-save']` every 5 turns and on descent. Save deleted on death/victory.

**Roguelike**: no run saves. Gold accumulates during run. On death/victory gold is added to `localStorage['rogue-akai-edition-meta']`. Meta upgrades (Vitality/Strength/Fortitude, 5 levels each) apply at run start. Skins purchasable in The Village (lobby) with accumulated gold.


## Player

Classless. Base stats: HP 35, ATK 8, DEF 3 (in `BASE_PLAYER`, entities.ts).
Meta upgrades apply on top: +5 HP per Vitality level, +1 ATK per Strength, +1 DEF per Fortitude.
Weapon slot: procedurally generated weapon replaces previous on pickup.


## Screen State Machine

```
menu → playing ↔ paused ↔ clanPrimer
     ↘ lobby ↗            ↘ over
```


## Biomes (7 floors each, depth 1–28)

| Biome          | Floors | Hazard tile   | Effect           |
|----------------|--------|---------------|------------------|
| The Dungeon    | 1–7    | —             | —                |
| Frozen Caverns | 8–14   | IceFloor (°)  | Player slides    |
| The Slime Pits | 15–21  | SlimePool (%) | –1 HP/turn       |
| The Inferno    | 22–28  | LavaFloor (~) | –3 HP/turn       |


## Monsters

```
Dungeon (1–7)
  r  Rat            hp 4   atk 2  def 0   depths 1–4
  g  Goblin         hp 8   atk 4  def 1   depths 1–6
  o  Orc            hp 14  atk 6  def 2   depths 2–8
  T  Troll          hp 22  atk 8  def 3   depths 3–10
  D  Dragon         hp 40  atk 12 def 5   depths 5–12

Frozen Caverns (8–14)
  w  Frost Wolf     hp 18  atk 8  def 2   depths 8–14
  Y  Yeti           hp 30  atk 10 def 4   depths 8–14
  E  Ice Elemental  hp 22  atk 9  def 3   depths 10–14
  I  Ice Dragon     hp 50  atk 13 def 5   depths 12–14  [freeze: stuns player 2 turns]

Slime Pits (15–21)
  s  Slime          hp 14  atk 5  def 0   depths 15–21
  j  Jelly          hp 10  atk 6  def 1   depths 15–21
  S  Slime Lord     hp 38  atk 11 def 3   depths 17–21

The Inferno (22–28)
  e  Ember Spirit   hp 20  atk 10 def 2   depths 22–28
  d  Drake          hp 28  atk 12 def 3   depths 23–28
  F  Fire Demon     hp 45  atk 15 def 6   depths 24–28
  Z  Fire Dragon    hp 55  atk 14 def 6   depths 25–28  [fireline: converts tiles to lava]
```

Frozen monsters (`frozenTurns > 0`) skip their turn in `runMonsters()`.


## Items

```
Always available (depth 1+)
  !   Health Potion    heal 10–20 HP
  ◆   Super Mushroom   heal 25–40 HP (big heal)
  ¢   Coin Bag         +gold (roguelike) or +XP (classic)
  [   Shield           +2 DEF permanent
  )   Weapon           procedural; replaces equipped weapon (ATK varies by depth tier)

Mid dungeon
  /   Lightning Scroll  zap nearest monster 15–25 dmg
  ♠   Fire Flower       damages all visible monsters 8–14 each
  ☻   Bomb              damages all adjacent monsters 10–18 each
  :   Lantern           fovRadius += 5 for 15 turns; resets on expiry/descent
  *   Star              invincible for 3 turns (hazards + attacks skip HP deduction)
  ?   Magic Map         reveals entire current floor (depth 6+)

Deep dungeon
  *   Ice Bomb          freezes all visible monsters for 2 turns (depth 8+)

Planned (in ItemKind, not yet implemented)
  Wand    ranged attack, limited charges
  Ring    passive stat bonus (random on pickup)
  Boots   movement bonus / diagonal buff
  Amulet  floor-end boss item / special effect
```


## Special Mechanics

- **Ice Dragon** (`special: 'freeze'`): attack also freezes player 2 turns. `state.frozenTurns` counts down.
- **Fire Dragon** (`special: 'fireline'`): converts up to 3 floor tiles toward player into LavaFloor, deals bonus damage.
- **Star item**: `invincibleUntilTurn = turn + 3` — hazards and monster attacks skip HP deduction while active.
- **Lantern**: `fovRadius += 5`, `lanternExpiresAt = turn + 15`. Resets on expiry and on descent.
- **Coin Bag** (roguelike): adds gold to run total. (classic): adds 15 XP.
- **Weapon equip**: replaces previous weapon; old weapon's ATK is subtracted, new ATK applied.


## Skins (Roguelike)

Purchasable in The Village lobby with accumulated gold:

| Skin       | Cost |
|------------|------|
| Classic    | free |
| Pea Soup   | 80g  |
| Amber      | 80g  |
| Copper     | 80g  |
| Blood Moon | 100g |
| Oceanic    | 100g |
| Amethyst   | 120g |


## Clan Primer

In-game codex (`clanPrimer` screen). Tabs: Book / Items / Hazards / Hunts.
Cross-run discovery log in `localStorage['rogue-akai-edition-discoveries']`.
Items and hazards are "discovered" on first encounter and logged via `discoverItem()` / `discoverHazard()`.
Monster book tracks encounters and kills per monster type (`state.monsterBook`).


## Adding Content

- **Monster**: add template to `MONSTERS[]` in `entities.ts`.
- **Item**: add to `ItemKind` in `types.ts`, add to `ITEMS[]` in `entities.ts`, implement case in `useItem()` in `combat.ts`.
- **Tile**: add to `Tile` const in `types.ts`, handle in `renderer.ts` switch, update dungeon gen.
- **Skin**: add to `THEMES` in `themes.ts` and `SKIN_COSTS` in `meta.ts`.


## Future Plans

- Implement Wand, Ring, Boots, Amulet items
- More biomes or extended depth beyond 28
- Boss encounters at biome transitions
- Expanded Clan Primer: item lore, kill milestones
- Audio: more SFX, ambient per biome


## Run / Build

```
npm run dev      # dev server at localhost:5173
npm run build    # output to dist/
npx tsc --noEmit # type-check only
```
