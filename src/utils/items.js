import {WeaponItem, HelmetItem, ShieldItem, SpecialItem} from './gameItem.js';
export const ironSword = new WeaponItem({
  id: 'sword_iron_01',
  name: 'Iron Sword',
  modelPath: '/models/pickups/iron_sword.fbx',
  meshPrefix: 'sword',
  meta: { damage: 12, rarity: 'common', weaponKind: 'sword', reach: 2.7, arcDeg: 90 }
});
export const magicWand = new WeaponItem({
  id: 'wand_magic_01',
  name: 'Magic Wand',
  modelPath: '/models/pickups/magic_wand.fbx',
  meshPrefix: 'wand',
  meta: {
    damage: 20, rarity: 'rare', weaponKind: 'wand',
    speed: 35, cooldown: 0.45, boltRadius: 0.5, lifetime: 2.0,
    multishot: 1, spreadDeg: 0, homing: 0.0,
    muzzleOffset: [0, 1.3, 0.5]
  }
});
export const ironHelmet = new HelmetItem({
  id: 'helmet_iron_01',
  name: 'Iron Helmet',
  modelPath: '/models/pickups/iron_helmet.fbx',
  meshPrefix: 'helmet',
  meta: { armor: 5 }
});

export const ironShield = new ShieldItem({
  id: 'shield_iron_01',
  name: 'Iron Shield',
  modelPath: '/models/pickups/iron_shield.fbx',
  meshPrefix: 'shield',
  meta: { armor: 5 }
});

export const dragonheart = new SpecialItem({
  id: 'dragon_heart_01',
  name: 'Dragon Heart',
  modelPath: '/models/pickups/heart.fbx',
  meshPrefix: 'shield',
  meta: { armor: 10 }
});

export const allItems = [ironSword, magicWand, ironHelmet, ironShield, dragonheart];
export function getRandomItem() {
  const index = Math.floor(Math.random() * allItems.length);
  console.log("getRandomItem:", allItems[index].name);
  return allItems[index];
}
export function getItemById(id) {
  if (!id) return null;
  return allItems.find(it => it.id === id) || null;
}
