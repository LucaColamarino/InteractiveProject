// src/spawners/npcSpawner.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { ENTITY_CONFIG } from '../utils/entities.js';
import { instantiateEntity, buildMixerAndActions, preloadEntity } from '../utils/entityFactory.js';
import { Animator } from '../components/Animator.js';

import { registerEnemy } from '../enemies/EnemyManager.js';
import { ArcherEnemy } from '../enemies/controllers/ArcherEnemy.js';
import { WerewolfEnemy } from '../enemies/controllers/WerewolfEnemy.js';
import { WyvernEnemy } from '../enemies/controllers/WyvernEnemy.js';

import { spawnArrowProjectile } from '../combat/projectiles/ArrowProjectile.js';
// -----------------------------------------------------

function _chooseController(type, opts) {
  switch (type) {
    case 'archer':   return new ArcherEnemy(opts);
    case 'werewolf': return new WerewolfEnemy(opts);
    case 'wyvern':   return new WyvernEnemy(opts);
    default:         return new ArcherEnemy(opts);
  }
}

async function spawnEnemy(configKey, position, typeOverride = null) {
  const cfg = ENTITY_CONFIG[configKey];
  if (!cfg) { console.warn('[NPC] config mancante:', configKey); return; }

  try { await preloadEntity(configKey); }
  catch (e) { console.warn('[NPC] preload fallito:', configKey, e); }

  const fbx = instantiateEntity(configKey);

  const terrainY = getTerrainHeightAt(position.x, position.z);
  const yOffset = cfg.yOffset ?? 0;
  const startY = Number.isFinite(terrainY) ? (terrainY + yOffset) : yOffset;
  fbx.position.set(position.x, startY, position.z);
  scene.add(fbx);

  let mixer = null, actions = {};
  try {
    const res = await buildMixerAndActions(fbx, cfg);
    mixer = res?.mixer || null;
    actions = res?.actions || {};
  } catch (e) {
    console.warn('[NPC] buildMixerAndActions error:', configKey, e);
  }

  const type = typeOverride || configKey;

  const baseOpts = {
    type,
    model: fbx,
    mixer,
    actions,
    yOffset,
    speed: cfg.speed ?? 1.0,
    maxUpdateDistance: cfg.maxUpdateDistance ?? 250,
    forwardYawOffsetDeg: cfg.forwardYawOffsetDeg ?? 0,
  };

  if (type === 'wyvern') {
    baseOpts.altitude  = cfg.altitude  ?? (10 + Math.random() * 6);
    baseOpts.flyTime   = cfg.flyTime   ?? 10;
    baseOpts.walkTime  = cfg.walkTime  ?? 5;
    baseOpts.flySpeed  = cfg.flySpeed  ?? 5.0;
    baseOpts.walkSpeed = cfg.walkSpeed ?? 1.2;
  }

  const ctrl = _chooseController(type, baseOpts);

  // aggancia Animator centrale
  const animator = new Animator({ mixer, actions }, () => ctrl.state);
  ctrl.animator = animator;

  // ---- Hook specifico per arciere ----
  if (type === 'archer') {
    ctrl.arrowMesh = fbx.userData?.attachments?.arrow || null;

    // ---- helpers per orientamento corretto ----
    const AX = {
      '+X': new THREE.Vector3( 1, 0, 0), '-X': new THREE.Vector3(-1, 0, 0),
      '+Y': new THREE.Vector3( 0, 1, 0), '-Y': new THREE.Vector3( 0,-1, 0),
      '+Z': new THREE.Vector3( 0, 0, 1), '-Z': new THREE.Vector3( 0, 0,-1),
    };

    function _firstMesh(o) {
      let mesh = null;
      o.traverse(n => { if (!mesh && n.isMesh) mesh = n; });
      return mesh;
    }

    function guessLocalAxes(visual, dir) {
      const mesh = _firstMesh(visual);
      if (!mesh || !mesh.geometry) {
        // fallback sensato: forward -Z, up +Y
        return { forward: AX['-Z'].clone(), up: AX['+Y'].clone() };
      }
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const sz = new THREE.Vector3();
      mesh.geometry.boundingBox.getSize(sz);
      // asse più lungo = direzione della freccia
      const axes = [
        { axis: AX['+X'].clone(), len: sz.x, label: 'X' },
        { axis: AX['+Y'].clone(), len: sz.y, label: 'Y' },
        { axis: AX['+Z'].clone(), len: sz.z, label: 'Z' },
      ].sort((a,b) => b.len - a.len);

      let forward = axes[0].axis;      // +X/+Y/+Z
      if (forward.dot(dir) < 0) forward.negate(); // scegli il verso che punta verso 'dir'
      let up = axes[1].axis;           // secondario come "up"
      // rendi up ortogonale al forward
      up = up.clone().projectOnPlane(forward).normalize();
      if (up.lengthSq() < 1e-6) up = AX['+Y'].clone().projectOnPlane(forward).normalize();

      return { forward, up };
    }

    function makeQuatFromDir(localForward, localUp, dir, boneQuat=null) {
      // 1) allinea forward locale a dir
      const qAlign = new THREE.Quaternion().setFromUnitVectors(localForward.clone().normalize(), dir.clone().normalize());

      // 2) roll: prendi up di riferimento (dal bone se disponibile), proiettato sul piano ortogonale a dir
      let refUp = AX['+Y'].clone();
      if (boneQuat) refUp.applyQuaternion(boneQuat);
      refUp.projectOnPlane(dir).normalize();

      // up risultante dopo qAlign
      const upA = localUp.clone().applyQuaternion(qAlign).projectOnPlane(dir).normalize();

      if (upA.lengthSq() > 1e-6 && refUp.lengthSq() > 1e-6) {
        const dot = THREE.MathUtils.clamp(upA.dot(refUp), -1, 1);
        const ang = Math.acos(dot);
        const sgn = Math.sign(new THREE.Vector3().crossVectors(upA, refUp).dot(dir));
        const qRoll = new THREE.Quaternion().setFromAxisAngle(dir, sgn * ang);
        qAlign.premultiply(qRoll); // qFinal = qRoll * qAlign
      }
      return qAlign;
    }

    // Handler chiamato da ArcherEnemy._shootNow()
    ctrl.onArrowFired = (pos, dir, meta = {}) => {
      const speed = meta.speed ?? 36;
      const life  = meta.lifeSec ?? 6.0;

      // Visual del proiettile
      let visual = null;
      if (ctrl.arrowMesh) {
        visual = ctrl.arrowMesh.clone(true);
        visual.traverse(n => {
          if (n.isSkinnedMesh) n.frustumCulled = false;
          if (n.material) {
            if (Array.isArray(n.material)) {
              n.material = n.material.map(m => { const c = m?.clone?.() || m; if (c) c.skinning = false; return c; });
            } else {
              n.material = n.material.clone?.() || n.material;
              if (n.material) n.material.skinning = false;
            }
          }
        });
      } else {
        const geo = new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8);
        const mat = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8, metalness: 0.0 });
        const m = new THREE.Mesh(geo, mat);
        m.rotation.z = Math.PI / 2;
        visual = m;
      }

      // Stima assi locali (forward/up) dal bounding box + aggiusta verso dir
      const { forward: localForward, up: localUp } = guessLocalAxes(visual, dir);

      // Costruisci la rotazione finale: forward→dir (+ roll da bone se presente)
      const quat = makeQuatFromDir(localForward, localUp, dir, meta.boneQuat || null);

      // Spawn del proiettile, passando anche gli assi locali così l'orientamento resta corretto in volo
      spawnArrowProjectile(visual, pos, quat, speed, life, { localForward, localUp });

      if (window.DEBUG_ARROW) {
        console.log('[Spawner] Arrow spawned',
          { pos: pos.toArray().map(v=>+v.toFixed(3)),
            dir: dir.toArray().map(v=>+v.toFixed(3)),
            localF: localForward.toArray(), localU: localUp.toArray(), speed, life });
      }
    };
  }


  registerEnemy(ctrl);
  return ctrl;
}

// -----------------------------------------------------

export function spawnArcherNpc(pos) {
  return spawnEnemy('archer', new THREE.Vector3(pos.x, pos.y ?? 0, pos.z), 'archer');
}
export function spawnWerewolfNpc(pos) {
  return spawnEnemy('werewolf', new THREE.Vector3(pos.x, pos.y ?? 0, pos.z), 'werewolf');
}
export function spawnWyvernNpc(pos) {
  return spawnEnemy('wyvern', new THREE.Vector3(pos.x, pos.y ?? 30, pos.z), 'wyvern');
}

export function spawnEnemies() {
  const num_archers = 1, num_werewolves = 1, num_wyverns = 0;

  for (let i = 0; i < num_archers; i++) {
    spawnArcherNpc(new THREE.Vector3(1, 0, 1));
  }
  for (let i = 0; i < num_werewolves; i++) {
    spawnWerewolfNpc(new THREE.Vector3(0, 0, 80));
  }
    spawnWyvernNpc(new THREE.Vector3(-230,0, 170));
}
