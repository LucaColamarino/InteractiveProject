// combat/strategies/AttackStrategy.js
import * as THREE from 'three';

const HIT_WINDOWS = [{ start: 0.30, end: 0.55 }];

const DEFAULT_SWORD_ARC = {
  reach: 2.7,
  arcDeg: 90,
  // 0° = davanti al player. Metti 180 per colpire dietro.
  yawOffsetDeg: 180,
  pitchOffsetDeg: -10,
  yOffset: 1.3
};

export class AttackStrategy {
  constructor() {
    this._arcDebugMesh = null;
    this._attackState = null; // { action, clip, clipName, windows, enemiesHit:Set }
    this._arc = { ...DEFAULT_SWORD_ARC };
    this.debug = false; // mostra/nasconde la mesh di debug
  }

  // ---- hook opzionali per le sottoclassi ----
  onEquip(controller, weaponItem) {}
  cancel(controller) {
    this._attackState = null;
    controller.isAttacking = false;
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false;
  }

  // ---- API pubblica: attacco base condiviso (slash) ----
  attack(controller) { return this.baseAttack(controller); }

  baseAttack(controller) {
    const clipName = 'swordAttack';
    const actions = controller.player.animator?.actions || {};

    let action = actions[clipName] || actions['attack'] || null;
    if (!action) {
      const key = Object.keys(actions).find(k => k.toLowerCase().includes('attack'));
      if (key) action = actions[key];
    }
    if (!action || this._attackState) return false;

    const chosenName = action._clipName || clipName;
    const ok = controller.player.animator?.playAction(chosenName);
    if (!ok) return false;

    const clip = action.getClip?.() || null;
    const dur  = clip?.duration ?? action.getClip?.()?.duration ?? 0.8;

    controller.lockMovementFor(dur);
    controller.isAttacking = true;

    this._attackState = {
      action,
      clip,
      clipName: chosenName,
      windows: HIT_WINDOWS,
      enemiesHit: new Set()
    };

    this._updateArcDebug(controller);
    if (this._arcDebugMesh) this._arcDebugMesh.visible = this.debug;

    return true;
  }

  // ---- update comune: gestisce tempo, finestra hit e fine anim ----
  update(controller, dt) {
    // nessun attacco in corso → gestisci solo vis debug
    if (!this._attackState?.action) {
      if (this._arcDebugMesh) this._arcDebugMesh.visible = this.debug;
      return;
    }

    this._updateArcDebug(controller);

    const a = this._attackState.action;
    const clipDur = this._getClipDurationSafe(this._attackState);
    const t = a.time ?? 0;
    const tFrac = clipDur > 0 ? THREE.MathUtils.clamp(t / clipDur, 0, 1) : 1.0;

    const inWindow = this._attackState.windows.some(
      (w) => tFrac >= w.start && tFrac <= w.end
    );

    if (this._arcDebugMesh) {
      this._arcDebugMesh.visible = this.debug;
      if (this.debug) {
        this._arcDebugMesh.material.color.set(inWindow ? 0xff0000 : 0x00ffff);
      }
    }

    // fine animazione → reset
    const anim = controller.player.animator;
    const weight = anim?._getActionWeight?.(this._attackState.clipName) ?? 0;
    const ended = !a.isRunning?.() || weight <= 0.001 || tFrac >= 0.999;
    if (ended) {
      this._attackState = null;
      controller.isAttacking = false;
      if (this._arcDebugMesh) this._arcDebugMesh.visible = this.debug;
      return;
    }

    // finestra aperta → lascia alla sottoclasse applicare i colpi
    if (inWindow) this._applyHits(controller);
  }

  // ---- da overridare nelle sottoclassi per definire il danno ----
  _applyHits(controller) {}

  // ---- helpers protetti ------------------------------------------------------

  _getClipDurationSafe(state) {
    const a = state?.action;
    const c = state?.clip;
    const d = c?.duration ?? a?.getClip?.()?.duration ?? 1.0;
    return (typeof d === 'number' && isFinite(d) && d > 0) ? d : 1.0;
  }

  _setArc(reach, arcDeg) {
    if (typeof reach === 'number') this._arc.reach = reach;
    if (typeof arcDeg === 'number') this._arc.arcDeg = arcDeg;
    if (this._arcDebugMesh) {
      this._arcDebugMesh.geometry?.dispose();
      this._arcDebugMesh.geometry = makeArcGeometry(this._arc.reach, this._arc.arcDeg);
    }
  }

  _inSwordArc(playerObj, enemyObj) {
    const { reach, arcDeg, yOffset } = this._arc;

    const Pc = playerObj.position.clone();
    Pc.y += yOffset;

    const toEnemy = new THREE.Vector3().subVectors(enemyObj.position, Pc);
    const dist = toEnemy.length();
    if (dist > reach) return false;

    toEnemy.normalize();
    const slashDirWorld = worldSlashDir(playerObj, this._arc);

    const dot = THREE.MathUtils.clamp(slashDirWorld.dot(toEnemy), -1, 1);
    const angle = THREE.MathUtils.radToDeg(Math.acos(dot));
    return angle <= arcDeg * 0.5;
  }

  _updateArcDebug(controller) {
    const m = this._ensureArcDebugMesh(controller);
    if (!m) return;

    const player = controller.player.model;
    if (!player) return;

    player.updateWorldMatrix(true, false);

    const qPlayer = player.getWorldQuaternion(new THREE.Quaternion());
    const pos = player.getWorldPosition(new THREE.Vector3());

    const localSlash = localSlashDir(this._arc);
    const from = new THREE.Vector3(0, 0, 1);
    const qLocal = new THREE.Quaternion().setFromUnitVectors(from, localSlash);

    const qWorld = qPlayer.clone().multiply(qLocal);
    m.quaternion.copy(qWorld);

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qPlayer);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qPlayer);
    m.position.copy(pos)
      .addScaledVector(up, this._arc.yOffset)
      .addScaledVector(fwd, 0.15);
  }

  _ensureArcDebugMesh(controller) {
    if (this._arcDebugMesh) return this._arcDebugMesh;

    const { reach, arcDeg } = this._arc;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false
    });

    const mesh = new THREE.Mesh(makeArcGeometry(reach, arcDeg), mat);
    mesh.visible = false;
    mesh.matrixAutoUpdate = true;
    mesh.renderOrder = 999;

    const parent = controller.player.model?.parent;
    if (parent) parent.add(mesh);

    this._arcDebugMesh = mesh;
    return mesh;
  }
}

// ---------- helpers file‑local ----------
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
  const dir = new THREE.Vector3(0, 0, -1);
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
