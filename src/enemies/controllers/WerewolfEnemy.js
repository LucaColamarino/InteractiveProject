// WerewolfEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

/**
 * WerewolfEnemy — melee, extremely fast, aggressive.
 *
 * Takes ArcherEnemy as a reference for the general structure
 * but adapts state, speeds and attack logic for close‑quarters combat.
 */
export class WerewolfEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'werewolf' });

    // ===== Perception / ranges =====
    this.visionRange   = opt.visionRange   ?? 32;  // very aware
    this.attackRange   = opt.attackRange   ?? 2.4; // slash distance
    this.lungeRange    = opt.lungeRange    ?? 4.0; // can lunge from a bit farther
    this.deadzone      = opt.deadzone      ?? 0.7; // hysteresis to avoid chattering

    // ===== Locomotion (units / sec) =====
    this.walkSpeed     = opt.walkSpeed     ?? 4.8;  // prowl
    this.runSpeed      = opt.runSpeed      ?? 9.5;  // sprint — much faster than archer
    this.turnSpeed     = opt.turnSpeed     ?? 10.0; // snappy turns
    this.circleSpeed   = opt.circleSpeed   ?? 6.0;  // strafing speed when close

    // ===== Attack timings =====
    this.attackCooldown = opt.attackCooldown ?? 1.0; // time between attacks
    this.windupTime     = opt.windupTime     ?? 0.18; // short windup before lunge
    this.recoveryTime   = opt.recoveryTime   ?? 0.25; // brief recovery after hit
    this.lungeSpeed     = opt.lungeSpeed     ?? 14.0; // forward burst during attack

    // Animation clip names (adapt to your rig)
    this.clipNames = {
      run:     opt.clipNames?.run     ?? 'run',
      walk:    opt.clipNames?.walk    ?? 'walk',
      idle:    opt.clipNames?.idle    ?? 'idle',
      attack:  opt.clipNames?.attack  ?? 'attack', // claw / bite
      roar:    opt.clipNames?.roar    ?? 'roar',
      hit:     opt.clipNames?.hit     ?? 'hit',
      die:     opt.clipNames?.die     ?? 'die',
    };

    // FSM: 'patrol' | 'hunt' | 'windup' | 'attack' | 'recover'
    this._state = 'patrol';
    this._coolT = 0;       // attack cooldown timer
    this._timer = 0;       // generic state timer (windup/recovery/strafe switch)

    // Small randomness for circling direction
    this._circleDir = Math.random() < 0.5 ? -1 : 1; // -1 left, +1 right
  }

  update(dt) {
    const playerObj = this.player?.model;
    if (!playerObj || !this.model) {
      this._patrol(dt);
      this._afterUpdate(dt);
      return;
    }

    // Vector to target (XZ)
    const pos   = this.model.position;
    const toTgt = new THREE.Vector3().subVectors(playerObj.position, pos);
    const dist  = toTgt.length();
    toTgt.y = 0; toTgt.normalize();

    // Global cooldown countdown
    this._coolT = Math.max(0, this._coolT - dt);

    // ===== State transitions based on distance =====
    if (this._state === 'patrol') {
      if (dist <= this.visionRange) this._enterHunt();
    } else if (this._state === 'hunt') {
      if (dist > this.visionRange + this.deadzone) this._enterPatrol();
      else if (this._coolT <= 0 && dist <= this.lungeRange) this._enterWindup();
    }

    // ===== State logic =====
    switch (this._state) {
      case 'patrol':   this._patrol(dt); break;
      case 'hunt':     this._hunt(dt, toTgt, dist); break;
      case 'windup':   this._windup(dt, toTgt); break;
      case 'attack':   this._attackStep(dt); break;
      case 'recover':  this._recover(dt); break;
    }

    this._afterUpdate(dt);
  }

  // ---------- States ----------
  _enterPatrol() {
    this._state = 'patrol';
    this.state.isSprinting = false;
  }

  _enterHunt() {
    this._state = 'hunt';
  }

  _enterWindup() {
    this._state = 'windup';
    this._timer = this.windupTime;
    this.state.isSprinting = false;
    this.state.speed = 0;
    // Optional animation cue before the leap
    this._play(this.clipNames.roar) || this._play(this.clipNames.idle);
  }

  _enterAttack(forwardDir) {
    this._state = 'attack';
    this._timer = 0.12; // active frames window (short & deadly)
    // Cache lunge direction at the start of the attack
    this._lungeDir = forwardDir?.clone() || new THREE.Vector3(0,0,-1);
    this._play(this.clipNames.attack);
    this.state.isAttacking = true;
  }

  _enterRecover() {
    this._state = 'recover';
    this._timer = this.recoveryTime;
    this.state.isAttacking = false;
    this._coolT = this.attackCooldown; // set CD at start of recovery
  }

  _patrol(dt) {
    this.state.isSprinting = false;
    this.speed = this.walkSpeed;
    this.wanderOnGround(dt, 0.9);
  }

  _hunt(dt, toTgt, dist) {
    // Always face target quickly
    this.faceDirection(toTgt, this.turnSpeed);

    // Close the gap aggressively
    if (dist > this.attackRange + this.deadzone) {
      const v = (dist > this.attackRange * 1.8) ? this.runSpeed : this.walkSpeed;
      this.state.isSprinting = v === this.runSpeed;
      this.state.speed = v;
      this.model.position.addScaledVector(toTgt, v * dt);
      return;
    }

    // Within close range but on cooldown → circle/strafe to feel alive
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = 0.6 + Math.random() * 0.6; // switch side occasionally
      this._circleDir *= -1;
    }
    // tangent = rotate toTgt by ±90° on Y
    const tangent = new THREE.Vector3(-toTgt.z * this._circleDir, 0, toTgt.x * this._circleDir).normalize();
    const v = this.circleSpeed;
    this.state.isSprinting = false;
    this.state.speed = v;
    // small forward bias to keep pressure
    const forwardBias = toTgt.clone().multiplyScalar(0.35);
    const moveDir = tangent.add(forwardBias).normalize();
    this.model.position.addScaledVector(moveDir, v * dt);
  }

  _windup(dt, toTgt) {
    // Face target and wait a short moment, then lunge
    this.faceDirection(toTgt, this.turnSpeed * 1.2);
    this._timer -= dt;
    this.state.speed = 0;
    if (this._timer <= 0) {
      // Capture current forward for the lunge
      const forward = toTgt.clone();
      this._enterAttack(forward);
    }
  }

  _attackStep(dt) {
    // Burst forward in the cached lunge direction
    const dir = this._lungeDir || new THREE.Vector3(0,0,-1);
    this.model.position.addScaledVector(dir, this.lungeSpeed * dt);
    this.state.speed = this.lungeSpeed;

    // Perform hit check during active window
    if (!this._didHit) {
      this._didHit = true;
      // TODO: integrate your melee overlap / arc system here
      // Example:
      // applyMeleeArcDamage(this, {
      //   reach: this.attackRange + 0.8,
      //   arcDeg: 110,
      //   yOffset: 1.0,
      //   damage: 14,
      //   knockback: 6,
      // });
    }

    this._timer -= dt;
    if (this._timer <= 0) {
      this._didHit = false;
      this._enterRecover();
    }
  }

  _recover(dt) {
    this._timer -= dt;
    // slow down slightly while recovering
    this.state.speed = Math.max(0, this.state.speed - 12 * dt);
    if (this._timer <= 0) {
      this._enterHunt();
    }
  }

  _afterUpdate(dt) {
    // Snap to terrain
    const p = this.model.position;
    const y = getTerrainHeightAt(p.x, p.z);
    p.y = THREE.MathUtils.lerp(p.y, y + this.yOffset, Math.min(1, dt * 10));

    // Feed animator
    this.updateAnimFromMove();
  }

  // ---------- Anim helper ----------
  _play(name) {
    if (!name) return false;
    if (this.animator?.playAction) {
      this.animator.playAction(name);
      return true;
    }
    const a = this.actions?.[name];
    if (a?.reset) { a.reset().play?.(); return true; }
    return false;
  }
}
