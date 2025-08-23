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

export const ironHelmet = new HelmetItem({
  id: 'helmet_iron_01',
  name: 'Bronze Helmet',
  modelPath: '/models/pickups/iron_helmet.fbx',
  meshPrefix: 'helmet',
  meta: { armor: 5 }
});

export const ironShield = new HelmetItem({
  id: 'shield_iron_01',
  name: 'Iron Shield',
  modelPath: '/models/pickups/iron_shield.fbx',
  meshPrefix: 'shield',
  meta: { armor: 5 }
});

export const allItems = [ironSword, magicWand, ironHelmet,ironShield];

export function getRandomItem() {
  
  const index = Math.floor(Math.random() * allItems.length);
  console.log("getRandomItem:", allItems[index].name);
  return allItems[index];
}