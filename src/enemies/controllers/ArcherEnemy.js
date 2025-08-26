// ArcherEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

export class ArcherEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'archer' });

    // --- Distanze chiave ---
    this.visionRange   = opt.visionRange   ?? 28;   // vede/ingaggia il player
    this.attackRange   = opt.attackRange   ?? 16;   // distanza a cui può attaccare
    this.keepOutRange  = opt.keepOutRange  ?? 8;    // troppo vicino → arretra
    this.fleeRange     = opt.fleeRange     ?? this.keepOutRange; // soglia fuga
    this.fleeHyst      = opt.fleeHyst      ?? 0.6;  // isteresi anti-zig-zag
    this.deadzone      = opt.deadzone      ?? 0.75; // isteresi fine

    // --- Velocità (unità/sec) ---
    this.walkSpeed     = opt.walkSpeed     ?? 4.0;  // **camminata**
    this.runSpeed      = opt.runSpeed      ?? 6.5;  // chiude il gap
    this.backSpeed     = opt.backSpeed     ?? 4.0;  // arretramento “calmo”
    this.fleeRunSpeed  = opt.fleeRunSpeed  ?? 7.5;  // corsa di fuga
    this.turnSpeed     = opt.turnSpeed     ?? 7.0;

    // --- Attacco ---
    this.shootCooldown = opt.shootCooldown ?? 1.6;
    this._coolT        = 0;

    // FSM: 'patrol' | 'engage'
    this._state = 'patrol';
    this._fleeing = false;
  }

  update(dt) {
    const playerObj = this.player?.model;
    if (!playerObj || !this.model) {
      this._patrol(dt);
      this._afterUpdate(dt);
      return;
    }

    // Distanza e direzione verso il player (nel piano XZ)
    const pos   = this.model.position;
    const toTgt = new THREE.Vector3().subVectors(playerObj.position, pos);
    const dist  = toTgt.length();
    toTgt.y = 0; toTgt.normalize();

    // Transizioni di stato
    if (this._state === 'patrol') {
      if (dist <= this.visionRange) this._state = 'engage';
    } else {
      if (dist > this.visionRange + this.deadzone) this._state = 'patrol';
    }

    // Comportamento per stato
    if (this._state === 'patrol') {
      this._patrol(dt);
    } else {
      this._engage(dt, toTgt, dist);
    }

    this._afterUpdate(dt);
  }

  _afterUpdate(dt) {
    // Snap al terreno
    const p = this.model.position;
    const y = getTerrainHeightAt(p.x, p.z);
    p.y = THREE.MathUtils.lerp(p.y, y + this.yOffset, Math.min(1, dt * 10));

    // Aggiorna animazioni dalla locomozione
    this.updateAnimFromMove();

    // LOG stato locomozione
    console.log(
      `[ArcherEnemy] state: speed=${(this.state.speed ?? 0).toFixed(2)} ` +
      `sprinting=${!!this.state.isSprinting} ` +
      `backing=${!!this.state.isBacking} ` +
      `fsm=${this._state}${this._fleeing ? ' (fleeing)' : ''}`
    );
  }

  // ====== Stati ======
  _patrol(dt) {
    // vaga lentamente
    this.state.isSprinting = false;
    this.state.isBacking = false;
    this.state.speed = this.walkSpeed * 0.8;
    this.wanderOnGround(dt, 0.6);
  }

  _engage(dt, toTgt, dist) {
    // guarda il bersaglio
    this.faceDirection(toTgt, this.turnSpeed);

    // ===== FLEE con isteresi =====
    if (!this._fleeing && dist < (this.fleeRange - this.fleeHyst)) this._fleeing = true;
    if (this._fleeing && dist > (this.fleeRange + this.fleeHyst)) this._fleeing = false;

    if (this._fleeing) {
      // CORSA ALL'INDIETRO
      const back = toTgt.clone().negate();
      this.model.position.addScaledVector(back, this.fleeRunSpeed * dt);
      this.state.isSprinting = true;
      this.state.isBacking = true;
      this.state.speed = this.fleeRunSpeed;
      return;
    }

    // ===== Zona di tiro: quasi fermo e spara a CD =====
    if (dist <= this.attackRange + this.deadzone && dist >= this.keepOutRange - this.deadzone) {
      this.state.isSprinting = false;
      this.state.isBacking = false;
      this.state.speed = 0.1; // micro movimento per evitare toggle duro
      this._coolT -= dt;
      if (this._coolT <= 0) {
        this.shoot();
        this._coolT = this.shootCooldown * (0.8 + Math.random() * 0.5);
      }
      return;
    }

    // ===== Troppo lontano ma in vista: avvicinati (walk → run se molto lontano) =====
    if (dist > this.attackRange + this.deadzone) {
      const v = (dist > this.attackRange * 1.6) ? this.runSpeed : this.walkSpeed;
      this.state.isSprinting = v === this.runSpeed;
      this.state.isBacking = false;
      this.state.speed = v;
      this.model.position.addScaledVector(toTgt, v * dt);
      return;
    }

    // ===== Un po' troppo vicino ma non critico: cammina indietro =====
    if (dist < this.keepOutRange + this.deadzone) {
      const back = toTgt.clone().negate();
      this.model.position.addScaledVector(back, this.backSpeed * dt);
      this.state.isSprinting = false;
      this.state.isBacking = true;
      this.state.speed = this.backSpeed;
    }
  }

  // ====== Attacco ======
  shoot() {
    if (this.animator?.playAction) {
      this.animator.playAction('shoot');
    } else {
      this.actions?.shoot?.reset?.()?.play?.();
    }
    // TODO: integra il tuo sistema di proiettili
    // e.g. spawnArrow(this.model, { speed: 20, damage: 8 });
  }
}
