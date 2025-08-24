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
    this.isSprinting = false;
    this.isSitting = false;
    this.isAttacking = false; // popolata dai controller che gestiscono il combat

    // Input (fornito dall'esterno)
    this._input = { moveVec: new THREE.Vector3(), isShiftPressed: false, isJumpPressed: false };
  }

  setInputState(st) {
    this._input.moveVec.copy(st.moveVec || new THREE.Vector3());
    this._input.isShiftPressed = !!st.isShiftPressed;
    this._input.isJumpPressed = !!st.isJumpPressed;
    this.isSprinting = this._input.isShiftPressed;
  }

  sitToggle() { this.isSitting = !this.isSitting; }

  // Default: i controller specifici (es. umano/uccello) possono override-are
  jumpOrFly() {
    if (this.abilities?.canFly) {
      // Decollo solo se a terra
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
    // ----- Movimento orizzontale -----
    const baseSpeed = this.abilities?.speed ?? 5;
    const targetSpeed = this.isSprinting ? baseSpeed * 1.5 : baseSpeed;

    const desired = this._input.moveVec.clone().normalize().multiplyScalar(targetSpeed);
    const a = this._input.moveVec.lengthSq() > 0 ? this.accel : this.decel;
    this.currentVelocity.lerp(desired, a * dt);

    const step = this.currentVelocity.clone().multiplyScalar(dt);
    this.player.model.position.add(step);

    // Orientamento verso la direzione di marcia
    if (this.currentVelocity.lengthSq() > 1e-3) {
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
      this.velY += g * dt; // gravità piena
    }
    this.player.model.position.y += this.velY * dt;

    // Colla terreno e reset stati
    this._ensureAboveTerrain();

    // Esporta stato per il sistema animazioni
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

