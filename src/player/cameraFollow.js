// player/cameraFollow.js
import * as THREE from 'three';
import { camera, scene } from '../scene.js';
import { getCameraAngles } from '../systems/InputSystem.js';
import { getEnemies } from '../enemies/EnemyManager.js';

export let offset = new THREE.Vector3(0, 3, -6);

const targetPos = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();
const _tmp = new THREE.Vector3();

// =============== MODALITÀ CINEMATICA (punto: es. falò) ===============
const _cin = {
  active: false,
  point: new THREE.Vector3(),
  height: 1.2,
  stiffness: 6.0,
};

export function setCameraFocus(point, { height = 1.2, stiffness = 6 } = {}) {
  _cin.active = true;
  _cin.point.copy(point || new THREE.Vector3());
  _cin.height = height;
  _cin.stiffness = stiffness;
}

export function isCinematicFocus() { return _cin.active; }

// =============== MODALITÀ LOCK-ON (nemico) ===============
const _lock = {
  active: false,
  target: null,           // entity con .model.position
  height: 1.5,
  stiffness: 8.0,
  maxRange: 25,
  fovDeg: 45,
  losGrace: 0.8,          // secondi senza LOS prima di sganciare
  _noLosTimer: 0,
  shoulder: 0.9,          // spalla laterale (m)
  midBias: 0.55,          // quanto spostare il mid verso il nemico (0..1)
  zoomMin: 0.9,           // moltiplicatore offset quando target molto vicino
  zoomMax: 1.35,          // moltiplicatore offset quando target lontano
  zoomNear: 2.0,          // distanza player-target per zoomMin
  zoomFar: 20.0,          // distanza player-target per zoomMax
};

const _ray = new THREE.Raycaster();

export function isLockOn() { return _lock.active; }

export function lockOnEnemy(enemyEntity, {
  height = 1.5, stiffness = 8, maxRange = 25, fovDeg = 45,
  shoulder = 0.9, midBias = 0.55,
  zoomMin = 0.9, zoomMax = 1.35, zoomNear = 2.0, zoomFar = 20.0,
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
}

export function clearLockOn() {
  _lock.active = false;
  _lock.target = null;
}

// Per compatibilità: pulisce entrambe le modalità (cinematica e lock-on)
export function clearCameraFocus() {
  _cin.active = false;
  _lock.active = false;
  _lock.target = null;
}

// Cerca il nemico valido più vicino nel FOV davanti alla camera e attiva il lock
export function focusNearestEnemy(player, maxRange = 25, fovDeg = 45) {
  if (!player?.model) return;

  const enemies = getEnemies() || [];
  let bestE = null, bestDist = Infinity;

  for (const e of enemies) {
    const okv = _visibleFrom(player, e, maxRange, fovDeg);
    if (!okv.ok) continue;
    if (okv.dist < bestDist) { bestDist = okv.dist; bestE = e; }
  }

  if (bestE) {
    lockOnEnemy(bestE, { maxRange, fovDeg });
  } else {
    clearLockOn();
  }
}

// === utils: ancestry check per filtrare player/nemico nel ray ===
function _isDescendantOf(obj, root) {
  for (let cur = obj; cur; cur = cur.parent) {
    if (cur === root) return true;
  }
  return false;
}

// =============== VISIBILITÀ (FOV/RANGE/LOS) ===============
// FOV 3D dalla camera; LOS con origine spostata avanti+alto e filtro di player/nemico
function _visibleFrom(playerEntity, enemyEntity, maxRange, fovDeg) {
  const playerObj = playerEntity?.model;
  const enemyObj  = enemyEntity?.model;
  if (!playerObj || !enemyObj) return { ok: false, dist: Infinity };

  const playerPos = playerObj.position;
  const enemyPos  = enemyObj.position;

  // 1) Range (player→nemico)
  const dist = _tmp.subVectors(enemyPos, playerPos).length();
  if (dist > maxRange) return { ok: false, dist };

  // 2) FOV (camera→nemico contro forward camera)
  const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();

  // Origine del raggio leggermente avanti e un po' in alto per evitare il player
  const rayOrigin = camera.position.clone()
    .add(camFwd.clone().multiplyScalar(0.35))   // avanti ~35 cm
    .add(new THREE.Vector3(0, 0.20, 0));        // su ~20 cm

  const toEnemyFromCam = new THREE.Vector3().subVectors(enemyPos, rayOrigin).normalize();
  const dot = THREE.MathUtils.clamp(camFwd.dot(toEnemyFromCam), -1, 1);
  const angle = Math.acos(dot) * 180 / Math.PI;
  if (angle > fovDeg) return { ok: false, dist };

  // 3) Line-of-sight (camera → nemico) con filtro
  const dir = new THREE.Vector3().subVectors(enemyPos, rayOrigin).normalize();
  _ray.set(rayOrigin, dir);
  _ray.far = rayOrigin.distanceTo(enemyPos) + 0.001;

  const hits = _ray.intersectObjects(scene.children, true);

  // Trova il primo "vero" ostacolo che non sia parte del player o del nemico
  let firstBlock = null;
  for (const h of hits) {
    const o = h.object;
    if (playerObj && _isDescendantOf(o, playerObj)) continue;
    if (enemyObj  && _isDescendantOf(o, enemyObj))  continue;
    firstBlock = h;
    break;
  }

  const distToEnemy = rayOrigin.distanceTo(enemyPos);
  const ok = !firstBlock || (firstBlock.distance >= distToEnemy - 0.25);
  return { ok, dist };
}

// =============== UPDATE CAMERA ===============
export function updateCamera(player, delta = 0) {
  if (!player?.model) return;

  const { yaw, pitch } = getCameraAngles();
  const yawRad = THREE.MathUtils.degToRad(yaw);
  const pitchRad = THREE.MathUtils.degToRad(pitch);

  // base offset (dietro/alto il player)
  let baseDistance = offset.length();
  let distanceMultiplier = 1.0;

  // Se lock-on, adatta lo zoom in base alla distanza player-target
  let enemyPosForLook = null;
  if (_lock.active && _lock.target?.model?.position) {
    enemyPosForLook = _lock.target.model.position;
    const dPT = player.model.position.distanceTo(enemyPosForLook);
    const t = THREE.MathUtils.clamp((dPT - _lock.zoomNear) / (_lock.zoomFar - _lock.zoomNear), 0, 1);
    distanceMultiplier = THREE.MathUtils.lerp(_lock.zoomMin, _lock.zoomMax, t);
  }

  const useDistance = baseDistance * distanceMultiplier;
  const offsetX = useDistance * Math.sin(yawRad) * Math.cos(pitchRad);
  const offsetY = useDistance * Math.sin(pitchRad);
  const offsetZ = useDistance * Math.cos(yawRad) * Math.cos(pitchRad);

  // posizione desiderata dietro al player
  const desiredPos = new THREE.Vector3(
    player.model.position.x + offsetX,
    player.model.position.y + offsetY + 1.5,
    player.model.position.z + offsetZ
  );

  // Se lock-on → spalla laterale per vedere meglio entrambi
  if (enemyPosForLook) {
    const toEnemy = _tmp.subVectors(enemyPosForLook, player.model.position).setY(0);
    if (toEnemy.lengthSq() > 1e-6) {
      toEnemy.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const side = new THREE.Vector3().crossVectors(up, toEnemy).normalize().multiplyScalar(_lock.shoulder);
      desiredPos.add(side);
    }
  }

  // Ease posizione
  const sPos = 1 - Math.exp(-6 * delta);
  targetPos.lerp(desiredPos, sPos);

  // ====== LOOK TARGET ======
  if (_lock.active && _lock.target?.model?.position) {
    // Mid-point (bias verso il nemico) per inquadrare player + target
    const pHead = player.model.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    const eHead = enemyPosForLook.clone().add(new THREE.Vector3(0, _lock.height, 0));
    const mid = pHead.clone().lerp(eHead, _lock.midBias);
    targetLookAt.lerp(mid, 1 - Math.exp(-_lock.stiffness * delta));

    // Controlli auto-clear: FOV/range/LOS (usa la nuova versione che filtra player/enemy)
    const vis = _visibleFrom(player, _lock.target, _lock.maxRange, _lock.fovDeg);
    if (!vis.ok) {
      _lock._noLosTimer += delta;
      if (_lock._noLosTimer > _lock.losGrace) clearLockOn();
    } else {
      _lock._noLosTimer = 0;
    }
  } else if (_cin.active) {
    // Cinematic: guarda il punto (non tocca la posizione camera)
    const focusTarget = new THREE.Vector3(_cin.point.x, _cin.point.y + _cin.height, _cin.point.z);
    targetLookAt.lerp(focusTarget, 1 - Math.exp(-_cin.stiffness * delta));
  } else {
    // Default: guarda il player
    const playerHead = player.model.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    targetLookAt.lerp(playerHead, 1 - Math.exp(-6 * delta));
  }

  // Applica
  camera.position.copy(targetPos);
  camera.lookAt(targetLookAt);

  // Failsafe: se il lock è attivo ma il target è andato via
  if (_lock.active && !_lock.target?.model?.position) {
    clearLockOn();
  }
}

// =============== Direzione (yaw) player → target per movimento in lock ===============
export function getLockHeadingYaw(player) {
  if (!_lock.active || !_lock.target?.model?.position || !player?.model) return null;
  const p = player.model.position;
  const e = _lock.target.model.position;
  const dx = e.x - p.x;
  const dz = e.z - p.z;
  // stessa convenzione del resto: sin(yaw)->X, cos(yaw)->Z
  return THREE.MathUtils.radToDeg(Math.atan2(dx, dz));
}

// =============== Facing del player verso il target (lock-on) ===============
const _UP = new THREE.Vector3(0, 1, 0);
const _QTMP = new THREE.Quaternion();

/**
 * Ruota dolcemente il player per guardare il nemico lockato.
 * @param {*} player           entity con .model (THREE.Object3D)
 * @param {number} delta       dt del frame
 * @param {object} opts
 * @param {number} opts.turnSpeed  velocità rotazione (rad/s "morbida"): 10 ~ 14 consigliato
 * @param {number} opts.yawOffset  offset opzionale se il modello guarda +Z (usa Math.PI se vedi 180° di errore)
 */
export function updatePlayerFacingToLock(player, delta = 0, { turnSpeed = 12, yawOffset = 0 } = {}) {
  if (!_lock.active || !_lock.target?.model?.position || !player?.model) return;

  const p = player.model.position;
  const e = _lock.target.model.position;

  // Direzione orizzontale verso il target
  const dx = e.x - p.x;
  const dz = e.z - p.z;
  if (dx * dx + dz * dz < 1e-6) return; // troppo vicino

  const desiredYaw = Math.atan2(dx, dz) + yawOffset;

  // Quaternion target: rotazione intorno a Y (yaw)
  _QTMP.setFromAxisAngle(_UP, desiredYaw);

  // Slerp "critically damped"
  const t = 1 - Math.exp(-turnSpeed * delta);
  player.model.quaternion.slerp(_QTMP, t);
}
