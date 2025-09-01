import { gameManager } from "../managers/gameManager";
export class InventorySystem {
  constructor() {
    this.items = [];
    this.equipment = { weapon: null, shield: null, helmet: null };
    this._listeners = new Set();
  }
  _emit() { this._listeners.forEach(fn => { try { fn(this); } catch(e) {} }); }
  onChange(cb) { this._listeners.add(cb); return () => this._listeners.delete(cb); }
  addItem(item) {
    if (!item.id) { console.warn("Oggetto senza id, impossibile aggiungere"); return; }
    this.items.push(item);
    this._emit();
  }
  removeItem(itemId) {
    this.items = this.items.filter(i => i.id !== itemId);
    for (let slot in this.equipment) if (this.equipment[slot]?.id === itemId) this.equipment[slot] = null;
    this.updateEquipmentVisibility(gameManager.player?.model);
    this._emit();
  }
  equip(itemId, slot = "weapon") {
    const item = this.items.find(i => i.id === itemId);
    if (!item) { console.warn(`Item ${itemId} non trovato`); return; }
    if(this.equipment[slot]) this.unequip(slot);
    this.equipment[slot] = item;
    this.updateStats(item);
    this.updateEquipmentVisibility(gameManager.player?.model);
    this._emit();
  }
  updateStats(item,remove=false)
  {
    const armor = item.meta.armor;
    if(armor){
      const stats=gameManager.controller.stats;
      if(remove) stats.armor-=armor;
      else stats.armor+=armor;
      console.log("NEW ARMOR STAT",stats.armor)
    }
  }
  unequip(slot = "weapon") {
    const item = this.equipment[slot];
    console.log("UNEQUIP"+slot+" "+item);
    this.equipment[slot] = null;
    this.updateStats(item,true);
    this.updateEquipmentVisibility(gameManager.player?.model);
    this._emit();
  }
  getEquipped(slot = "weapon") { return this.equipment[slot]; }

  updateEquipmentVisibility() {
    const meshes = gameManager.controller.player?.model?.equipmentMeshes;
    if (!meshes) return;
    Object.values(meshes).forEach(list => setGroupVisible(list, false));
    const eqWeapon = this.getEquipped("weapon");
    if (eqWeapon) {
      const key = String(eqWeapon.meshPrefix || "weapon").toLowerCase();
      if (meshes[key]) setGroupVisible(meshes[key], true);
    }
    const eqShield = this.getEquipped("shield");
    if (eqShield) {
      const key = String(eqShield.meshPrefix || "shield").toLowerCase();
      if (meshes[key]) setGroupVisible(meshes[key], true);
    }
    const eqHelmet = this.getEquipped("helmet");
    if (eqHelmet) {
      const key = String(eqHelmet.meshPrefix || "helmet").toLowerCase();
      if (meshes[key]) setGroupVisible(meshes[key], true);
    }
  }
  printStatus() { console.log("Inventario:", this.items, "Equip:", this.equipment); }
}
function setGroupVisible(list, visible) {
  if (!Array.isArray(list)) return;
  list.forEach(m => { if (m) m.visible = visible; });
}
export class Item {
  constructor(id, name, type, attributes = {}) {
    this.id = id;
    this.name = name; 
    this.type = type; // "weapon", "shield", "helmet"
    this.attributes = attributes; // {armor: 5 }
  }
}
