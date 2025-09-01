import * as THREE from 'three';
import { getTerrainHeightAt } from '../map/map.js';

const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _from = new THREE.Vector3();
const _UP   = new THREE.Vector3(0, 1, 0);
export const walkables = [];
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
// No-go (waterlevel) 
let _noGoLevel = null; 
let _noGoPad   = 0.05;
export function setNoGoLevel(levelY, pad = 0.05) {
  _noGoLevel = levelY;
  _noGoPad   = pad;
}
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
      if (n.dot(_UP) < upDotMin) continue; // too vertical
    }
    if (hit.point.y > bestY) bestY = hit.point.y;
  }
  return bestY;
}
export function isBlockedByWater(x, z, {
  fromY = 200,
  maxDistance = 400,
  upDotMin = 0.2,
} = {}) {
  if (_noGoLevel == null) return false;

  const limitY = _noGoLevel + _noGoPad;
  const terrainY = (typeof getTerrainHeightAt === 'function') ? getTerrainHeightAt(x, z) : -Infinity;
  if (terrainY >= limitY) return false;
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
      return false;
    }
  }
  return true;
}
