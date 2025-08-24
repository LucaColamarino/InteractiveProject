// controllers/forms/BaseFormController.js
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../map/map.js';

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
    this.isAttacking = false;      // settato da chi lancia azioni full (es. attacco)
    this.attackFreezesMovement = true;
    this._moveLockT = 0;
    this._zeroVec = new THREE.Vector3();
    // Input (fornito dall'esterno)
    this._input = { moveVec: new THREE.Vector3(), isShiftPressed: false, isJumpPressed: false };
  }

  lockMovementFor(sec = 0) { this._moveLockT = Math.max(this._moveLockT, sec); }

  setInputState(st) {
    this._input.moveVec.copy(st.moveVec || new THREE.Vector3());
    this._input.isShiftPressed = !!st.isShiftPressed;
    this._input.isJumpPressed = !!st.isJumpPressed;
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
      // opzionale: potresti far partire un'azione jump (full) qui
    }
  }

  update(dt) {
    const movementLocked = this._moveLockT > 0 || (this.attackFreezesMovement && this.isAttacking);
    if (this._moveLockT > 0) this._moveLockT -= dt;

    // ----- Movimento orizzontale -----
    const baseSpeed = this.abilities?.speed ?? 5;
    const targetSpeed = this.isSprinting ? baseSpeed * 1.5 : baseSpeed;

    const inputVec = movementLocked ? this._zeroVec : this._input.moveVec;
    const desired = inputVec.clone().normalize().multiplyScalar(targetSpeed);
    const a = (inputVec.lengthSq() > 0) ? this.accel : this.decel;
    this.currentVelocity.lerp(desired, a * dt);

    const step = this.currentVelocity.clone().multiplyScalar(dt);
    this.player.model.position.add(step);

    // Orientamento verso la direzione di marcia
    if (!movementLocked && this.currentVelocity.lengthSq() > 1e-3) {
      const yaw = Math.atan2(this.currentVelocity.x, this.currentVelocity.z);
      const cur = this.player.model.rotation.y;
      let d = yaw - cur; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      this.player.model.rotation.y += d * 0.15;
    }

    // ----- Movimento verticale -----
    const g = this.abilities?.gravity ?? -30;
    if (this.abilities?.canFly && this.isFlying) {
      if (this._input.isJumpPressed) this.velY += 30 * dt;      // salire
      if (this._input.isShiftPressed) this.velY -= 30 * dt;     // scendere
      this.velY += g * 0.2 * dt; // gravità attenuata in volo
    } else {
      this.velY += g * dt;       // gravità piena
    }
    this.player.model.position.y += this.velY * dt;

    // Colla al terreno e reset stati
    this._ensureAboveTerrain();

    // Esporta stato per l’Animator (lui decide le clip)
    Object.assign(this.player.state, {
      speed: this.currentVelocity.length(),
      isFlying: this.isFlying,
      isSprinting: this.isSprinting,
      isSitting: this.isSitting,
      isAttacking: this.isAttacking, // informativo
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
