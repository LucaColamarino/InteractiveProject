// controllers/forms/BaseFormController.js
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../map/map.js';
import { trees } from '../../spawners/vegetationSpawner.js';

const PLAYER_RADIUS = 0.4;   // tweak
const TREE_RADIUS   = 0.6;   // tweak
const BROADPHASE_R  = 7.0;   // raggio ricerca alberi (più stretto = meno lavoro)
const SEP_EPS       = 0.01;  // piccolo “margine” per evitare jitter sul bordo

export class BaseFormController {
  constructor(player, abilities) {
    this.player = player;
    this.abilities = abilities;

    // Dinamica orizzontale
    this.currentVelocity = new THREE.Vector3();
    this.accel = 30;
    this.decel = 20;

    // Stato generale
    this.velY = 0;
    this.isFlying = false;
    this.isOnGround = false;
    this.isSitting = false;
    this.isSprinting = false;
    this.isAttacking = false;
    this.attackFreezesMovement = true;
    this._moveLockT = 0;

    // Input (fornito dall’esterno)
    this._zeroVec = new THREE.Vector3();
    this._input = { moveVec: new THREE.Vector3(), isShiftPressed: false, isJumpPressed: false };

    // tmp objects (no alloc)
    this._desired = new THREE.Vector3();
    this._step    = new THREE.Vector3();
    this._prePos  = new THREE.Vector3();
    this._candPos = new THREE.Vector3();
    this._n2D     = new THREE.Vector2();
  }

  lockMovementFor(sec = 0) { this._moveLockT = Math.max(this._moveLockT, sec); }

  setInputState(st) {
    this._input.moveVec.copy(st.moveVec || this._zeroVec);
    this._input.isShiftPressed = !!st.isShiftPressed;
    this._input.isJumpPressed  = !!st.isJumpPressed;
    this.isSprinting = this._input.isShiftPressed;
  }

  sitToggle() { this.isSitting = !this.isSitting; }

  jumpOrFly() {
    if (this._moveLockT > 0 || (this.attackFreezesMovement && this.isAttacking)) return;
    if (this.abilities?.canFly) {
      const p = this.player.model.position;
      const tY = getTerrainHeightAt(p.x, p.z);
      const onGround = p.y <= tY + 0.01;
      if (onGround) { this.isFlying = true; this.velY = 10; }
    } else if (this.isOnGround) {
      this.velY = this.abilities?.jumpForce ?? 8;
      this.isOnGround = false;
    }
  }

  update(dt) {
    const movementLocked = this._moveLockT > 0 || this.isBlocking || (this.attackFreezesMovement && this.isAttacking);
    if (this._moveLockT > 0) this._moveLockT -= dt;

    // ----- Movimento orizzontale -----
    const baseSpeed   = this.abilities?.speed ?? 5;
    const targetSpeed = this.isSprinting ? baseSpeed * 1.5 : baseSpeed;

    const inputVec = movementLocked ? this._zeroVec : this._input.moveVec;
    this._desired.copy(inputVec).normalize().multiplyScalar(targetSpeed);
    const a = (inputVec.lengthSq() > 0) ? this.accel : this.decel;
    this.currentVelocity.lerp(this._desired, a * dt);

    // Step desiderato
    this._step.copy(this.currentVelocity).multiplyScalar(dt);

    // Pos pre-move e candidata
    const pos = this.player.model.position;
    this._prePos.copy(pos);
    this._candPos.copy(pos).add(this._step);

    // --- Collisione & scivolamento (risoluzione singola sul cand) ---
    if (trees?.getNearbyTrees) {
      const nearby = trees.getNearbyTrees(this._prePos.x, this._prePos.z, BROADPHASE_R);
      const minDist = TREE_RADIUS + PLAYER_RADIUS;
      const minDistSq = minDist * minDist;

      // Trova SOLO l’albero più penetrato rispetto alla posizione candidata
      let best = null;
      let bestPenetration = 0;

      for (let i = 0; i < nearby.length; i++) {
        const t = nearby[i];
        const dx = this._candPos.x - t.x;
        const dz = this._candPos.z - t.z;
        const distSq = dx*dx + dz*dz;
        if (distSq < minDistSq) {
          const dist = Math.sqrt(distSq);
          const penetration = minDist - dist;
          if (penetration > bestPenetration) {
            bestPenetration = penetration;
            best = { t, dx, dz, dist };
          }
        }
      }

      if (best) {
        // Normal calcolata sulla posizione candidata
        const inv = 1 / (best.dist || 1e-6);
        this._n2D.set(best.dx * inv, best.dz * inv); // n = (cand - center)/|...|

        // Scivolamento: elimina la componente inward dallo step
        const dot = this._step.x * this._n2D.x + this._step.z * this._n2D.y;
        if (dot < 0) {
          this._step.x -= dot * this._n2D.x;
          this._step.z -= dot * this._n2D.y;
        }

        // Spingi la candidata leggermente fuori (penetrazione + epsilon)
        const push = bestPenetration + SEP_EPS;
        this._candPos.x += this._n2D.x * push;
        this._candPos.z += this._n2D.y * push;
      }
    }

    // Applica la posizione finale UNA SOLA VOLTA
    pos.copy(this._candPos);

    // Orientamento verso direzione di marcia (solo orizzontale)
    if (!movementLocked && this.currentVelocity.lengthSq() > 1e-3) {
      const yaw = Math.atan2(this.currentVelocity.x, this.currentVelocity.z);
      const cur = this.player.model.rotation.y;
      let d = yaw - cur; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      this.player.model.rotation.y += d * 0.15;
    }

    // ----- Movimento verticale -----
    const g = this.abilities?.gravity ?? -30;
    if (this.abilities?.canFly && this.isFlying) {
      if (this._input.isJumpPressed)  this.velY += 30 * dt; // su
      if (this._input.isShiftPressed) this.velY -= 30 * dt; // giù
      this.velY += g * 0.2 * dt;
    } else {
      this.velY += g * dt;
    }
    pos.y += this.velY * dt;

    // Colla al terreno e reset stati
    this._ensureAboveTerrain();

    // Stato per Animator
    Object.assign(this.player.state, {
      speed: this.currentVelocity.length(),
      isFlying: this.isFlying,
      isSprinting: this.isSprinting,
      isSitting: this.isSitting,
      isAttacking: this.isAttacking,
    });
  }

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
    } else {
      this.isOnGround = false;
    }
  }
}
