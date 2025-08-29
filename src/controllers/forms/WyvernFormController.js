// controllers/forms/WyvernFormController.js
import * as THREE from 'three';
import { BaseFormController } from './BaseFormController.js';

export class WyvernFormController extends BaseFormController {
  /**
   * @param {*} player                // { model: THREE.Group, animator, state, ... }
   * @param {*} abilities             // override abilità wyvern
   * @param {{inheritFrom?: BaseFormController}} opts
   */
  constructor(player, abilities = {}, opts = {}) {
    super(player, {
      formName: 'wyvern',
      canFly: true,
      canJump: false,
      speed: 10,               // velocità “di crociera”
      gravity: -6,             // gravità più leggera
      jumpForce: 10,
      cameraOffset: new THREE.Vector3(0, 15, -20),
      yOffset: abilities.yOffset ?? 0,
      ...abilities
    });

    // Flight feel
    this.bankLeanMax = 0.40;        // roll max (rad)
    this.bankResponsiveness = 6.0;
    this.pitchMax = 0.30;           // pitch max (rad)
    this.pitchResponsiveness = 5.0;

    this.forwardBoost = 1.25;       // extra spinta in avanti
    this.climbSpeed   = 18;         // SPACE
    this.diveSpeed    = 22;         // SHIFT

    this._tmpEuler = new THREE.Euler();
    this._targetBank = 0;
    this._targetPitch = 0;

    if (opts?.inheritFrom) this._inheritState(opts.inheritFrom);
  }

  _inheritState(prev) {
    // Mantieni HUD/FX e condizioni
    this.stats = prev.stats;
    this._burnFx = prev._burnFx;
    this._isBurning = prev._isBurning;
    this._burningLeft = prev._burningLeft;

    // Stato / input
    this.isFlying = true;
    this.isSitting = false;
    this.isAttacking = false;
    this._input = prev._input; // condivide il riferimento
  }

  jumpOrFly() {
    // In wyvern: sempre volo; SPACE dà piccolo “colpo d’ala”
    this.isFlying = true;
    this.velY += 4;
  }

  update(dt) {
    // Logica base (movimento/collisioni/HUD…)
    super.update(dt);

    // Assetto in volo
    const v = this.currentVelocity;
    const vy = this.velY;

    // BANK (roll) da input laterale
    const side = (this._input?.moveVec?.x ?? 0);
    const desiredBank = THREE.MathUtils.clamp(side, -1, 1) * this.bankLeanMax;
    this._targetBank += (desiredBank - this._targetBank) * Math.min(1, this.bankResponsiveness * dt);

    // PITCH da velocità verticale
    const desiredPitch = THREE.MathUtils.clamp(vy / 30, -1, 1) * this.pitchMax;
    this._targetPitch += (desiredPitch - this._targetPitch) * Math.min(1, this.pitchResponsiveness * dt);

    // Applica rotazione locale (yaw già gestito dal Base)
    const e = this._tmpEuler.set(this._targetPitch, this.player.model.rotation.y, this._targetBank);
    this.player.model.rotation.set(e.x, e.y, e.z);

    // Throttle in avanti se stai premendo “avanti”
    if (this.isFlying) {
      const fwdYaw = this.player.model.rotation.y;
      const fwd = new THREE.Vector3(Math.sin(fwdYaw), 0, Math.cos(fwdYaw));
      const forwardInput = Math.max(0, this._input?.moveVec?.z ?? 0);
      if (forwardInput > 0) {
        const add = forwardInput * this.forwardBoost * dt * (this.abilities?.speed ?? 10);
        v.addScaledVector(fwd, add);
      }

      // Climb / dive
      if (this._input?.isJumpPressed)  this.velY += this.climbSpeed * dt;
      if (this._input?.isShiftPressed) this.velY -= this.diveSpeed * dt;
    }
  }
}
