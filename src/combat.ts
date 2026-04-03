import { type Entity, EntityType, ItemKind } from './types';

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

function checkLevelUp(player: Entity): string | null {
  const s = player.stats!;
  const level = playerLevel(s.xp);
  const prevLevel = playerLevel(s.xp - 1); // rough check
  if (level > prevLevel) {
    s.maxHp += 5;
    s.hp = Math.min(s.hp + 5, s.maxHp);
    s.attack += 1;
    return `You reached level ${level}!`;
  }
  return null;
}

export function playerLevel(xp: number): number {
  let level = 1;
  while (xpForLevel(level) <= xp) level++;
  return level - 1;
}

export function useItem(player: Entity, kind: ItemKind, entities: Entity[]): string {
  const s = player.stats!;
  switch (kind) {
    case ItemKind.HealthPotion: {
      const heal = rng(10, 20);
      const actual = Math.min(heal, s.maxHp - s.hp);
      s.hp = Math.min(s.hp + heal, s.maxHp);
      return actual === 0 ? 'You drink the potion but are already at full health.' : `You drink the potion and recover ${actual} HP.`;
    }
    case ItemKind.ScrollLightning: {
      // zap nearest visible monster
      const target = entities
        .filter(e => e.type === EntityType.Monster && e.alive)
        .sort((a, b) => dist(player, a) - dist(player, b))[0];
      if (!target) return 'The scroll crackles but finds no target.';
      const dmg = rng(15, 25);
      target.stats!.hp -= dmg;
      if (target.stats!.hp <= 0) {
        target.alive = false;
        return `Lightning strikes the ${target.name} for ${dmg} damage — it dies!`;
      }
      return `Lightning strikes the ${target.name} for ${dmg} damage!`;
    }
    case ItemKind.Sword: {
      s.attack += 3;
      return 'You equip the sword. (+3 attack)';
    }
    case ItemKind.Shield: {
      s.defense += 2;
      return 'You equip the shield. (+2 defense)';
    }
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

  // Adjacent — attack (handled by caller)
  if (absDx <= 1 && absDy <= 1) return { dx: Math.sign(dx), dy: Math.sign(dy) };

  // Step toward player
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
