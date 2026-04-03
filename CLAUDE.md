# CLAUDE.md — Notes for Claude

This file contains context for working on the rogue-akai-edition codebase.


## Project Overview

ASCII roguelike dungeon crawler. TypeScript + Vite + HTML5 Canvas.
No UI framework. No runtime dependencies.
All rendering is done manually on a single `<canvas>` element.

GitHub: https://github.com/andrewmetzner/rogue-akai-edition
Working directory: ~/prog/claude/dungeongame/current-project/


## Directory Structure

```
current-project/       <- git root, this is what gets pushed
  src/
    types.ts           - value-object enums (as const), shared interfaces
    dungeon.ts         - procedural BSP dungeon + corridor generation
    fov.ts             - recursive shadowcasting FOV
    entities.ts        - player/monster/item factories + spawn logic
    combat.ts          - damage rolls, item effects, monster step-AI
    renderer.ts        - canvas draw calls, HUD, start/death screens
    game.ts            - GameState, player actions, turn loop, key bindings
    main.ts            - entry point: `new Game()`
  index.html           - minimal shell; canvas + hud + log divs
  tsconfig.json        - strict mode, erasableSyntaxOnly, verbatimModuleSyntax
```

Sibling experiment folders may exist at ~/prog/claude/dungeongame/experimental-*/
These are NOT part of the repo. Only current-project/ is tracked.


## Key Conventions

- `erasableSyntaxOnly: true` in tsconfig — do NOT use TypeScript `enum`.
  Use `as const` objects + type unions instead (see types.ts).

- `verbatimModuleSyntax: true` — type-only imports must use `import type`
  or the `type` keyword inline: `import { type Foo, Bar } from './types'`.

- `noUnusedLocals` and `noUnusedParameters` are on — clean up before committing.

- Enums replaced by pattern:
  ```ts
  export const Tile = { Wall: 0, Floor: 1, StairsDown: 2 } as const;
  export type Tile = (typeof Tile)[keyof typeof Tile];
  ```

- Canvas cell size: 14px wide × 20px tall. Viewport: 60 cols × 30 rows.
  Map size: 80 × 45 tiles.

- FOV radius: 9 tiles. Monsters only act/render when in FOV.

- Game loop is purely input-driven (no requestAnimationFrame during play),
  except the start menu which uses rAF for the blinking prompt.


## GameState Shape

```ts
{
  map: Uint8Array          // flat tile array [y * mapWidth + x]
  mapWidth / mapHeight
  visible: Uint8Array      // 1 = in current FOV
  explored: Uint8Array     // 1 = ever seen (for dim rendering)
  entities: Entity[]       // monsters + items (player is separate)
  player: Entity
  depth: number            // 1–7
  turn: number
  log: string[]            // newest first, max 6 entries
}
```


## Bugs & Fixes

### [FIXED] Health potion appeared to not heal
- **Symptom**: Player picked up a health potion, HP bar didn't visibly increase.
- **Root cause**: UX/readability issue, not a logic error. `tryPickup()` calls
  `endTurn()` which runs `runMonsters()` before rendering. If a monster attacked
  the same turn, the net HP change was confusing or zero. The old log message
  also didn't show before/after HP so there was no way to verify the heal.
- **Fix** (combat.ts `useItem` HealthPotion case): capture `hpBefore`, apply
  heal, compute `actual = s.hp - hpBefore`. Message now shows
  `"recover X HP. (15 → 25/30)"` so the player can verify the heal in the log
  regardless of what monsters do that same turn.
- **File**: `src/combat.ts` — `useItem()`, `ItemKind.HealthPotion` case.


## Item System & Planned Items

Items live in two places:
1. `src/types.ts` — `ItemKind` const object defines the ID for every item,
   including planned ones that are not yet active.
2. `src/entities.ts` — `ITEMS` array controls what can actually spawn.
   Items NOT in this array never appear in the dungeon.
3. `src/combat.ts` — `useItem()` switch handles the effect when used.

**To unlock a planned item**: add it to `ITEMS` in entities.ts (give it a
glyph, color, name, minDepth), then implement its case in `useItem()`.
The `ItemKind` value is already reserved in types.ts.

### Implemented
| Symbol | Name             | Effect                                   |
|--------|------------------|------------------------------------------|
| `!`    | Health Potion    | Heals 10–20 HP, capped at maxHp         |
| `/`    | Lightning Scroll | Zaps nearest monster for 15–25 damage   |
| `)`    | Sword            | Permanent +3 attack                     |
| `[`    | Shield           | Permanent +2 defense                    |

### Planned (hooks exist in types.ts + combat.ts, not yet spawning)
| Kind       | Symbol idea | Planned effect                                        |
|------------|-------------|-------------------------------------------------------|
| MagicMap   | `?`         | Reveals all explored tiles on current floor           |
| Wand       | `\`         | Ranged attack, limited charges (charge count on entity)|
| IceBomb    | `*`         | Freezes all visible monsters for 1 turn               |
| Lantern    | `:`         | Temporarily expands FOV radius (e.g. 9 → 14)         |
| Ring       | `=`         | Random passive stat bonus on pickup (+atk or +def)   |
| Boots      | `"`         | Speed boost or diagonal move bonus                   |
| Amulet     | `"`         | Rare, depth 6+ — powerful unique effect per run      |

Notes on planned items:
- **IceBomb**: needs a `frozen` flag on Entity and monster AI to check it.
- **Wand**: needs a `charges` field on Entity; depletes on use, can't use at 0.
- **Lantern**: needs a timed effect — consider adding a `turnEffects` array to
  GameState `{ effect: string, expiresAt: number }`.
- **MagicMap**: `explored.fill(1)` on current floor map is the whole implementation.
- **Ring / Boots**: could use a `passives` array on Stats in the future.
- **Amulet**: intentionally vague — design when depth 6–7 content is fleshed out.


## Adding Content

Monster — add a template object to the `MONSTERS` array in entities.ts.
  Fields: glyph, color, name, hp, attack, defense, minDepth.

Item — add to the `ITEMS` array in entities.ts and handle the new ItemKind
  case inside `useItem()` in combat.ts.

New tile type — add to the `Tile` const in types.ts, handle in renderer.ts
  switch block, and update dungeon generation if needed.


## Experimental Builds

The user plans to create sibling experiment folders for feature branches:
  ~/prog/claude/dungeongame/experimental-<name>/

These should be self-contained copies (or symlinks) of current-project
with modifications applied. Do not merge experimental changes back without
the user's explicit instruction.


## Run / Build

```
npm install
npm run dev      # dev server at localhost:5173
npm run build    # output to dist/
npx tsc --noEmit # type-check only
```
