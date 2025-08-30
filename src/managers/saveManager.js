// managers/saveManager.js
import { getItemById } from '../utils/items.js';
import { gameManager, createGameManager } from './gameManager.js';

const SAVE_KEY = 'metamorphosis_save_v3';

let _pending = null; // snapshot da applicare dopo l'init dei sistemi (se necessario)

/** ---- SERIALIZATION ---- **/
function snapshotStats(stats) {
  if (!stats) return null;
  return {
    maxHP: Number(stats.maxHP ?? 100),
    hp: Number(stats.hp ?? stats.maxHP ?? 100),
    maxStamina: Number(stats.maxStamina ?? 100),
    stamina: Number(stats.stamina ?? stats.maxStamina ?? 100),
    maxMana: Number(stats.maxMana ?? 50),
    mana: Number(stats.mana ?? stats.maxMana ?? 50),
    armor: Number(stats.armor ?? 0),
    levelPoints: Number(stats.levelPoints ?? 0),
    level: Number(stats.level ?? 1),
    xp: Number(stats.xp ?? 0),
  };
}
function snapshotInventory(inv) {
  if (!inv) return null;

  const itemIds = Array.isArray(inv.items)
    ? inv.items.map(it => it?.id).filter(Boolean)
    : [];

  const eq = inv.equipment || { weapon: null, shield: null, helmet: null };
  const equipment = {
    weapon: eq.weapon?.id ?? null,
    shield: eq.shield?.id ?? null,
    helmet: eq.helmet?.id ?? null,
  };

  return { itemIds, equipment };
}
function snapshotGame() {
  const gm = gameManager;
  const stats = gm.controller?.stats ? snapshotStats(gm.controller.stats) : null;
  const inventory = gm.inventory ? snapshotInventory(gm.inventory) : null;
  const position = gm.controller?.player?.model?.position;
  const bridgeCreated = gm.bridgeCreated;

  return {
    bridgeCreated,
    position,
    stats,
    inventory,
    wolvesKilled: Number(gm.wolvesKilled || 0),
    archersKilled: Number(gm.archersKilled || 0),
    activatedStones: gm.activatedStones,
  };
}
function applyStats(gm, s) {
  if (!s) return false;
  const stats = gm.controller?.stats;
  if (!stats) return false;

  // Massimali prima
  stats.maxHP = Number(s.maxHP ?? stats.maxHP);
  stats.maxStamina = Number(s.maxStamina ?? stats.maxStamina);
  stats.maxMana = Number(s.maxMana ?? stats.maxMana);

  // Valori correnti clampati ai massimali
  stats.hp = Math.min(Number(s.hp ?? stats.hp), stats.maxHP);
  stats.stamina = Math.min(Number(s.stamina ?? stats.stamina), stats.maxStamina);
  stats.mana = Math.min(Number(s.mana ?? stats.mana), stats.maxMana);

  stats.armor = Number(s.armor ?? stats.armor);
  stats.levelPoints = Number(s.levelPoints ?? stats.levelPoints);
  stats.level = Number(s.level ?? stats.level);
  stats.xp = Number(s.xp ?? stats.xp);

  if (typeof stats._notify === 'function') stats._notify();
  return true;
}
function applyInventory(gm, invSnap) {
  if (!invSnap) return false;
  const inv = gm.inventory;
  if (!inv) return false;

  // Ricostruzione oggetti dall'ID
  const items = (invSnap.itemIds || [])
    .map(id => getItemById(id))
    .filter(Boolean);

  inv.items = items;
  inv.equipment = { weapon: null, shield: null, helmet: null };

  // Equip (ricostruisco oggetto e poi uso i metodi dell'inventory)
  const equipId = invSnap.equipment || {};
  const equipIfPresent = (slot, id) => {
    if (!id) return;
    inv.equip(id, slot); // aggiorna stats + visibilità
  };
  equipIfPresent('weapon', equipId.weapon);
  equipIfPresent('shield', equipId.shield);
  equipIfPresent('helmet', equipId.helmet);

  if (typeof inv._emit === 'function') inv._emit();
  return true;
}
function applySnapshot(snapshot) {
  const gm = createGameManager();
  let needDefer = false;

  // Progress semplici
  gm.wolvesKilled = Number(snapshot.wolvesKilled ?? (gm.wolvesKilled || 0));
  gm.archersKilled = Number(snapshot.archersKilled ?? (gm.archersKilled || 0));
  gm.activatedStones = snapshot.activatedStones;
  gm.savedPos = snapshot.position;
  gm.bridgeCreated = snapshot.bridgeCreated;
  console.log("SAVED POS", snapshot.position);
  // Stats
  const statsApplied = applyStats(gm, snapshot.stats);
  if (snapshot.stats && !statsApplied) needDefer = true;

  // Inventory
  const invApplied = applyInventory(gm, snapshot.inventory);
  if (snapshot.inventory && !invApplied) needDefer = true;

  return !needDefer;
}
export function saveGame() {
  try {
    const data = snapshotGame();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    console.log('[SaveManager] Salvato:', data);
    return true;
  } catch (e) {
    console.error('[SaveManager] Errore salvataggio', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      console.warn('[SaveManager] Nessun salvataggio trovato');
      return false;
    }
    const data = JSON.parse(raw);
    const ok = applySnapshot(data);

    if (!ok) {
      _pending = data; // applico dopo l'init completo (controller+inventory creati)
      console.log('[SaveManager] Snapshot in attesa (verrà applicato dopo init)');
    } else {
      _pending = null;
    }
    console.log('[SaveManager] Caricato:', data);
    return true;
  } catch (e) {
    console.error('[SaveManager] Errore caricamento', e);
    return false;
  }
}

export function applyPendingSave() {
  if (!_pending) return false;
  const ok = applySnapshot(_pending);
  if (ok) {
    console.log('[SaveManager] Snapshot in attesa applicato.');
    _pending = null;
  } else {
    console.warn('[SaveManager] Snapshot ancora non applicabile (mancano sistemi).');
  }
  return ok;
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    console.log('[SaveManager] Salvataggio eliminato');
    return true;
  } catch (e) {
    console.error('[SaveManager] Errore rimozione salvataggio', e);
    return false;
  }
}
