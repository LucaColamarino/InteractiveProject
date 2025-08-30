// systems/GroundSystem.js
import * as THREE from 'three';
import { getTerrainHeightAt } from '../map/map.js';

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _from = new THREE.Vector3();
const _UP   = new THREE.Vector3(0, 1, 0);

/** Walkables statici (bridge, piattaforme) con AABB su XZ */
export const walkables = []; // { object, minX, maxX, minZ, maxZ }

export function registerWalkable(obj3d, { padding = 0.5 } = {}) {
  if (!obj3d) return;
  const box = new THREE.Box3().setFromObject(obj3d);
  walkables.push({
    object: obj3d,
    minX: box.min.x - padding,
    maxX: box.max.x + padding,
    minZ: box.min.z - padding,
    maxZ: box.max.z + padding,
  });
}

export function unregisterWalkable(obj3d) {
  const i = walkables.findIndex(w => w.object === obj3d);
  if (i >= 0) walkables.splice(i, 1);
}

/** No-go (acqua): terreno sotto questa Y è vietato, salvo walkable sopra */
let _noGoLevel = null;   // es. water.position.y
let _noGoPad   = 0.05;   // piccolo margine per non “bagnare i piedi”
export function setNoGoLevel(levelY, pad = 0.05) {
  _noGoLevel = levelY;
  _noGoPad   = pad;
}

/** Ritorna la Y del suolo considerando terrain + (solo se dentro AABB) walkables */
export function getGroundHeightAtXZ(x, z, {
  fromY = 200,
  maxDistance = 400,
  upDotMin = 0.2,
} = {}) {
  let bestY = (typeof getTerrainHeightAt === 'function') ? getTerrainHeightAt(x, z) : -Infinity;

  for (const w of walkables) {
    if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;

    _from.set(x, fromY, z);
    _ray.set(_from, _down);
    _ray.far = maxDistance;

    const hit = _ray.intersectObject(w.object, true)[0];
    if (!hit) continue;

    if (hit.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(_UP) < upDotMin) continue; // scarta superfici troppo verticali
    }

    if (hit.point.y > bestY) bestY = hit.point.y;
  }
  return bestY;
}

/**
 * Ritorna true se (x,z) è “vietato” dall’acqua:
 * - terrainY < noGoLevel+pad
 * - e NON c’è un walkable sopra (entro i box candidati) con hitY >= noGoLevel+pad
 */
export function isBlockedByWater(x, z, {
  fromY = 200,
  maxDistance = 400,
  upDotMin = 0.2,
} = {}) {
  if (_noGoLevel == null) return false;

  const limitY = _noGoLevel + _noGoPad;
  const terrainY = (typeof getTerrainHeightAt === 'function') ? getTerrainHeightAt(x, z) : -Infinity;

  // Se il terreno è già sopra il livello acqua → ok, non bloccare
  if (terrainY >= limitY) return false;

  // Altrimenti, consenti solo se c'è un walkable sopra il limite
  for (const w of walkables) {
    if (x < w.minX || x > w.maxX || z < w.minZ || z > w.maxZ) continue;

    _from.set(x, fromY, z);
    _ray.set(_from, _down);
    _ray.far = maxDistance;

    const hit = _ray.intersectObject(w.object, true)[0];
    if (!hit) continue;

    if (hit.face) {
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (n.dot(_UP) < upDotMin) continue;
    }

    if (hit.point.y >= limitY) {
      // c'è un ponte/piattaforma sopra l'acqua → non bloccare
      return false;
    }
  }

  // Niente walkable sopra: è acqua → blocca
  return true;
}
