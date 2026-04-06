import { ItemKind } from './types';

export interface CharClass {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;        // large display character for the class card
  color: string;       // accent color used in the class card
  hp: number;
  attack: number;
  defense: number;
  fovBonus: number;    // added to base FOV radius (9)
  // Permanent gear applied at start (sword adds to stats directly)
  gearItems: ItemKind[];
  // Consumables placed at player's feet on floor 1
  consumables: ItemKind[];
  // Weapon tier names: [tier0, tier1, tier2, tier3]
  weaponNames: [string, string, string, string];
}

export const CLASSES: CharClass[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    tagline: 'Strength above all',
    description: 'A battle-hardened fighter with iron discipline. Starts armed and ready. Takes hits that would drop anyone else.',
    icon: 'W',
    color: '#ffaa44',
    hp: 45,
    attack: 8,
    defense: 5,
    fovBonus: 0,
    gearItems: [ItemKind.Sword],
    consumables: [ItemKind.HealthPotion],
    weaponNames: ['Iron Sword', 'Steel Sword', 'Dragonslayer', 'Excalibur'],
  },
  {
    id: 'mage',
    name: 'Mage',
    tagline: 'Power at a price',
    description: 'Carries two lightning scrolls. Can devastate entire rooms — if you survive long enough to use them.',
    icon: 'M',
    color: '#cc66ff',
    hp: 20,
    attack: 5,
    defense: 1,
    fovBonus: 0,
    gearItems: [],
    consumables: [ItemKind.ScrollLightning, ItemKind.ScrollLightning],
    weaponNames: ['Wood Staff', 'Arcane Staff', 'Obsidian Staff', 'Void Scepter'],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'See everything first',
    description: 'Greatly expanded field of view. Spots monsters before they spot you — knowledge is armor.',
    icon: 'A',
    color: '#44ddff',
    hp: 28,
    attack: 7,
    defense: 2,
    fovBonus: 5,
    gearItems: [],
    consumables: [],
    weaponNames: ['Short Bow', 'Long Bow', 'Dragon Bow', 'Infinity Bow'],
  },
  {
    id: 'thief',
    name: 'Thief',
    tagline: 'Strike fast, vanish',
    description: 'Lightning reflexes and a blade always at hand. Highest raw damage of any class — but thin as paper.',
    icon: 'T',
    color: '#44ffaa',
    hp: 22,
    attack: 11,
    defense: 1,
    fovBonus: 1,
    gearItems: [ItemKind.Sword],
    consumables: [],
    weaponNames: ['Dagger', 'Shadow Blade', 'Phantom Blade', 'Soul Reaper'],
  },
];

export function getClass(id: string): CharClass {
  return CLASSES.find(c => c.id === id) ?? CLASSES[0];
}
