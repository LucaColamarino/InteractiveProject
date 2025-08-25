// combat/strategies/AttackStrategy.js
import * as THREE from 'three';

const HIT_WINDOWS = [{ start: 0.30, end: 0.55 }];

const DEFAULT_SWORD_ARC = {
  reach: 2.7,
  arcDeg: 90,
  // 0° = davanti al player (usa 180 per colpire anche dietro)
  yawOffsetDeg: 180,
  pitchOffsetDeg: -10,
  yOffset: 1.3
};

export class AttackStrategy {
  constructor() {
    this._arcDebugMesh = null;
    // { action, clip, clipName, windows:[{start,end}], winApplied:Bool[], enemiesHit:Set }
    this._attackState = null;
    this._arc = { ...DEFAULT_SWORD_ARC };
    this.debug = true; // mostra/nasconde la mesh di debug
  }

  onEquip(controller, weaponItem) {
    // sovrascritto nelle sottoclassi (es: set reach/arc)
  }

  attack(controller) {
    // sovrascritto nelle sottoclassi
  }

  specialAttack(controller) {
    // sovrascritto nelle sottoclassi
  }

  // ---- Attacco base comune (es. sword slash) ----
  baseAttack(controller) {
    const actions = controller.player.animator?.actions || {};
    const primary = actions['swordAttack'] || actions['attack'] || null;
    if (!primary || this._attackState) return false;

    // se non c'è 'swordAttack', cerca un'anim qualsiasi contenente "attack"
    let action = primary;
    if (!action) {
      const key = Object.keys(actions).find(k => k.toLowerCase().includes('attack'));
      if (key) action = actions[key];
    }
    if (!action) return false;

    const clipName = action._clipName || 'swordAttack';
    const ok = controller.player.animator?.playAction(clipName);
    if (!ok) return false;

    const clip = action.getClip?.() || null;
    const dur  = clip?.duration ?? 0.8;

    controller.lockMovementFor(dur);
    controller.isAttacking = true;

    this._attackState = {
      action,
      clip,
      clipName,
      windows: HIT_WINDOWS,
      winApplied: HIT_WINDOWS.map(() => false),
      enemiesHit: new Set()
    };

    this._updateArcDebug(controller);
    if (this._arcDebugMesh) this._arcDebugMesh.visible = this.debug;
    return true;
  }

  // ---- Ciclo di vita attacco base: gestisce finestre hit ----
  update(controller, dt) {
    if (!this._attackState?.clip) return;

    const { action, clip, windows, winApplied } = this._attackState;
    const frac = clip.duration > 0 ? (action.time / clip.duration) : 1;

    // 1) Applica i colpi nelle finestre attive (una sola volta per finestra)
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      if (!winApplied[i] && frac >= w.start && frac <= w.end) {
        this._applyHits?.(controller);
        winApplied[i] = true;
      }
    }

    // 2) Fine animazione -> reset stato
    const weight = controller.player.animator?._getActionWeight?.(this._attackState.clipName) ?? 0;
    const ended = !action.isRunning?.() || weight <= 0.001 || frac >= 0.999;

    if (ended) {
      this._attackState = null;
      controller.isAttacking = false;
      if (this._arcDebugMesh) this._arcDebugMesh.visible = false;
    }
  }

  cancel(controller) {
    this._attackState = null;
    controller.isAttacking = false;
    controller.isBlocking = false;
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false;
  }

  // ================== ARCO DI COLPO (comune) ==================
  _setArc(reach, arcDeg) {
    if (typeof reach === 'number') this._arc.reach = reach;
    if (typeof arcDeg === 'number') this._arc.arcDeg = arcDeg;
    if (this._arcDebugMesh) {
      this._arcDebugMesh.geometry?.dispose();
      this._arcDebugMesh.geometry = makeArcGeometry(this._arc.reach, this._arc.arcDeg);
    }
  }

  _inSwordArc(playerObj, enemyObj) {
    if (!playerObj || !enemyObj) return false;

    const { reach, arcDeg, yOffset } = this._arc;

    // origine del colpo leggermente sopra il terreno (altezza busto)
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

  // ================== BLOCCO COMUNE ==================
  block(controller) {
    if (controller.isAttacking) return false;

    const animator = controller.player.animator;
    if (!animator?.actions) return false;

    const hasShield = controller.player.equipment?.offhand?.type === 'shield';
    const clipName = hasShield ? 'blockShield' : 'block';
    const action = animator.actions[clipName];
    if (!action) return false;

    const ok = animator.playAction(clipName);
    if (!ok) return false;

    const clip = action.getClip?.() || null;
    const dur = clip?.duration ?? 0.5;

    controller.lockMovementFor(dur);
    controller.isBlocking = true;

    setTimeout(() => {
      controller.isBlocking = false;
    }, dur * 1000);

    return true;
  }
}

// ---------------- helpers (file-local) ----------------
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
