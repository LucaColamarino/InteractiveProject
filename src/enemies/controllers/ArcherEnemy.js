// ArcherEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

export class ArcherEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'archer' });

    // Ranges
    this.visionRange   = opt.visionRange   ?? 28;
    this.attackRange   = opt.attackRange   ?? 16;
    this.keepOutRange  = opt.keepOutRange  ?? 8;
    this.fleeRange     = opt.fleeRange     ?? this.keepOutRange;
    this.fleeHyst      = opt.fleeHyst      ?? 0.6;
    this.deadzone      = opt.deadzone      ?? 0.75;

    // Velocità (puoi rimettere i tuoi valori)
    this.walkSpeed     = opt.walkSpeed     ?? 4.0;
    this.runSpeed      = opt.runSpeed      ?? 6.5;
    this.backSpeed     = opt.backSpeed     ?? 4.0;
    this.fleeRunSpeed  = opt.fleeRunSpeed  ?? 0;//4.0;
    this.turnSpeed     = opt.turnSpeed     ?? 5.0;
    this.patrolSpeed   = opt.patrolSpeed   ?? this.walkSpeed;

    // Attacco
    this.shootCooldown = opt.shootCooldown ?? 1.6;
    this._coolT = 0;

    // FSM
    this._state = 'patrol';
    this._fleeing = false;

    // {t, dur, didShoot}
    this._atk = null;

    // Hook esterno per spawn freccia
    this.onArrowFired = opt.onArrowFired || null;

    this.state.allowLocomDuringAttack = false;
  }

  // ---------- Update ----------
  update(dt) {
    const playerObj = this.player?.model;
    if (!playerObj || !this.model) { this._patrol(dt); this._afterUpdate(dt); return; }

    const pos   = this.model.position;
    const toTgt = new THREE.Vector3().subVectors(playerObj.position, pos);
    const dist  = toTgt.length();
    toTgt.y = 0; toTgt.normalize();

    if (this._state === 'patrol') {
      if (dist <= this.visionRange) this._state = 'engage';
    } else if (dist > this.visionRange + this.deadzone) {
      this._state = 'patrol';
      this._cancelAttack();
    }

    if (this._state === 'engage') {
      if (this._atk) this._updateAttack(dt, toTgt, dist);
      this._engage(dt, toTgt, dist);
    } else {
      this._patrol(dt);
    }

    this._afterUpdate(dt);
  }

  _afterUpdate(dt) {
    const p = this.model.position;
    const y = getTerrainHeightAt(p.x, p.z);
    p.y = THREE.MathUtils.lerp(p.y, y + this.yOffset, Math.min(1, dt * 10));
    this.updateAnimFromMove();
    this.animator?.update?.(dt);
  }

  // ====== Stati ======
  _patrol(dt) {
    this.state.isSprinting = false;
    this.state.isBacking = false;
    const v = this.patrolSpeed;
    this.speed = v;
    this.state.speed = v;
    this.wanderOnGround(dt, 0.6);
  }

  _engage(dt, toTgt, dist) {
    this.faceDirection(toTgt, this.turnSpeed, dt);

    if (!this._atk) {
      if (!this._fleeing && dist < (this.fleeRange - this.fleeHyst)) this._fleeing = true;
      if (this._fleeing && dist > (this.fleeRange + this.fleeHyst)) this._fleeing = false;
    }

    if (this._fleeing) {
      const back = toTgt.clone().negate();
      this.model.position.addScaledVector(back, this.fleeRunSpeed * dt);
      this.state.isSprinting = true; this.state.isBacking = true; this.state.speed = this.fleeRunSpeed;
      return;
    }

    const inShootBand = dist <= this.attackRange + this.deadzone && dist >= this.keepOutRange - this.deadzone;

    if (!this._atk && inShootBand) {
      this._coolT -= dt;
      if (this._coolT <= 0) this._startAttack();
    }

    if (!this._atk) {
      if (dist > this.attackRange + this.deadzone) {
        const v = (dist > this.attackRange * 1.6) ? this.runSpeed : this.walkSpeed;
        this.state.isSprinting = v === this.runSpeed; this.state.isBacking = false; this.state.speed = v;
        this.model.position.addScaledVector(toTgt, v * dt);
      } else if (dist < this.keepOutRange + this.deadzone) {
        const back = toTgt.clone().negate();
        this.model.position.addScaledVector(back, this.backSpeed * dt);
        this.state.isSprinting = false; this.state.isBacking = true; this.state.speed = this.backSpeed;
      } else {
        this.state.isSprinting = false; this.state.isBacking = false; this.state.speed = 0.2;
      }
    } else {
      // durante l'attacco: quasi fermi
      this.state.isSprinting = false; this.state.isBacking = false; this.state.speed = 0.05;
    }
  }

  // --- Attacco ---
  _startAttack() {
    // avvia overlay; la locomotion rimane con floor > 0, quindi niente T-pose
    const ok = this.animator?.playOverlay?.('attack', { loop: 'once' });
    const dur = (ok ? this.animator.getClipDuration('attack') : 2.0) || 2.0;
    this._atk = { t: dur, dur, didShoot: false };
    this.state.isAttacking = true;
  }

  _updateAttack(dt, toTgt, _dist) {
    this.faceDirection(toTgt, this.turnSpeed, dt);
    this._atk.t -= dt;

    const trigAt = Math.max(0.0, this._atk.dur * 0.7);
    if (!this._atk.didShoot && this._atk.t <= trigAt) {
      this._atk.didShoot = true;
      this._shootNow();
    }

    if (this._atk.t <= 0) {
      this._atk = null;
      this.state.isAttacking = false;
      this._coolT = this.shootCooldown * (0.85 + Math.random() * 0.5);
      this.animator?.stopOverlay?.();   // fade out overlay + kick idle
    }
  }

  _cancelAttack() {
    this._atk = null;
    this.state.isAttacking = false;
    this.animator?.stopOverlay?.();
  }

  // ====== Evento freccia ======
  _shootNow() {
    const origin = this.model.position.clone().add(new THREE.Vector3(0, this.yOffset + 1.4, 0));
    const playerObj = this.player?.model;
    const dir = playerObj
      ? new THREE.Vector3().subVectors(playerObj.position.clone().add(new THREE.Vector3(0, 1.2, 0)), origin).normalize()
      : this.model.getWorldDirection(new THREE.Vector3()).setY(0).normalize();

    this.onArrowFired?.(origin, dir, { damage: 10, speed: 24, source: this });

    if (playerObj) {
      const toPlayer = new THREE.Vector3().subVectors(playerObj.position, origin);
      const dist = toPlayer.length();
      const losOK = dist <= this.attackRange + 1.5;
      const facingOK = dir.clone().dot(toPlayer.normalize()) > 0.98;
      if (losOK && facingOK) {
        const playerCtrl = this.player;
        const dealt = 10;
        if (typeof playerCtrl?.applyDamage === 'function') playerCtrl.applyDamage(dealt, { type: 'arrow', from: this });
        else if (typeof playerCtrl?.takeDamage === 'function') playerCtrl.takeDamage(dealt, 'arrow');
      }
    }
  }
}
