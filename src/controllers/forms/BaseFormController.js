// controllers/forms/BaseFormController.js
import * as THREE from 'three';
import { trees } from '../../spawners/vegetationSpawner.js';
import { StatsSystem } from '../../systems/StatsSystem.js';
import { updateVitalsHUD } from '../../ui/hudVitals.js';
import { PlayerBurnFX } from '../../particles/PlayerBurnFX.js';
import { resolveObstaclesXZ } from '../../systems/ObstacleSystem.js';
import { getGroundHeightAtXZ, isBlockedByWater } from '../../systems/GroundSystem.js';

// Utils/entities/animator
import { instantiateEntity, buildMixerAndActions } from '../../utils/entityFactory.js';
import { ENTITY_CONFIG } from '../../utils/entities.js';
import { Animator } from '../../components/Animator.js';

// Camera (se il path non combacia, aggiorna)
import { offset as camOffset } from '../../player/cameraFollow.js';
import { gameManager } from '../../managers/gameManager.js';

const PLAYER_RADIUS = 0.4;
const TREE_RADIUS   = 0.6;
const BROADPHASE_R  = 7.0;
const SEP_EPS       = 0.01;
const SPRINT_COST_PER_SEC = 12;
const STAMINA_REGEN_RATE  = 8;
const MANA_REGEN_RATE     = 0;
const BURNING_TIME = 5;
const BURN_DPS = 1;

export class BaseFormController {
  constructor(player, abilities) {
    this.player = player;
    this.abilities = abilities;
    this.isDraining = false;
    this._drainSite = null;
    this._manaPerSecFromTree = 18;

    this.stats = new StatsSystem(120,80,50);
    this.stats.onChange((stats) => { updateVitalsHUD(stats); });

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

    // Input
    this._zeroVec = new THREE.Vector3();
    this._input = { moveVec: new THREE.Vector3(), isShiftPressed: false, isJumpPressed: false };

    // tmp
    this._desired = new THREE.Vector3();
    this._step    = new THREE.Vector3();
    this._prePos  = new THREE.Vector3();
    this._candPos = new THREE.Vector3();
    this._n2D     = new THREE.Vector2();

    // FX burning
    this._isBurning = false;
    this._burningLeft = 0;
    this._burnFx = null;
    this.isBlocking=false;
  }

  // --- Burning / HUD ---
  startBurning() { this._isBurning = true; this._burningLeft = BURNING_TIME; this.startBurningEffect(); }
  stopBurning()  { this._isBurning = false; this._burningLeft = 0; this.stopBurningEffect(); }
  startBurningEffect(){ if (!this._burnFx) this._burnFx = new PlayerBurnFX(this.player.model); this._burnFx.setEnabled(true); }
  stopBurningEffect(){ this._burnFx?.setEnabled(false); }
  takeDamage(damage){ this.stats.damage(damage); }

  // --- Drain ---
  tryStartDrain(site){ if (!site || this.isAttacking) return false; this.isDraining = true; this._drainSite = site; return true; }
  stopDrain(){ this.isDraining = false; this._drainSite = null; }

  // --- Utils ---
  lockMovementFor(sec=0){ this._moveLockT = Math.max(this._moveLockT, sec); }
  setInputState(st){ this._input.moveVec.copy(st.moveVec || this._zeroVec); this._input.isShiftPressed=!!st.isShiftPressed; this._input.isJumpPressed=!!st.isJumpPressed; }
  sitToggle(){ this.isSitting = !this.isSitting; }

  jumpOrFly() {
    if (this._moveLockT > 0 || (this.attackFreezesMovement && this.isAttacking)) return;
    const p = this.player.model.position;
    if (this.abilities?.canFly) {
      const tY = getGroundHeightAtXZ(p.x, p.z, { fromY: p.y + 2.0 });
      const onGround = p.y <= tY + 0.01;
      if (onGround) { this.isFlying = true; this.velY = 10; }
    } else if (this.isOnGround) {
      this.velY = this.abilities?.jumpForce ?? 8;
      this.isOnGround = false;
    }
  }

  update(dt) {
    console.log("STO BLOCCANDO?",this.isBlocking);
    if(this.isBlocking)
      {
        gameManager.controller.stats.useStamina(10*dt);
      }
    // FX burning
    if (this._burnFx) this._burnFx.update(dt);
    if (this._isBurning) {
      if (this._burningLeft <= 0) this.stopBurning();
      else { this.takeDamage(BURN_DPS * dt); this._burningLeft -= dt; }
    }

    // Drain distance guard
    if (this.isDraining && this._drainSite) {
      const posD = this.player?.model?.position;
      if (posD) {
        const dx = posD.x - this._drainSite.x;
        const dz = posD.z - this._drainSite.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 3.2) this.stopDrain();
      }
    }

    const movementLocked = this._moveLockT > 0 || this.isBlocking || (this.attackFreezesMovement && this.isAttacking);
    if (this._moveLockT > 0) this._moveLockT -= dt;

    // Sprint + stamina
    const inputVec = movementLocked ? this._zeroVec : this._input.moveVec;
    const moving = inputVec.lengthSq() > 0;
    const wantsSprint = this._input.isShiftPressed && this.isOnGround && !this.isSitting && !this.isAttacking && moving;
    this.isSprinting = wantsSprint ? this.stats.drainStaminaForSprint(dt, SPRINT_COST_PER_SEC) : false;

    // Movimento orizzontale
    const baseSpeed   = this.abilities?.speed ?? 5;
    const targetSpeed = this.isSprinting ? baseSpeed * 1.8 : baseSpeed;
    this._desired.copy(inputVec).normalize().multiplyScalar(targetSpeed);
    const a = moving ? this.accel : this.decel;
    this.currentVelocity.lerp(this._desired, a * dt);
    this._step.copy(this.currentVelocity).multiplyScalar(dt);

    const pos = this.player.model.position;
    this._prePos.copy(pos);
    this._candPos.copy(pos).add(this._step);

    // Collisione alberi + slide
    if (trees?.getNearbyTrees) {
      const nearby = trees.getNearbyTrees(this._prePos.x, this._prePos.z, BROADPHASE_R);
      const minDist = TREE_RADIUS + PLAYER_RADIUS;
      const minDistSq = minDist * minDist;

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
            best = { dx, dz, dist };
          }
        }
      }

      if (best) {
        const inv = 1 / (best.dist || 1e-6);
        this._n2D.set(best.dx * inv, best.dz * inv);
        const dot = this._step.x * this._n2D.x + this._step.z * this._n2D.y;
        if (dot < 0) {
          this._step.x -= dot * this._n2D.x;
          this._step.z -= dot * this._n2D.y;
        }
        const push = bestPenetration + SEP_EPS;
        this._candPos.x += this._n2D.x * push;
        this._candPos.z += this._n2D.y * push;
      }
    }

    // Ostacoli generici
    resolveObstaclesXZ(this._candPos, PLAYER_RADIUS);

    // Muro invisibile sull’acqua + slide
    {
      const fromY = Math.max(this._prePos.y, this._candPos.y) + 2.0;
      if (isBlockedByWater(this._candPos.x, this._candPos.z, { fromY })) {
        const tryX = !isBlockedByWater(this._prePos.x + this._step.x, this._prePos.z, { fromY });
        const tryZ = !isBlockedByWater(this._prePos.x, this._prePos.z + this._step.z, { fromY });
        this._candPos.copy(this._prePos);

        if (tryX && !tryZ) { this._candPos.x = this._prePos.x + this._step.x; this.currentVelocity.z = 0; }
        else if (!tryX && tryZ) { this._candPos.z = this._prePos.z + this._step.z; this.currentVelocity.x = 0; }
        else if (tryX && tryZ) {
          if (Math.abs(this._step.x) > Math.abs(this._step.z)) { this._candPos.x = this._prePos.x + this._step.x; this.currentVelocity.z = 0; }
          else { this._candPos.z = this._prePos.z + this._step.z; this.currentVelocity.x = 0; }
        } else {
          this.currentVelocity.x = 0; this.currentVelocity.z = 0;
        }
      }
    }

    // Applica posizione finale
    pos.copy(this._candPos);

    // Yaw verso direzione di marcia
    if (!movementLocked && this.currentVelocity.lengthSq() > 1e-3) {
      const yaw = Math.atan2(this.currentVelocity.x, this.currentVelocity.z);
      const cur = this.player.model.rotation.y;
      let d = yaw - cur; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      this.player.model.rotation.y += d * 0.15;
    }

    // Movimento verticale
    const g = this.abilities?.gravity ?? -30;
    if (this.abilities?.canFly && this.isFlying) {
      if (this._input.isJumpPressed)  this.velY += 30 * dt; // su
      if (this._input.isShiftPressed) this.velY -= 30 * dt; // giù
      this.velY += g * 0.2 * dt;
    } else {
      this.velY += g * dt;
    }
    pos.y += this.velY * dt;

    // Colla al suolo / ponte
    this._ensureAboveGround();

    // Regen
    this.stats.regenStamina(dt, STAMINA_REGEN_RATE);
    this.stats.regenMana(dt, MANA_REGEN_RATE);

    // Stato per Animator
    Object.assign(this.player.state, {
      speed: this.currentVelocity.length(),
      isFlying: this.isFlying,
      isSprinting: this.isSprinting,
      isSitting: this.isSitting,
      isAttacking: this.isAttacking,
    });
  }

  _ensureAboveGround() {
    const p = this.player.model.position;
    const groundY = getGroundHeightAtXZ(p.x, p.z, { fromY: p.y + 2.0 });
    if (p.y < groundY) {
      p.y = groundY; this.velY = 0; this.isOnGround = true;
      if (this.isFlying) {
        this.isFlying = false;
        const e = new THREE.Euler().setFromQuaternion(this.player.model.quaternion);
        e.x = 0; e.z = 0; this.player.model.quaternion.setFromEuler(e);
      }
    } else {
      this.isOnGround = false;
    }
  }

  // --- Placeholder: la trasformazione ora vive nei controller specifici ---
  async transform(formKey = 'wyvern') {
    console.warn('[BaseFormController]Missing transform Function override.');
    return this;
  }
}
