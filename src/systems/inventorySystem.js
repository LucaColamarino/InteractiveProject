import * as THREE from "three";
import { gameManager } from "../gameManager";
import { update } from "three/examples/jsm/libs/tween.module.js";
export class InventorySystem {
  constructor() {
    this.items = [];
    this.equipment = {
      weapon: null,
      shield: null,
      helmet: null
    };
  }

  addItem(item) {
    if (!item.id) {
      console.warn("Oggetto senza id, impossibile aggiungere");
      return;
    }
    this.items.push(item);
  }
  removeItem(itemId) {
    this.items = this.items.filter(i => i.id !== itemId);
    // se era equipaggiato, toglilo anche dallo slot
    for (let slot in this.equipment) {
      if (this.equipment[slot]?.id === itemId) {
        this.equipment[slot] = null;
      }
    }
  }
  equip(itemId, slot = "weapon") {
    console.log("Equip", itemId, "in slot", slot);
    const item = this.items.find(i => i.id === itemId);
    if (!item) {
      console.warn(`Item ${itemId} non trovato nell'inventario`);
      return;
    }
    this.equipment[slot] = item;
    this.updateEquipmentVisibility(gameManager.player.model);
  }
  unequip(slot = "weapon") {
    this.equipment[slot] = null;
    this.updateEquipmentVisibility(gameManager.player.model);
  }
  getEquipped(slot = "weapon") {
    return this.equipment[slot];
  }
  


updateEquipmentVisibility() {
  const meshes = gameManager.player.model.equipmentMeshes;
  console.log("Meshes equipaggiamento:", meshes);
  if (!meshes) return;

  // spegni tutto (gestisce array per ogni pezzo)
  Object.values(meshes).forEach(list => setGroupVisible(list, false));

  // prendi cosa è equipaggiato nello slot weapon
  const equippedWeapon = inventory.getEquipped("weapon");
  if (equippedWeapon) {
    const key = String(equippedWeapon.meshPrefix || "weapon")
      .toLowerCase();
    console.log("Equipaggiato:", key);
    const group = meshes[key];
    console.log("Gruppo mesh:", group);
    if (group) setGroupVisible(group, true);
  }
}

  printStatus() {
    console.log("Inventario:", this.items);
    console.log("Equipaggiamento:", this.equipment);
  }
  
}
function setGroupVisible(list, visible) {
  if (!Array.isArray(list)) return;
  list.forEach(m => { if (m) m.visible = visible; });
}

export class Item {
  constructor(id, name, type, attributes = {}) {
    this.id = id; // identificatore unico
    this.name = name; // nome dell'oggetto
    this.type = type; // es. "weapon", "shield", "helmet"
    this.attributes = attributes; // es. { attack: 10, defense: 5 }
  }
}
