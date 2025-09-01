import * as THREE from 'three';
import { camera, scene } from '../scene.js';
import { getCameraAngles } from '../systems/InputSystem.js';
import { getEnemies } from '../enemies/EnemyManager.js';

export let offset = new THREE.Vector3(0, 3, -6);

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const V4 = new THREE.Vector3();
const VUP = new THREE.Vector3(0, 1, 0);
const QT = new THREE.Quaternion();
const targetPos = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();
const _occluders = [];
export function setOccluders(roots = []) {
  _occluders.length = 0;
  for (const r of roots) if (r) _occluders.push(r);
}
const _cin = {
  active: false,
  point: new THREE.Vector3(),
  height: 1.2,
  stiffness: 6.0,
};
export function setCameraFocus(point, { height = 1.2, stiffness = 6 } = {}) {
  _cin.active = true;
  _cin.point.copy(point || V1.set(0,0,0));
  _cin.height = height;
  _cin.stiffness = stiffness;
}
export function isCinematicFocus() { return _cin.active; }

const _lock = {
  active: false,
  target: null,           
  height: 1.5,
  stiffness: 8.0,
  maxRange: 25,
  fovDeg: 45,
  losGrace: 0.8,   
  _noLosTimer: 0,
  shoulder: 0.9,
  midBias: 0.55,
  zoomMin: 0.9,
  zoomMax: 1.35,
  zoomNear: 2.0,
  zoomFar: 20.0,
  _losInterval: 0.10,
  _losAccumulator: 0,
  _lastVisOk: true,
};
const _ray = new THREE.Raycaster();
_ray.params.Sprite = _ray.params.Sprite || {};
_ray.params.Sprite.threshold = 0;
export function isLockOn() { return _lock.active; }
export function lockOnEnemy(enemyEntity, {
  height = 1.5, stiffness = 8, maxRange = 25, fovDeg = 45,
  shoulder = 0.9, midBias = 0.55,
  zoomMin = 0.9, zoomMax = 1.35, zoomNear = 2.0, zoomFar = 20.0,
  losInterval = 0.10,
} = {}) {
  _lock.active = true;
  _lock.target = enemyEntity || null;
  _lock.height = height;
  _lock.stiffness = stiffness;
  _lock.maxRange = maxRange;
  _lock.fovDeg = fovDeg;
  _lock._noLosTimer = 0;
  _lock.shoulder = shoulder;
  _lock.midBias = THREE.MathUtils.clamp(midBias, 0, 1);
  _lock.zoomMin = zoomMin;
  _lock.zoomMax = zoomMax;
  _lock.zoomNear = zoomNear;
  _lock.zoomFar = zoomFar;
  _lock._losInterval = Math.max(0.03, losInterval);
  _lock._losAccumulator = 0;
  _lock._lastVisOk = true;
}
export function clearLockOn() {
  _lock.active = false;
  _lock.target = null;
}
export function clearCameraFocus() {
  _cin.active = false;
  _lock.active = false;
  _lock.target = null;
}
export function focusNearestEnemy(player, maxRange = 25, fovDeg = 45) {
  if (!player?.model) return;
  const enemies = getEnemies() || [];
  let bestE = null, bestDist = Infinity;
  for (const e of enemies) {
    const okv = _visibleFrom(player, e, maxRange, fovDeg);
    if (!okv.ok) continue;
    if (okv.dist < bestDist) { bestDist = okv.dist; bestE = e; }
  }
  if (bestE) lockOnEnemy(bestE, { maxRange, fovDeg });
  else clearLockOn();
}
function _isDescendantOf(obj, root) {
  for (let cur = obj; cur; cur = cur.parent) {
    if (cur === root) return true;
  }
  return false;
}
function _visibleFrom(playerEntity, enemyEntity, maxRange, fovDeg) {
  const playerObj = playerEntity?.model;
  const enemyObj  = enemyEntity?.model;
  if (!playerObj || !enemyObj) return { ok: false, dist: Infinity };
  const playerPos = playerObj.position;
  const enemyPos  = enemyObj.position;
  const dist = V1.subVectors(enemyPos, playerPos).length();
  if (dist > maxRange) return { ok: false, dist };

  camera.getWorldDirection(V2).normalize();
  const rayOrigin = V3.copy(camera.position)
    .addScaledVector(V2, 0.35)
    .add(VUP.set(0, 0.20, 0));
  const toEnemyFromCam = V4.subVectors(enemyPos, rayOrigin).normalize();
  const dot = THREE.MathUtils.clamp(V2.dot(toEnemyFromCam), -1, 1);
  const angleDeg = Math.acos(dot) * 180 / Math.PI;
  if (angleDeg > fovDeg) return { ok: false, dist };
  const dir = V2.copy(toEnemyFromCam);
  _ray.set(rayOrigin, dir);
  _ray.far = rayOrigin.distanceTo(enemyPos) + 0.001;
  _ray.camera = camera;
  const pool = _occluders.length ? _occluders : [scene];
  let hits = [];
  try {
    hits = _ray.intersectObjects(pool, true);
  } catch (e) {
    console.warn('[Lock] Raycast error (ignorato):', e);
    return { ok: true, dist };
  }

  let firstBlock = null;
  for (let i = 0; i < hits.length; i++) {
    const o = hits[i].object;
    if (o?.userData?.noPick) continue;
    if (playerObj && _isDescendantOf(o, playerObj)) continue;
    if (enemyObj  && _isDescendantOf(o, enemyObj))  continue;
    firstBlock = hits[i];
    break;
  }
  const distToEnemy = rayOrigin.distanceTo(enemyPos);
  const ok = !firstBlock || (firstBlock.distance >= distToEnemy - 0.25);
  return { ok, dist };
}
export function updateCamera(player, delta = 0) {
  if (!player?.model) return;
  const { yaw, pitch } = getCameraAngles();
  const yawRad = THREE.MathUtils.degToRad(yaw);
  const pitchRad = THREE.MathUtils.degToRad(pitch);
  const baseDistance = offset.length();
  let distanceMultiplier = 1.0;
  let enemyPosForLook = null;
  if (_lock.active && _lock.target?.model?.position) {
    enemyPosForLook = _lock.target.model.position;
    const dPT = player.model.position.distanceTo(enemyPosForLook);
    const t = THREE.MathUtils.clamp(
      (dPT - _lock.zoomNear) / (_lock.zoomFar - _lock.zoomNear), 0, 1
    );
    distanceMultiplier = THREE.MathUtils.lerp(_lock.zoomMin, _lock.zoomMax, t);
  }

  const useDistance = baseDistance * distanceMultiplier;
  const cosPitch = Math.cos(pitchRad);
  const offsetX = useDistance * Math.sin(yawRad) * cosPitch;
  const offsetY = useDistance * Math.sin(pitchRad);
  const offsetZ = useDistance * Math.cos(yawRad) * cosPitch;
  const desiredPos = V1.set(
    player.model.position.x + offsetX,
    player.model.position.y + offsetY + 1.5,
    player.model.position.z + offsetZ
  );
  if (enemyPosForLook) {
    V2.subVectors(enemyPosForLook, player.model.position).setY(0);
    if (V2.lengthSq() > 1e-6) {
      V2.normalize();
      V3.crossVectors(VUP.set(0,1,0), V2).normalize().multiplyScalar(_lock.shoulder);
      desiredPos.add(V3);
    }
  }
  const sPos = 1 - Math.exp(-6 * delta);
  targetPos.lerp(desiredPos, sPos);
  if (_lock.active && _lock.target?.model?.position) {
    const pHead = V2.copy(player.model.position).add(V3.set(0, 1.5, 0));
    const eHead = V4.copy(enemyPosForLook).add(VUP.set(0, _lock.height, 0));
    const mid = pHead.lerp(eHead, _lock.midBias);
    const sLook = 1 - Math.exp(-_lock.stiffness * delta);
    targetLookAt.lerp(mid, sLook);
    _lock._losAccumulator += delta;
    if (_lock._losAccumulator >= _lock._losInterval) {
      _lock._losAccumulator = 0;
      const vis = _visibleFrom(player, _lock.target, _lock.maxRange, _lock.fovDeg);
      _lock._lastVisOk = vis.ok;
      if (!vis.ok) {
        _lock._noLosTimer += _lock._losInterval;
        if (_lock._noLosTimer > _lock.losGrace) clearLockOn();
      } else {
        _lock._noLosTimer = 0;
      }
    } else {
      if (!_lock._lastVisOk) {
        _lock._noLosTimer += delta;
        if (_lock._noLosTimer > _lock.losGrace) clearLockOn();
      }
    }
  } else if (_cin.active) {
    const focusTarget = V1.set(_cin.point.x, _cin.point.y + _cin.height, _cin.point.z);
    targetLookAt.lerp(focusTarget, 1 - Math.exp(-_cin.stiffness * delta));
  } else {
    const playerHead = V1.copy(player.model.position).add(V2.set(0, 1.5, 0));
    targetLookAt.lerp(playerHead, 1 - Math.exp(-6 * delta));
  }
  camera.position.copy(targetPos);
  camera.lookAt(targetLookAt);
  if (_lock.active && !_lock.target?.model?.position) {
    clearLockOn();
  }
}
export function getLockHeadingYaw(player) {
  if (!_lock.active || !_lock.target?.model?.position || !player?.model) return null;
  const p = player.model.position;
  const e = _lock.target.model.position;
  const dx = e.x - p.x;
  const dz = e.z - p.z;
  return THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
}
export function updatePlayerFacingToLock(player, delta = 0, { turnSpeed = 12, yawOffset = 0 } = {}) {
  if (!_lock.active || !_lock.target?.model?.position || !player?.model) return;
  const p = player.model.position;
  const e = _lock.target.model.position;
  const dx = e.x - p.x;
  const dz = e.z - p.z;
  if (dx * dx + dz * dz < 1e-6) return;
  const desiredYaw = Math.atan2(dx, dz) + yawOffset;
  QT.setFromAxisAngle(VUP.set(0,1,0), desiredYaw);
  const t = 1 - Math.exp(-turnSpeed * delta);
  player.model.quaternion.slerp(QT, t);
}
