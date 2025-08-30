// controllers/forms/WyvernFormController.js
import * as THREE from 'three';
import { BaseFormController } from './BaseFormController.js';
import { waterHeight } from '../../utils/entities.js'; // usa lo stesso riferimento del tuo progetto
import { getGroundHeightAtXZ } from '../../systems/GroundSystem.js';

const WATER_CLEARANCE = 1.0;
const GROUND_CLEARANCE = 0.6; // tieni la pancia un po’ sollevata dalle creste

export class WyvernFormController extends BaseFormController {
  constructor(player, abilities = {}, opts = {}) {
    super(player, {
      formName: 'wyvern',
      canFly: true,
      canJump: false,
      speed: 12,
      gravity: -6,
      jumpForce: 10,
      cameraOffset: new THREE.Vector3(0, 15, -22),
      yOffset: abilities.yOffset ?? 0,
      ...abilities
    });

    // Parametri di volo
    this.bankLeanMax = 0.45;
    this.bankResponsiveness = 6.5;
    this.pitchMax = 0.35;
    this.pitchResponsiveness = 5.5;

    this.forwardBoost = 1.3;
    this.climbSpeed   = 20;
    this.diveSpeed    = 24;

    this._tmpEuler = new THREE.Euler();
    this._targetBank = 0;
    this._targetPitch = 0;

    if (opts?.inheritFrom) this._inheritState(opts.inheritFrom);
  }

  _inheritState(prev) {
    this.stats = prev.stats;
    this._burnFx = prev._burnFx;
    this._isBurning = prev._isBurning;
    this._burningLeft = prev._burningLeft;

    this.isFlying = true;
    this.isSitting = false;
    this.isAttacking = false;
    this._input = prev._input;
  }

  jumpOrFly() { this.isFlying = true; this.velY += 5; }

  update(dt) {
    super.update(dt);
    if (!this.isFlying) return;

    const v = this.currentVelocity;
    const vy = this.velY;

    // =============== CONTROLLO ASSETTO ===============
    const side = (this._input?.moveVec?.x ?? 0);
    const desiredBank = THREE.MathUtils.clamp(side, -1, 1) * this.bankLeanMax;
    this._targetBank += (desiredBank - this._targetBank) * Math.min(1, this.bankResponsiveness * dt);

    const desiredPitch = THREE.MathUtils.clamp(vy / 30, -1, 1) * this.pitchMax;
    this._targetPitch += (desiredPitch - this._targetPitch) * Math.min(1, this.pitchResponsiveness * dt);

    const e = this._tmpEuler.set(this._targetPitch, this.player.model.rotation.y, this._targetBank);
    this.player.model.rotation.set(e.x, e.y, e.z);

    // =============== SPINTA AVANTI ===============
    const fwdYaw = this.player.model.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(fwdYaw), 0, Math.cos(fwdYaw));
    const forwardInput = Math.max(0, this._input?.moveVec?.z ?? 0);
    if (forwardInput > 0) {
      const add = forwardInput * this.forwardBoost * dt * (this.abilities?.speed ?? 12);
      v.addScaledVector(fwd, add);
    }

    // =============== CLIMB / DIVE ===============
    if (this._input?.isJumpPressed)  this.velY += this.climbSpeed * dt;
    if (this._input?.isShiftPressed) this.velY -= this.diveSpeed * dt;

    // =============== LIMITE MIN: TERRENO O ACQUA ===============
    const pos = this.player.model.position;
    const groundY = getGroundHeightAtXZ(pos.x, pos.z, { fromY: pos.y + 2.0 });
    const minY = Math.max(groundY + GROUND_CLEARANCE, (waterHeight ?? 0) + WATER_CLEARANCE);

    if (pos.y <= minY) {
      pos.y = minY;
      if (this.velY < 0) this.velY = 0;
    }
  }

  // Se vola, non incollare al terreno, ma rispetta minY = max(terreno, acqua)
  _ensureAboveGround() {
    const p = this.player.model.position;
    if (this.isFlying) {
      const groundY = getGroundHeightAtXZ(p.x, p.z, { fromY: p.y + 2.0 });
      const minY = Math.max(groundY + GROUND_CLEARANCE, (waterHeight ?? 0) + WATER_CLEARANCE);
      if (p.y < minY) {
        p.y = minY;
        this.velY = Math.max(0, this.velY);
      }
      this.isOnGround = false;
    } else {
      super._ensureAboveGround();
    }
  }
}
