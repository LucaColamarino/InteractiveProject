// src/ui/inventoryInteractions.js
import { getInventoryEls } from './inventoryUi.js';
import { refreshInventoryUI } from './inventoryBridge.js';
import { gameManager } from '../managers/gameManager.js';

export function wireInventoryInteractions() {
  const { invGrid } = getInventoryEls();
  if (!invGrid) return;

  invGrid.addEventListener('dblclick', (e) => {
    const slotEl = e.target.closest('.inv-slot');
    if (!slotEl) return;
    const idx = Number(slotEl.getAttribute('data-idx'));
    const inv = gameManager.inventory;
    if (!inv) return;

    const item = inv.items[idx];
    if (!item) return;

    const slot = inferSlot(item.type);
    if (!slot) return;

    inv.equip(item.id, slot);
    refreshInventoryUI();
  });
}

function inferSlot(type = '') {
  const t = String(type).toLowerCase();
  if (t === 'weapon') return 'weapon';
  if (t === 'shield') return 'shield';
  if (t === 'helmet') return 'helmet';
  return null; // se non è equipaggiabile, non fare nulla
}
