// combat/strategies/SwordMeleeStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../controllers/npcController.js';
import { hudManager } from '../../ui/hudManager.js';

const DEFAULT_SWORD_ARC = {
  reach: 2.7,
  arcDeg: 90,
  yawOffsetDeg: 180,
  pitchOffsetDeg: -10,
  yOffset: 1.3
};
const HIT_WINDOWS = [{ start: 0.30, end: 0.55 }];

export class SwordMeleeStrategy extends AttackStrategy {
  constructor() {
    super();
    this._arcDebugMesh = null;
    this._attackState = null; // { action, clip, windows, enemiesHit:Set }
    this._arc = { ...DEFAULT_SWORD_ARC }; // per-istanza
  }

  onEquip(controller, weaponItem) {
    // Parametrizza con i meta dell’arma (se presenti)
    if (weaponItem?.meta?.reach)  this._arc.reach  = weaponItem.meta.reach;
    if (weaponItem?.meta?.arcDeg) this._arc.arcDeg = weaponItem.meta.arcDeg;

    // Se la mesh debug esiste già, rigenera la geometria con i nuovi parametri
    if (this._arcDebugMesh) {
      this._arcDebugMesh.geometry?.dispose();
      this._arcDebugMesh.geometry = makeArcGeometry(this._arc.reach, this._arc.arcDeg);
    }
  }

  attack(controller, clipName='attack') {
    const action = controller.player.anim?.actions?.[clipName];
    if (controller.isAttacking || !action) return;

    controller.isAttacking = true;
    controller.player.anim.play(clipName, { once: true });

    const clip = action.getClip?.() || null;
    this._attackState = { action, clip, windows: HIT_WINDOWS, enemiesHit: new Set() };

    this._updateArcDebug(controller);   // prepara/ruota mesh debug
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false;

    const mixer = controller.player.anim?.mixer;
    if (mixer && action) {
      const onFinished = (e) => {
        if (e.action === action) {
          mixer.removeEventListener('finished', onFinished);
          this._end(controller);
        }
      };
      mixer.addEventListener('finished', onFinished);
    } else {
      setTimeout(() => this._end(controller), 600);
    }
  }

  update(controller, dt) {
    if (!this._attackState?.action) return;

    const a = this._attackState.action;
    const clip = this._attackState.clip;
    const tFrac = clip && clip.duration > 0 ? (a.time / clip.duration) : 1.0;
    const inWindow = this._attackState.windows.some(w => tFrac >= w.start && tFrac <= w.end);

    if (inWindow) {
      if (this._arcDebugMesh) this._arcDebugMesh.visible = true;
      this._applyHits(controller);
    } else if (this._arcDebugMesh) {
      this._arcDebugMesh.visible = false;
    }

    if (a.time >= (clip?.duration ?? 0)) this._end(controller);
  }

  cancel(controller) { this._end(controller); }

  // ---- internal ----
  _end(controller) {
    controller.isAttacking = false;
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false;
    this._attackState = null;
  }

  _applyHits(controller) {
    const playerObj = controller.player.model;
    const p = playerObj.position;
    const near = getEnemies().filter(e => e.alive && e.model?.position?.distanceTo(p) < 8);

    for (const enemy of near) {
      const key = enemy.model?.uuid || String(enemy);
      if (this._attackState.enemiesHit.has(key)) continue;

      if (inSwordArc(playerObj, enemy.model, this._arc)) {
        this._attackState.enemiesHit.add(key);
        killEnemy(enemy);
        if (typeof window !== 'undefined' && typeof window.giveXP === 'function') window.giveXP(25);
        hudManager.showNotification("Enemy Killed!");
      }
    }
  }

  _ensureArcDebugMesh(controller) {
    if (this._arcDebugMesh) return this._arcDebugMesh;
    const { reach, arcDeg, yOffset } = this._arc;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(makeArcGeometry(reach, arcDeg), mat);
    mesh.position.set(0, yOffset, 0.15);
    mesh.visible = false;
    controller.player.model.add(mesh);
    this._arcDebugMesh = mesh;
    return mesh;
  }

  _updateArcDebug(controller) {
    const m = this._ensureArcDebugMesh(controller);
    const localSlash = localSlashDir(this._arc);
    const from = new THREE.Vector3(0, 0, 1); // +Z della mesh
    const q = new THREE.Quaternion().setFromUnitVectors(from, localSlash);
    m.quaternion.copy(q);
    m.position.y = this._arc.yOffset;
    m.position.z = 0.15;
  }
}

// -------- helpers (senza 'this') --------
function makeArcGeometry(reach, arcDeg, segments = 32) {
  const verts = [0, 0, 0];
  const half = THREE.MathUtils.degToRad(arcDeg * 0.5);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const a = -half + t * (2 * half);
    verts.push(reach * Math.sin(a), 0, reach * Math.cos(a));
  }
  const idx = [];
  for (let i = 1; i <= segments; i++) idx.push(0, i, i + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function localSlashDir(arc) {
  const dir = new THREE.Vector3(0, 0, -1); // avanti locale
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(arc.pitchOffsetDeg),
    THREE.MathUtils.degToRad(arc.yawOffsetDeg),
    0,
    'YXZ'
  );
  return dir.applyEuler(e).normalize();
}

function worldSlashDir(playerObj, arc) {
  return localSlashDir(arc).applyQuaternion(playerObj.quaternion).normalize();
}

function inSwordArc(playerObj, enemyObj, arc) {
  const { reach, arcDeg, yOffset } = arc;

  const Pc = playerObj.position.clone();
  Pc.y += yOffset;

  const toEnemy = new THREE.Vector3().subVectors(enemyObj.position, Pc);
  const dist = toEnemy.length();
  if (dist > reach) return false;

  toEnemy.normalize();
  const slashDirWorld = worldSlashDir(playerObj, arc);

  const dot = THREE.MathUtils.clamp(slashDirWorld.dot(toEnemy), -1, 1);
  const angle = THREE.MathUtils.radToDeg(Math.acos(dot));
  return angle <= arcDeg * 0.5;
}
