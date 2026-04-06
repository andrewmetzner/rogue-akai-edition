# CLAUDE.md

GitHub: https://github.com/andrewmetzner/rogue-akai-edition
Working directory: ~/prog/claude/dungeongame/current-project/


## TypeScript Rules

- `erasableSyntaxOnly: true` — no `enum`. Use `as const` + type union (see types.ts).
- `verbatimModuleSyntax: true` — type-only imports must use `import type` or inline `type`.
- `noUnusedLocals` / `noUnusedParameters` are on.


## Canvas / Viewport

- Cell: 14px × 20px. Viewport: 60 cols × 30 rows. Map: 80 × 45 tiles.
- FOV base: 9 tiles. Stored as `state.fovRadius` (modified by class/advancement/Lantern).


## Architecture

```
types.ts      value-object enums, shared interfaces (GameState, Entity, ItemKind…)
dungeon.ts    BSP dungeon generation
fov.ts        recursive shadowcasting
entities.ts   player/monster/item factories, spawn logic
combat.ts     damage rolls, useItem effects, monster step-AI
classes.ts    4 classes (Warrior/Mage/Ranger/Thief) + weaponNames
meta.ts       roguelite meta: MetaState, ADVANCEMENTS, lobby save/load
save.ts       classic-mode save (localStorage, version 3)
renderer.ts   all canvas draw calls — every screen
game.ts       GameState owner, turn loop, input binding, screen state machine
```


## Game Modes

**Classic**: permadeath, auto-saves to `localStorage['rogue-akai-edition-save']` every 10 turns and on descent. Save deleted on death/victory.

**Roguelite**: no run saves. Gold accumulates during run. On death/victory gold is added to `localStorage['rogue-akai-edition-meta']`. Meta upgrades (Vitality/Strength/Fortitude, 5 levels each) apply at run start. Upgrade room at floors 7/14/21 (depth before descent): choose job advancement (50g, 2 paths per class) or weapon tier upgrade (+4 ATK, free) or rest (40% HP heal, free).


## Screen State Machine

```
menu → modeSelect → classSelect → playing ↔ paused ↔ clanPrimer
                  ↘ lobby ↗               ↘ over
                                            ↓ (roguelite: lobby, classic: classSelect)
                                            upgradeRoom (floors 7/14/21) → playing
```


## Biomes (7 floors each, depth 1–28)

| Biome          | Floors | Hazard tile   | Effect           |
|----------------|--------|---------------|------------------|
| Dungeon        | 1–7    | —             | —                |
| Frozen Caverns | 8–14   | IceFloor      | Player slides    |
| Slime Pits     | 15–21  | SlimePool     | –1 HP/turn       |
| The Inferno    | 22–28  | LavaFloor     | –3 HP/turn       |


## Special Monsters

- `I` Ice Dragon (`special: 'freeze'`): attack also freezes player 2 turns. `state.frozenTurns` counts down.
- `Z` Fire Dragon (`special: 'fireline'`): converts up to 3 floor tiles toward player into LavaFloor, deals bonus damage.
- Frozen monsters (`frozenTurns > 0` on entity): skip their turn in `runMonsters()`.


## Key Mechanics

- **Gold drops** (roguelite only): `floor(depth/2) + rng(1,3)` per kill, +2 if Chief Bandit.
- **Dragon Knight**: on kill, tile under monster becomes LavaFloor.
- **Priest**: 20% chance of full HP heal on kill.
- **Bowmaster**: each attack also strikes the nearest other visible monster.
- **Hero**: 20% chance per attack to zero target defense before roll.
- **Sniper**: 25% chance per attack to double player attack stat for that roll. +5 FOV.
- **Night Lord**: free 3-dmg throwing star against nearest visible monster each turn.
- **Chief Bandit**: +2g per kill, 10% chance of extra item per room (`bonusItemChance` param in `spawnEntities`).
- **Star item**: `invincibleUntilTurn = turn + 3` — hazards and monster attacks skip HP deduction while active.
- **Lantern**: `fovRadius += 5`, `lanternExpiresAt = turn + 15`. Resets on expiry and on descent.


## Adding Content

- **Monster**: add template to `MONSTERS[]` in `entities.ts`.
- **Item**: add to `ITEMS[]` in `entities.ts`, implement case in `useItem()` in `combat.ts`.
- **Tile**: add to `Tile` const in `types.ts`, handle in `renderer.ts` switch, update dungeon gen.


## Run / Build

```
npm run dev      # dev server at localhost:5173
npm run build    # output to dist/
npx tsc --noEmit # type-check only
```
