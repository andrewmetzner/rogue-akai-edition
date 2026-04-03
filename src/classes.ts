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
  // Permanent gear applied at start (sword/shield add to stats)
  gearItems: ItemKind[];
  // Consumables placed at player's feet on floor 1
  consumables: ItemKind[];
}

export const CLASSES: CharClass[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    tagline: 'Born for battle',
    description: 'Maximum toughness. Charges in where others flee. Slow but nearly impossible to kill.',
    icon: 'W',
    color: '#ffaa44',
    hp: 45,
    attack: 7,
    defense: 4,
    fovBonus: 0,
    gearItems: [],
    consumables: [ItemKind.HealthPotion],
  },
  {
    id: 'rogue',
    name: 'Rogue',
    tagline: 'Strike fast, stay alive',
    description: 'Comes pre-equipped with a blade. Hits hard but thin-skinned — every fight is a gamble.',
    icon: 'R',
    color: '#44ffaa',
    hp: 24,
    attack: 9,
    defense: 1,
    fovBonus: 1,
    gearItems: [ItemKind.Sword],
    consumables: [],
  },
  {
    id: 'mage',
    name: 'Mage',
    tagline: 'Power at a price',
    description: 'Carries two lightning scrolls. Can devastate entire rooms — if you survive long enough to use them.',
    icon: 'M',
    color: '#cc66ff',
    hp: 20,
    attack: 4,
    defense: 1,
    fovBonus: 0,
    gearItems: [],
    consumables: [ItemKind.ScrollLightning, ItemKind.ScrollLightning],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    tagline: 'See everything first',
    description: 'Greatly expanded field of view. Spots monsters before they spot you — knowledge is armor.',
    icon: 'A',
    color: '#44ddff',
    hp: 28,
    attack: 6,
    defense: 2,
    fovBonus: 5,
    gearItems: [],
    consumables: [],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    tagline: 'Shield and sword',
    description: 'Starts armored and stocked with a health potion. Balanced across all stats — steady and reliable.',
    icon: 'P',
    color: '#ffff55',
    hp: 35,
    attack: 6,
    defense: 4,
    fovBonus: 0,
    gearItems: [ItemKind.Shield],
    consumables: [ItemKind.HealthPotion],
  },
];

export function getClass(id: string): CharClass {
  return CLASSES.find(c => c.id === id) ?? CLASSES[0];
}
