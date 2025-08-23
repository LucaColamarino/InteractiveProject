import {WeaponItem, HelmetItem} from './gameItem.js';
export const ironSword = new WeaponItem({
  id: 'sword_iron_01',
  name: 'Iron Sword',
  modelPath: '/models/pickups/iron_sword.fbx',
  meshPrefix: 'sword',             // per l’equipment (sword*)
  meta: { damage: 12, rarity: 'common' }
});

export const magicWand = new WeaponItem({
  id: 'wand_magic_01',
  name: 'Magic Wand',
  modelPath: '/models/pickups/magic_wand.fbx',
  meshPrefix: 'wand',              // gestisce wand, wand1, wand2, wand3...
  meta: { damage: 8, bonus: '+mana', rarity: 'rare' }
});

export const bronzeHelmet = new HelmetItem({
  id: 'helmet_bronze_01',
  name: 'Bronze Helmet',
  modelPath: '/models/pickups/bronze_helmet.fbx',
  meshPrefix: 'helmet',
  meta: { armor: 5 }
});
