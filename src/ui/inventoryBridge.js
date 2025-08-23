// src/ui/inventoryBridge.js
import {
  getInventoryEls, setGold, setInventorySlot, setEquipment
} from './inventoryUi.js';
import { gameManager } from '../managers/gameManager.js';

// helper per capire quante celle ha la griglia
function getGridSize() {
  const { invGrid } = getInventoryEls();
  return invGrid ? invGrid.children.length : 0;
}

export function refreshInventoryUI() {
  const inv = gameManager.inventory; // << tua reference già esistente
  if (!inv) return;

  // (Se hai l'oro, qui puoi settarlo. Se non lo gestisci, commenta.)
  // setGold(inv.gold ?? 0);

  // Items → slot grid
  const n = getGridSize();
  const items = inv.items || [];
  for (let i = 0; i < n; i++) {
    const item = items[i];
    if (!item) { setInventorySlot(i, null); continue; }
    setInventorySlot(i, {
      id: item.id,
      name: item.name,
      qty: item.attributes?.qty ?? 1,
      iconText: item.attributes?.iconText ?? iconFromType(item.type),
    });
  }

  // Equipment (mappo helmet→head per la UI)
  const eq = inv.equipment || {};
  setEquipment('weapon',    eq.weapon ? fmt(eq.weapon) : null);
  setEquipment('shield',    eq.shield ? fmt(eq.shield) : null);
  setEquipment('head',      eq.helmet ? fmt(eq.helmet) : null); // helmet→head
  // gli altri slot della UI (chest, legs, boots, accessory) li lasciamo vuoti:
  setEquipment('chest',     null);
  setEquipment('legs',      null);
  setEquipment('boots',     null);
  setEquipment('accessory', null);
}

function fmt(item) {
  return { name: item.name, type: capitalize(item.type || 'Equipment'), iconText: item.attributes?.iconText ?? iconFromType(item.type) };
}
function iconFromType(type='') {
  const t = type.toLowerCase();
  if (t === 'weapon') return '🗡️';
  if (t === 'shield') return '🛡️';
  if (t === 'helmet') return '🪖';
  return '●';
}
function capitalize(x=''){ return x.charAt(0).toUpperCase()+x.slice(1); }
