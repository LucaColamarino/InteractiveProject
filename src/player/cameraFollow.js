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

// Cerca il nemico valido più vicino nel FOV davanti al player e attiva il lock
export function focusNearestEnemy(player, maxRange = 25, fovDeg = 45) {
  if (!player?.model) return;

  const enemies = getEnemies() || [];
  let bestE = null, bestDist = Infinity;

  const playerPos = player.model.position;
  const yawRad = THREE.MathUtils.degToRad(getCameraAngles().yaw);

  for (const e of enemies) {
    const pos = e?.model?.position;
    if (!pos) continue;

    const v = _visibleFrom(playerPos, yawRad, pos, maxRange, fovDeg);
    if (!v.ok) continue;
    if (v.dist < bestDist) { bestDist = v.dist; bestE = e; }
  }

  if (bestE) {
    lockOnEnemy(bestE, { maxRange, fovDeg });
  } else {
    clearLockOn();
  }
}

// =============== VISIBILITÀ (FOV/RANGE/LOS) ===============
function _visibleFrom(playerPos, _camYawRad_UNUSED, enemyPos, maxRange, fovDeg) {
  // 1) Range: usa la distanza player→nemico (come prima)
  const dist = new THREE.Vector3().subVectors(enemyPos, playerPos).length();
  if (dist > maxRange) return { ok: false, dist };

  // 2) FOV: usa il forward REALE della camera e il vettore camera→nemico
  const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const toEnemyFromCam = new THREE.Vector3().subVectors(enemyPos, camera.position).normalize();

  const dot = THREE.MathUtils.clamp(camFwd.dot(toEnemyFromCam), -1, 1);
  const angle = Math.acos(dot) * 180 / Math.PI; // gradi
  if (angle > fovDeg) return { ok: false, dist };

  // 3) Line-of-sight: raggio dalla camera al nemico
  const dir = new THREE.Vector3().subVectors(enemyPos, camera.position).normalize();
  _ray.set(camera.position, dir);

  // TODO: se vuoi, filtra i "blockers" invece di scene.children
  const hits = _ray.intersectObjects(scene.children, true);

  const distToEnemy = camera.position.distanceTo(enemyPos);
  const ok = (hits.length === 0) || (hits[0].distance >= distToEnemy - 0.25);
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

    // Controlli auto-clear: FOV/range/LOS
    const vis = _visibleFrom(player.model.position, yawRad, enemyPosForLook, _lock.maxRange, _lock.fovDeg);
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
