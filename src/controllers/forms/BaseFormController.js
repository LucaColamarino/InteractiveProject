// controllers/forms/BaseFormController.js
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../map/map.js';
import { getEnemies, killEnemy } from '../npcController.js';
import { hudManager } from '../../ui/hudManager.js';
import { xp } from '../../gameLoop.js';

// ---- Parametri spada: SORGENTE UNICA ----
const SWORD_ARC = {
  reach: 2.7,           // raggio del colpo
  arcDeg: 90,           // ampiezza complessiva dell'arco
  yawOffsetDeg: 180,    // destra = negativo (slash a destra)
  pitchOffsetDeg: -10,  // leggero verso il basso
  yOffset: 1.3          // offset verticale dell’arco (m) rispetto al centro del player
};

// 🔥 Finestre di impatto (in frazione della durata clip): più facile colpire
// Puoi mettere una sola finestra larga oppure più finestre.
const HIT_WINDOWS = [
  { start: 0.30, end: 0.55 }, // finestra principale dello slash
  // { start: 0.62, end: 0.75 }, // opzionale: seconda finestra (back-swing)
];

// Direzione locale dello slash (forward -Z con offset yaw/pitch)
function _localSlashDir() {
  const dir = new THREE.Vector3(0, 0, -1); // avanti locale
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(SWORD_ARC.pitchOffsetDeg),
    THREE.MathUtils.degToRad(SWORD_ARC.yawOffsetDeg),
    0,
    'YXZ'
  );
  return dir.applyEuler(e).normalize();
}

// Direzione mondo dello slash
function _worldSlashDir(playerObj) {
  return _localSlashDir().applyQuaternion(playerObj.quaternion).normalize();
}

// Hit test: stesso arco/direzione dello slash + stesso offset Y
function _inSwordArc(playerObj, enemyObj) {
  const { reach, arcDeg, yOffset } = SWORD_ARC;

  const Pc = playerObj.position.clone(); // centro volume
  Pc.y += yOffset;

  const toEnemy = new THREE.Vector3().subVectors(enemyObj.position, Pc);
  const dist = toEnemy.length();
  if (dist > reach) return false;

  toEnemy.normalize();
  const slashDirWorld = _worldSlashDir(playerObj);

  const dot = THREE.MathUtils.clamp(slashDirWorld.dot(toEnemy), -1, 1);
  const angle = THREE.MathUtils.radToDeg(Math.acos(dot));
  return angle <= arcDeg * 0.5;
}

export class BaseFormController {
  constructor(player, abilities) {
    this.player = player;
    this.abilities = abilities;
    this.velY = 0;
    this.isFlying = false;
    this.isOnGround = false;
    this.currentVelocity = new THREE.Vector3();
    this.accel = 30; this.decel = 20;
    this.isSprinting = false;
    this.isSitting = false;
    this.isAttacking = false;

    this._input = { moveVec: new THREE.Vector3(), isShiftPressed:false, isJumpPressed:false };

    // Debug mesh per visualizzare l’arco (segue SEMPRE SWORD_ARC)
    this._arcDebugMesh = null;

    // Stato attacco continuo
    this._attackState = null; // { action, clip, windows, enemiesHit:Set<string> }
  }

  setInputState(st) {
    this._input.moveVec.copy(st.moveVec || new THREE.Vector3());
    this._input.isShiftPressed = !!st.isShiftPressed;
    this._input.isJumpPressed  = !!st.isJumpPressed;
    this.isSprinting = this._input.isShiftPressed;
  }

  update(dt) {
    // movimento orizzontale
    const targetSpeed = this.isSprinting ? this.abilities.speed * 1.5 : this.abilities.speed;
    const desired = this._input.moveVec.clone().normalize().multiplyScalar(targetSpeed);
    const a = this._input.moveVec.lengthSq() > 0 ? this.accel : this.decel;
    this.currentVelocity.lerp(desired, a * dt);
    const step = this.currentVelocity.clone().multiplyScalar(dt);
    this.player.model.position.add(step);

    // orientamento
    if (this.currentVelocity.lengthSq() > 0.001) {
      const yaw = Math.atan2(this.currentVelocity.x, this.currentVelocity.z);
      const cur = this.player.model.rotation.y;
      let d = yaw - cur; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      this.player.model.rotation.y += d * 0.15;
    }

    // verticale
    if (this.abilities.canFly && this.isFlying) {
      if (this._input.isJumpPressed) this.velY += 30 * dt;
      if (this._input.isShiftPressed) this.velY -= 30 * dt;
      this.velY += this.abilities.gravity * 0.2 * dt;
    } else {
      this.velY += this.abilities.gravity * dt;
    }
    this.player.model.position.y += this.velY * dt;

    this._ensureAboveTerrain();

    // --- HIT CONTINUO DURANTE LE FINESTRE ---
    if (this._attackState?.action) {
      const a = this._attackState.action;
      const clip = this._attackState.clip;
      const tFrac = clip && clip.duration > 0 ? (a.time / clip.duration) : 1.0;

      const inWindow = this._attackState.windows.some(w => tFrac >= w.start && tFrac <= w.end);

      // mostra / nascondi debug mesh solo dentro le finestre
      if (this._arcDebugMesh) this._arcDebugMesh.visible = !!inWindow;
      if (inWindow) {
        this._applySwordHitsOncePerEnemy();
      }

      // quando l'azione finisce, chiudi lo stato (il listener finished fa il resto)
      if (a.time >= clip.duration) {
        this._endAttackState();
      }
    }

    // esporta stato per AnimationSystem
    Object.assign(this.player.state, {
      speed: this.currentVelocity.length(),
      isFlying: this.isFlying,
      isSprinting: this.isSprinting,
      isSitting: this.isSitting,
      isAttacking: this.isAttacking
    });
  }

  jumpOrFly() {
    if (this.abilities.canFly) {
      // toggle takeoff se a terra
      const tY = getTerrainHeightAt(this.player.model.position.x, this.player.model.position.z);
      const onGround = this.player.model.position.y <= tY + 0.01;
      if (onGround) { this.isFlying = true; this.velY = 10; }
    } else if (this.isOnGround) {
      this.velY = this.abilities.jumpForce;
      this.isOnGround = false;
    }
  }

  sitToggle() {
    this.isSitting = !this.isSitting;
  }

  // === Attacco con FINESTRE DI IMPATTO CONTINUE ===
  attack(clipName = 'attack') {
    const action = this.player.anim?.actions?.[clipName];
    if (this.isAttacking || !action) return;

    this.isAttacking = true;
    this.player.anim.play(clipName, { once: true });

    // Prepara stato finestra/e
    const clip = action.getClip?.() || null;
    this._attackState = {
      action,
      clip,
      windows: HIT_WINDOWS,
      enemiesHit: new Set()
    };

    // Debug mesh orientata come lo slash + yOffset
    this._updateArcDebugOrientationAndOffset();
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false; // verrà mostrata solo dentro le finestre

    // Sblocco stato a fine animazione
    const mixer = this.player.anim.mixer;
    if (mixer) {
      const targetAction = action;
      const onFinished = (e) => {
        if (e.action === targetAction) {
          mixer.removeEventListener('finished', onFinished);
          this._endAttackState();
        }
      };
      mixer.addEventListener('finished', onFinished);
    } else {
      // fallback
      setTimeout(() => this._endAttackState(), 600);
    }
  }

  _endAttackState() {
    this.isAttacking = false;
    if (this._arcDebugMesh) this._arcDebugMesh.visible = false;
    this._attackState = null;
  }

  _applySwordHitsOncePerEnemy() {
    const playerObj = this.player.model;
    const p = playerObj.position;
    const near = getEnemies().filter(e => e.alive && e.model?.position?.distanceTo(p) < 8);

    for (const enemy of near) {
      const key = enemy.model?.uuid || String(enemy);
      if (this._attackState.enemiesHit.has(key)) continue; // evita doppio colpo nello stesso swing

      if (_inSwordArc(playerObj, enemy.model)) {
        this._attackState.enemiesHit.add(key);
        killEnemy(enemy);
        window.giveXP(25);
        hudManager.showNotification("Enemy Killed!");
      }
    }
  }

  // ---------- Helpers debug arco (mesh) ----------
  _makeArcGeometry(reach, arcDeg, segments = 32) {
    // settore a ventaglio nel piano XZ, con +Z = forward della mesh
    const verts = [0, 0, 0];
    const half = THREE.MathUtils.degToRad(arcDeg * 0.5);
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const a = -half + t * (2 * half);
      const x = reach * Math.sin(a);
      const z = reach * Math.cos(a);
      verts.push(x, 0, z);
    }
    const idx = [];
    for (let i = 1; i <= segments; i++) idx.push(0, i, i + 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  _ensureArcDebugMesh() {
    if (this._arcDebugMesh) return this._arcDebugMesh;
    const { reach, arcDeg } = SWORD_ARC;
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this._makeArcGeometry(reach, arcDeg), mat);
    // Figlio del player: eredita rotazione; gestiamo y/z qui
    mesh.position.set(0, SWORD_ARC.yOffset, 0.15);
    mesh.visible = false;
    this.player.model.add(mesh);
    this._arcDebugMesh = mesh;
    return mesh;
  }

  _updateArcDebugOrientationAndOffset() {
    const m = this._ensureArcDebugMesh();

    // Allinea il +Z locale della mesh alla DIREZIONE DI SLASH **locale**
    const localSlash = _localSlashDir();      // spazio locale del player
    const from = new THREE.Vector3(0, 0, 1);  // +Z della mesh
    const q = new THREE.Quaternion().setFromUnitVectors(from, localSlash);
    m.quaternion.copy(q);

    // Offset verticali e piccolo avanzamento frontale
    m.position.y = SWORD_ARC.yOffset;
    m.position.z = 0.15;
  }

  // ----------------------------------------------

  _ensureAboveTerrain() {
    const p = this.player.model.position;
    const tY = getTerrainHeightAt(p.x, p.z);
    if (p.y < tY) {
      p.y = tY; this.velY = 0; this.isOnGround = true;
      if (this.isFlying) {
        this.isFlying = false;
        const e = new THREE.Euler().setFromQuaternion(this.player.model.quaternion);
        e.x = 0; e.z = 0; this.player.model.quaternion.setFromEuler(e);
      }
    }
  }
}
