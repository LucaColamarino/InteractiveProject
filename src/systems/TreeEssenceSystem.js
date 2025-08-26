// src/systems/TreeEssenceSystem.js
import { trees } from '../spawners/vegetationSpawner.js';

export const TREE_ESSENCE_CFG = {
  maxEssence: 100,         // scorta per sito albero
  regenPerSec: 2,          // rigenera quando non drenato
  drainPerSec: 25,         // quanto svuoti dall’albero (tasso “grezzo”)
  minInteractDist: 3.0,    // distanza massima per iniziare/tenere il canale
  emptyCooldown: 20,       // secondi “spoglio” prima di rigenerare
};

// Stato per-sito: key "x|z" (coordinate intere del sito albero)
const _essenceBySite = new Map();

function _keyFromXZ(x, z) {
  // quantizziamo a 1 unità per avere una chiave stabile
  return `${Math.round(x)}|${Math.round(z)}`;
}

function _getOrInitSite(x, z) {
  const k = _keyFromXZ(x, z);
  let s = _essenceBySite.get(k);
  if (!s) {
    s = { x, z, current: TREE_ESSENCE_CFG.maxEssence, cooldown: 0, lastDrainAt: -1 };
    _essenceBySite.set(k, s);
  }
  return s;
}

/** Call ogni frame per rigenerazione passiva/cooldown */
export function tickTrees(dt) {
  for (const s of _essenceBySite.values()) {
    if (s.cooldown > 0) {
      s.cooldown -= dt;
      if (s.cooldown < 0) s.cooldown = 0;
      continue;
    }
    if (s.current < TREE_ESSENCE_CFG.maxEssence) {
      s.current = Math.min(TREE_ESSENCE_CFG.maxEssence, s.current + TREE_ESSENCE_CFG.regenPerSec * dt);
    }
  }
}

/** Trova un “sito albero” drenabile vicino alla posizione del player */
export function findDrainableTree(playerPos) {
  if (!trees) return null;
  const site = trees.findClosestTree(playerPos.x, playerPos.z, TREE_ESSENCE_CFG.minInteractDist);
  if (!site) return null;
  const s = _getOrInitSite(site.x, site.z);
  if (s.cooldown > 0 || s.current <= 0) return null;
  return s; // {x,z,current,cooldown}
}

/** Drena dal sito selezionato. Ritorna la quantità drenata in questo frame. */
export function drainOnce(site, wantPerSec, dt) {
  if (!site) return 0;
  if (site.cooldown > 0 || site.current <= 0) return 0;

  const amount = Math.min(wantPerSec * dt, site.current);
  site.current -= amount;

  if (site.current <= 0) {
    site.current = 0;
    site.cooldown = TREE_ESSENCE_CFG.emptyCooldown;
  }
  site.lastDrainAt = performance.now() / 1000;
  return amount;
}

/** Facoltativo: percentuale di foglie (per effetti visual, 1=folto, 0=spoglio) */
export function getLeafDensity(site) {
  if (!site) return 1;
  return Math.max(0, site.current / TREE_ESSENCE_CFG.maxEssence);
}
