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
