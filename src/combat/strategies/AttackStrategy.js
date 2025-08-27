// combat/strategies/AttackStrategy.js
import * as THREE from 'three';
import { gameManager } from '../../managers/gameManager.js';

const HIT_WINDOWS = [{ start: 0.30, end: 0.55 }];

// Base arc (verrà personalizzato nelle sottoclassi)
const BASE_SWORD_ARC = {
  reach: 2.6,
  arcDeg: 90,
  yawOffsetDeg: 180,    // 0° = davanti al player
  pitchOffsetDeg: -8,
  yOffset: 1.2
};

export class AttackStrategy {
  constructor(arcOverrides = {}) {
    this._arcDebugMesh = null;

    // Stato attacco overlay
    this._attackState = null;

    // Arc corrente (può essere cambiato da onEquip/arma o da sottoclasse)
    this._arc = { ...BASE_SWORD_ARC, ...arcOverrides };

    this.debug = false;

    // Stato parata (overlay looped)
    this._blockClipName = null;
  }

  onEquip(controller, weaponItem) {
    // weaponItem?.meta può sovrascrivere reach/arcDeg ecc.
    const m = weaponItem?.meta || {};
    if (m.reach != null) this._arc.reach = m.reach;
    if (m.arcDeg != null) this._arc.arcDeg = m.arcDeg;
    if (m.yawOffsetDeg != null) this._arc.yawOffsetDeg = m.yawOffsetDeg;
    if (m.pitchOffsetDeg != null) this._arc.pitchOffsetDeg = m.pitchOffsetDeg;
    if (m.yOffset != null) this._arc.yOffset = m.yOffset;
  }

  attack(_controller) { /* override */ }
  specialAttack(_controller) { /* override */ }

  // ---- Attacco base comune (overlay) ----
  // preferredNames: lista di possibili nomi clip (in ordine di preferenza)
  baseAttack(controller, ...preferredNames) {
    if (this._attackState) return false;

    const animator = controller.player.animator;
    if (!animator) return false;

    // Alias comuni: sword-attack / generic attack
    const aliases = [
      ...(preferredNames?.length ? preferredNames : []),
      'swordAttack', 'SwordAttack', 'attack', 'Attack', 'Slash', 'Melee', 'Hit'
    ];

    // Prova ad avviare una clip overlay fra gli alias
    let usedName = null;
    for (const name of aliases) {
      if (animator.playOverlay?.(name, { loop: 'once', mode: 'full' })){
        usedName = name; break;
      }
    }
    if (!usedName) return false;  // nessuna clip trovata

    const dur = Math.max(0.15, animator.getClipDuration?.(usedName) || 0.8);

    // Blocca movimento per la durata della clip
    controller.lockMovementFor?.(dur);
    controller.isAttacking = true;

    this._attackState = {
      t: 0,
      dur,
      windows: HIT_WINDOWS,
      winApplied: HIT_WINDOWS.map(() => false),
      enemiesHit: new Set(),
      clipName: usedName,
      prevFrac: 0,
      // Non servono action/clip: usiamo t/dur
    };

    this._updateArcDebug(controller);
    if (this._arcDebugMesh) this._arcDebugMesh.visible = this.debug;
    // Colore iniziale blu
    this._setDebugWindow(false);
    return true;
  }

  // ---- Update: gestione finestre e fine overlay ----
  update(controller, dt) {
    if (!this._attackState) return;

    const s = this._attackState;
    const prev = s.prevFrac ?? 0;
    s.t += dt;
    const curr = s.dur > 0 ? THREE.MathUtils.clamp(s.t / s.dur, 0, 1) : 1;

    // finestre di hit (usa overlap tra [prev,curr] e [start,end])
    for (let i = 0; i < s.windows.length; i++) {
      const w = s.windows[i];
      const a1 = Math.max(prev, w.start);
      const a2 = Math.min(curr, w.end);
      if (!s.winApplied[i] && a1 <= a2) {
        this._applyHits?.(controller);
        s.winApplied[i] = true;
      }
    }

    s.prevFrac = curr;


    // fine clip
    if (s.t >= s.dur) {
      this._attackState = null;
      controller.isAttacking = false;
      controller.player.animator?.stopOverlay?.();
      if (this._arcDebugMesh) {
        this._arcDebugMesh.visible = false;
      }
      return;
    }

    // aggiorna gizmo e colore
    if (this._arcDebugMesh?.visible) this._updateArcDebug(controller);
    this._setDebugWindow(this._isInHitWindow());
  }

  cancel(controller) {
    this._attackState = null;
    controller.isAttacking = false;
    controller.isBlocking = false;
    controller.player.animator?.stopOverlay?.();
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false;
  }

  // ================== ARCO DI COLPO ==================
  _setArc(reach, arcDeg) {
    if (typeof reach === 'number') this._arc.reach = reach;
    if (typeof arcDeg === 'number') this._arc.arcDeg = arcDeg;
    if (this._arcDebugMesh) {
      this._arcDebugMesh.geometry?.dispose();
      this._arcDebugMesh.geometry = makeArcGeometry(this._arc.reach, this._arc.arcDeg);
    }
  }

  _inSwordArc(playerObj, enemyObj) {
    console.log("IN SOWRD ARC",playerObj,enemyObj);
    if (!playerObj || !enemyObj) return false;

    const { reach, arcDeg, yOffset } = this._arc;

    // WORLD positions
    const Pw = playerObj.getWorldPosition(new THREE.Vector3());
    Pw.y += yOffset;
    const Ew = enemyObj.getWorldPosition(new THREE.Vector3());

    const toEnemy = new THREE.Vector3().subVectors(Ew, Pw);
    const dist = toEnemy.length();
    console.log("DIST AND REACH",dist,reach);
    if (dist > reach) return false;

    toEnemy.normalize();

    // WORLD slash dir
    const slashDirWorld = worldSlashDir(playerObj, this._arc);

    const dot = THREE.MathUtils.clamp(slashDirWorld.dot(toEnemy), -1, 1);
    const angle = THREE.MathUtils.radToDeg(Math.acos(dot));

    // === DEBUG LOG ===
    const dy = (Ew.y - Pw.y).toFixed(2);
    console.log(
      `[ARC TEST] enemy=${enemyObj.uuid} dist=${dist.toFixed(2)} ` +
      `angle=${angle.toFixed(1)}° dy=${dy}`
    );
    // =================
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
      color: 0x3AA7FF,               // blu di base
      transparent: true,
      opacity: 0.35,
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

  // ================== BLOCCO (Overlay looped) ==================
  blockStart(controller) {
    if (controller.isAttacking || controller.isBlocking) return false;

    const animator = controller.player.animator;
    if (!animator) return false;

    const hasShield = !!gameManager.inventory?.equipment?.shield;
    const aliases = hasShield
      ? ['blockShield', 'BlockShield', 'Shield', 'Guard']
      : ['block', 'Block', 'Guard'];

    let used = null;
    for (const n of aliases) {
      // shield o non shield:
      if (animator.playOverlay?.(n, { loop: 'repeat', mode: 'upper' })) { used = n; break; }
    }
    if (!used) return false;

    this._blockClipName = used;
    controller.isBlocking = true;
    return true;
  }

  blockEnd(controller) {
    if (!controller.isBlocking) return false;
    controller.player.animator?.stopOverlay?.();
    controller.isBlocking = false;
    this._blockClipName = null;
    return true;
  }

  block(controller) { return controller.isBlocking ? this.blockEnd(controller) : this.blockStart(controller); }

  // === helper: sei nella finestra di impatto? ===
  _isInHitWindow() {
    const s = this._attackState;
    if (!s) return false;
    const frac = s.dur > 0 ? THREE.MathUtils.clamp(s.t / s.dur, 0, 1) : 1;
    const wins = s.windows || HIT_WINDOWS;
    return wins.some(w => frac >= w.start && frac <= w.end);
  }

  // === helper: colora il gizmo in base allo stato ===
  _setDebugWindow(on) {
    const m = this._arcDebugMesh;
    if (!m || !m.material) return;
    // rosso in window, blu fuori
    m.material.color.setHex(on ? 0xFF3B30 : 0x3AA7FF);
    m.material.needsUpdate = true;
  }
}

// ---------------- helpers ----------------
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
  const qWorld = playerObj.getWorldQuaternion(new THREE.Quaternion());
  return localSlashDir(arc).applyQuaternion(qWorld).normalize();
}
