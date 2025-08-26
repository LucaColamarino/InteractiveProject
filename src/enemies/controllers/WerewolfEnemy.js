// WerewolfEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

export class WerewolfEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'werewolf' });
    this.walkSpeed   = opt.walkSpeed ?? 1.3;
    this.runSpeed    = opt.runSpeed  ?? 3.4;
    this.attackRange = opt.attackRange ?? 2.1;
    this.aggroRange  = opt.aggroRange ?? 22;
    this.turnSpeed   = opt.turnSpeed ?? 8.5;
    this._attackCd   = 0;
  }

  update(dt) {
    const tgt = this.target ?? this.player?.model;
    if (!tgt || !this.model) return super.update(dt);

    const pos = this.model.position;
    const toTgt = new THREE.Vector3().subVectors(tgt.position, pos);
    const dist = toTgt.length();
    toTgt.y = 0; toTgt.normalize();

    // orienta verso bersaglio
    this.faceDirection(toTgt, this.turnSpeed);

    // semplice FSM: idle → chase → attack
    if (dist < this.attackRange) {
      // attacco a cooldown
      this._attackCd -= dt;
      this.state.speed = 0;
      if (this._attackCd <= 0) {
        this._attackCd = 1.1; // cooldown breve
        this.attack();
      }
    } else if (dist < this.aggroRange) {
      // inseguimento
      const v = dist > 10 ? this.runSpeed : this.walkSpeed;
      this.state.isSprinting = v === this.runSpeed;
      this.state.speed = v;
      this.moveForward(v, dt);
    } else {
      // wander
      this.state.isSprinting = false;
      this.speed = this.walkSpeed;
      this.wanderOnGround(dt);
    }

    // terreno
    const y = getTerrainHeightAt(pos.x, pos.z);
    pos.y = THREE.MathUtils.lerp(pos.y, y + this.yOffset, Math.min(1, dt * 10));

    // animazioni
    this.updateAnimFromMove();
  }

  attack() {
    // animazione
    if (this.animator?.playAction) {
      this.animator.playAction('attack');
    } else {
      this.actions?.attack?.reset?.()?.play?.();
    }
    // TODO: esegui hit arc in avanti (usa tuo sistema combat/overlap)
    // e.g., applyMeleeArcDamage(this, {reach:2.4, arcDeg:90, damage:10});
  }
}
