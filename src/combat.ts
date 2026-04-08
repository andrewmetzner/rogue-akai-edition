import { type Entity, EntityType, ItemKind, type GameState } from './types';

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roll(attack: number, defense: number): number {
  const base = rng(1, attack);
  return Math.max(1, base - defense);
}

export function attackEntity(attacker: Entity, defender: Entity): string {
  const atkStats = attacker.stats!;
  const defStats = defender.stats!;
  const dmg = roll(atkStats.attack, defStats.defense);
  defStats.hp -= dmg;

  if (defStats.hp <= 0) {
    defender.alive = false;
    if (attacker.type === EntityType.Player && defender.type === EntityType.Monster) {
      const xpGain = (defender.level ?? 1) * 10 + rng(1, 5);
      atkStats.xp += xpGain;
      checkLevelUp(attacker);
      return `You kill the ${defender.name}! (+${xpGain} XP)`;
    }
    return `${attacker.name} kills the ${defender.name}!`;
  }
  if (attacker.type === EntityType.Player) {
    return `You hit the ${defender.name} for ${dmg} damage. (${defStats.hp}/${defStats.maxHp} HP)`;
  }
  return `The ${attacker.name} hits you for ${dmg} damage!`;
}

function xpForLevel(level: number): number {
  return level * level * 50;
}

function checkLevelUp(player: Entity): void {
  const s = player.stats!;
  const level = playerLevel(s.xp);
  const prevLevel = playerLevel(s.xp - 1);
  if (level > prevLevel) {
    s.maxHp += 5;
    s.hp = Math.min(s.hp + 5, s.maxHp);
    s.attack += 1;
  }
}

export function playerLevel(xp: number): number {
  let level = 1;
  while (xpForLevel(level) <= xp) level++;
  return level - 1;
}

export function useItem(player: Entity, kind: ItemKind, state: GameState, item?: Entity): string {
  const s = player.stats!;
  const { entities, visible, mapWidth } = state;

  switch (kind) {

    // ── Core items ────────────────────────────────────────────────────────

    case ItemKind.HealthPotion: {
      const hpBefore = s.hp;
      const heal = rng(10, 20);
      s.hp = Math.min(s.hp + heal, s.maxHp);
      const actual = s.hp - hpBefore;
      return actual === 0
        ? 'You drink the potion but are already at full health.'
        : `You drink the potion and recover ${actual} HP. (${hpBefore} → ${s.hp}/${s.maxHp})`;
    }

    case ItemKind.ScrollLightning: {
      const targets = entities
        .filter(e => e.type === EntityType.Monster && e.alive)
        .sort((a, b) => dist(player, a) - dist(player, b));
      if (targets.length === 0) return 'The scroll crackles but finds no target.';
      const target = targets[0];
      const dmg = rng(15, 25);
      target.stats!.hp -= dmg;
      if (target.stats!.hp <= 0) {
        target.alive = false;
        return `Lightning strikes the ${target.name} for ${dmg} damage — it dies!`;
      }
      return `Lightning strikes the ${target.name} for ${dmg} damage!`;
    }

    case ItemKind.Sword: {
      // Swap out old weapon, equip new procedural one
      const oldAtk = state.equippedWeapon?.atk ?? 0;
      const newAtk = item?.weaponAtk ?? 3;
      const weaponName = item?.name ?? 'Sword';
      s.attack = s.attack - oldAtk + newAtk;
      state.equippedWeapon = { name: weaponName, atk: newAtk };
      return `You equip the ${weaponName}. (+${newAtk} ATK)`;
    }

    case ItemKind.Shield: {
      s.defense += 2;
      return 'You equip the shield. (+2 defense)';
    }

    // ── Mario-inspired items ──────────────────────────────────────────────

    case ItemKind.SuperMushroom: {
      const hpBefore = s.hp;
      const heal = rng(25, 40);
      s.hp = Math.min(s.hp + heal, s.maxHp);
      const actual = s.hp - hpBefore;
      return actual === 0
        ? 'You eat the mushroom but are already at full health.'
        : `You eat the mushroom and recover ${actual} HP. (${hpBefore} → ${s.hp}/${s.maxHp})`;
    }

    case ItemKind.Star: {
      state.invincibleUntilTurn = state.turn + 3;
      return 'A golden star surrounds you! [INVINCIBLE for 3 turns]';
    }

    case ItemKind.FireFlower: {
      const visMonsters = entities.filter(e =>
        e.type === EntityType.Monster && e.alive && visible[e.y * mapWidth + e.x]
      );
      if (visMonsters.length === 0) return 'The fire flower blooms, but no targets are in sight.';
      let kills = 0;
      for (const m of visMonsters) {
        const dmg = rng(8, 14);
        m.stats!.hp -= dmg;
        if (m.stats!.hp <= 0) { m.alive = false; kills++; }
      }
      const hit = visMonsters.length;
      return kills > 0
        ? `Flames engulf ${hit} enemies! (${kills} killed)`
        : `Flames scorch ${hit} enemies!`;
    }

    case ItemKind.Bomb: {
      const adjacent = entities.filter(e =>
        e.type === EntityType.Monster && e.alive &&
        Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1
      );
      if (adjacent.length === 0) return 'BOOM! No adjacent enemies caught in the blast.';
      let kills = 0;
      for (const m of adjacent) {
        const dmg = rng(10, 18);
        m.stats!.hp -= dmg;
        if (m.stats!.hp <= 0) { m.alive = false; kills++; }
      }
      return kills > 0
        ? `BOOM! Blast hits ${adjacent.length} enemies! (${kills} killed)`
        : `BOOM! Blast hits ${adjacent.length} enemies!`;
    }

    case ItemKind.CoinBag: {
      if (state.mode === 'roguelike') {
        const gold = rng(20, 40);
        state.gold += gold;
        return `You grab the coin bag! (+${gold}g)`;
      } else {
        const xp = 15;
        s.xp += xp;
        checkLevelUp(player);
        return `You grab the coin bag! (+${xp} XP)`;
      }
    }

    // ── Exploration items ─────────────────────────────────────────────────

    case ItemKind.MagicMap: {
      state.explored.fill(1);
      return 'The map glows — every corner of this floor is revealed!';
    }

    case ItemKind.IceBomb: {
      const visibleMonsters = entities.filter(e =>
        e.type === EntityType.Monster && e.alive && visible[e.y * mapWidth + e.x]
      );
      if (visibleMonsters.length === 0) return 'The ice bomb detonates, but no targets are in sight.';
      for (const m of visibleMonsters) m.frozenTurns = 2;
      return `The ice bomb freezes ${visibleMonsters.length} enemies for 2 turns!`;
    }

    case ItemKind.Lantern: {
      state.lanternExpiresAt = state.turn + 15;
      state.fovRadius += 5;
      return 'The lantern blazes! Your vision expands for 15 turns.';
    }

    // ── Planned ───────────────────────────────────────────────────────────

    case ItemKind.Wand:
      return '(not yet implemented)';

    case ItemKind.Ring:
      return '(not yet implemented)';

    case ItemKind.Boots:
      return '(not yet implemented)';

    case ItemKind.Amulet:
      return '(not yet implemented)';
  }
}

function dist(a: Entity, b: Entity): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function monsterAI(monster: Entity, player: Entity, canMove: (x: number, y: number) => boolean): { dx: number; dy: number } {
  const dx = player.x - monster.x;
  const dy = player.y - monster.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (absDx <= 1 && absDy <= 1) return { dx: Math.sign(dx), dy: Math.sign(dy) };

  if (absDx > absDy) {
    const stepX = Math.sign(dx);
    if (canMove(monster.x + stepX, monster.y)) return { dx: stepX, dy: 0 };
    const stepY = Math.sign(dy);
    if (canMove(monster.x, monster.y + stepY)) return { dx: 0, dy: stepY };
  } else {
    const stepY = Math.sign(dy);
    if (canMove(monster.x, monster.y + stepY)) return { dx: 0, dy: stepY };
    const stepX = Math.sign(dx);
    if (canMove(monster.x + stepX, monster.y)) return { dx: stepX, dy: 0 };
  }
  return { dx: 0, dy: 0 };
}
