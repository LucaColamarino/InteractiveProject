// WerewolfEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

/**
 * WerewolfEnemy — melee, extremely fast, aggressive.
 * Compatibile col nuovo Animator: overlay “attack” sopra locomotion con floor.
 * Durante windup/attack il lupo NON si muove (nessun lunge).
 */
export class WerewolfEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'werewolf' });

    // ===== Perception / ranges =====
    this.visionRange = opt.visionRange ?? 32;
    this.attackRange = opt.attackRange ?? 2.4;
    this.lungeRange  = opt.lungeRange  ?? 4.0;   // (non usata ora per il movimento)
    this.deadzone    = opt.deadzone    ?? 0.7;

    // ===== Locomotion (units / sec) =====
    this.walkSpeed   = opt.walkSpeed   ?? 4.8;
    this.runSpeed    = opt.runSpeed    ?? 9.5;
    this.turnSpeed   = opt.turnSpeed   ?? 10.0;
    this.circleSpeed = opt.circleSpeed ?? 6.0;
    this.backSpeed   = opt.backSpeed   ?? 3.6;

    // ===== Attack timings =====
    this.attackCooldown = opt.attackCooldown ?? 1.0;
    this.windupTime     = opt.windupTime     ?? 0.18;
    this.recoveryTime   = opt.recoveryTime   ?? 0.25;

    // Alias (l’Animator fa già auto-resolve, ma sotto usiamo un fallback aggressivo)
    this.attackAliases = opt.attackAliases || [
      'attack','Attack','ATTACK',
      'Punch','Claw','Bite','Slash','Hit','Melee',
      'Attack01','Attack_1','Attack_A','Strike','Swipe'
    ];

    // FSM
    this._state = 'patrol';                 // 'patrol' | 'hunt' | 'windup' | 'attack' | 'recover'
    this._coolT = 0;                        // cooldown globale
    this._timer = 0;                        // timer stato corrente
    this._circleDir = Math.random() < 0.5 ? -1 : 1;

    // flags transienti
    this._didHit = false;

    // Importante: durante l’attacco non permettere locomotion-driven movement
    this.state.allowLocomDuringAttack = false;
  }

  update(dt) {
    const playerObj = this.player?.model;
    if (!playerObj || !this.model) {
      this._patrol(dt);
      this._afterUpdate(dt);
      return;
    }

    // Direzione verso il target su XZ
    const pos = this.model.position;
    const toTgt3D = new THREE.Vector3().subVectors(playerObj.position, pos);
    const toTgt = new THREE.Vector3(toTgt3D.x, 0, toTgt3D.z);
    const dist = toTgt.length();
    if (dist > 1e-4) toTgt.divideScalar(dist);

    // cooldown
    this._coolT = Math.max(0, this._coolT - dt);

    // ===== Transizioni =====
    if (this._state === 'patrol') {
      if (dist <= this.visionRange) this._enterHunt();
    } else if (this._state === 'hunt') {
      if (dist > this.visionRange + this.deadzone) {
        this._enterPatrol();
      } else if (this._coolT <= 0 && dist <= this.attackRange + this.deadzone) {
        this._enterWindup();
      } else if (this._coolT <= 0 && dist <= this.lungeRange) {
        this._enterWindup();
      }
    }

    // ===== Logica stati =====
    switch (this._state) {
      case 'patrol':   this._patrol(dt); break;
      case 'hunt':     this._hunt(dt, toTgt, dist); break;
      case 'windup':   this._windup(dt, toTgt); break;
      case 'attack':   this._attackStep(dt); break;
      case 'recover':  this._recover(dt); break;
    }

    this._afterUpdate(dt);
  }

  // ---------- Stati ----------
  _enterPatrol() {
    this._state = 'patrol';
    this.state.isSprinting = false;
    this.state.isBacking = false;
    this.state.speed = this.walkSpeed;
  }

  _enterHunt() {
    this._state = 'hunt';
  }

  _enterWindup() {
    this._state = 'windup';
    this._timer = this.windupTime;
    this.state.isSprinting = false;
    this.state.isBacking = false;
    this.state.speed = 0;            // fermo
  }

  _enterAttack(faceDir) {
    this._state = 'attack';
    // Durata = durata della clip attack (fallback 0.6s)
    const dur = this._playAttackOverlay() || 0.6;
    this._timer = dur;               // tieni l’overlay per tutta la clip
    this.state.isAttacking = true;
    this.state.speed = 0;            // fermo
    // orienta verso il target al momento dell’attacco
    if (faceDir && faceDir.lengthSq() > 0) this.faceDirection(faceDir, this.turnSpeed);
  }

  _enterRecover() {
    this._state = 'recover';
    this._timer = this.recoveryTime;
    this.state.isAttacking = false;
    this.state.speed = 0;            // ancora fermo per recovery breve
    this._coolT = this.attackCooldown;
    this.animator?.stopOverlay?.();  // l’Animator fa kick idle e mantiene il floor
  }

  _patrol(dt) {
    this.state.isSprinting = false;
    this.state.isBacking = false;
    const v = this.walkSpeed;
    this.state.speed = v;
    this.wanderOnGround(dt, 0.9);
  }

  _hunt(dt, toTgt, dist) {
    this.faceDirection(toTgt, this.turnSpeed, dt);

    if (this._coolT <= 0 && dist <= this.attackRange + this.deadzone * 0.5) {
      this._enterWindup();
      return;
    }

    if (dist > this.attackRange + this.deadzone) {
      const v = (dist > this.attackRange * 1.8) ? this.runSpeed : this.walkSpeed;
      this.state.isSprinting = v === this.runSpeed;
      this.state.isBacking = false;
      this.state.speed = v;
      this.model.position.addScaledVector(toTgt, v * dt);
      return;
    }

    // Dentro la close range ma in cooldown → circling
    if (this._coolT > 0) {
      this._timer -= dt;
      if (this._timer <= 0) {
        this._timer = 0.6 + Math.random() * 0.6;
        this._circleDir *= -1;
      }
      const tangent = new THREE.Vector3(-toTgt.z * this._circleDir, 0, toTgt.x * this._circleDir).normalize();
      const v = this.circleSpeed;
      this.state.isSprinting = false;
      this.state.isBacking = false;
      this.state.speed = v;
      const forwardBias = toTgt.clone().multiplyScalar(0.25);
      const moveDir = tangent.add(forwardBias).normalize();
      this.model.position.addScaledVector(moveDir, v * dt);
    } else {
      // pronto ma al limite → pressione frontale lenta
      this.state.isSprinting = false;
      this.state.isBacking = false;
      this.state.speed = this.walkSpeed;
    }
  }

  _windup(dt, toTgt) {
    // guarda il target ma resta fermo
    this.faceDirection(toTgt, this.turnSpeed * 1.2, dt);
    this._timer -= dt;
    this.state.speed = 0;
    if (this._timer <= 0) {
      this._enterAttack(toTgt.clone());
    }
  }

  _attackStep(dt) {
    // ATTENZIONE: nessun movimento durante l’attacco
    this.state.speed = 0;

    if (!this._didHit) {
      this._didHit = true;
      // TODO: integrazione melee/overlap reale
      // es:
      // applyMeleeArcDamage(this, { reach: this.attackRange + 0.6, arcDeg: 110, yOffset: 1.0, damage: 14, knockback: 6 });
    }

    this._timer -= dt;
    if (this._timer <= 0) {
      this._didHit = false;
      this._enterRecover();
    }
  }

  _recover(dt) {
    this._timer -= dt;
    this.state.speed = 0;
    if (this._timer <= 0) {
      this._enterHunt();
    }
  }

  _afterUpdate(dt) {
    // Snap terreno
    const p = this.model.position;
    const y = getTerrainHeightAt(p.x, p.z);
    p.y = THREE.MathUtils.lerp(p.y, y + this.yOffset, Math.min(1, dt * 10));

    // Animazioni
    this.updateAnimFromMove();
    this.animator?.update?.(dt);
  }

  // ---------- Overlay attack helper ----------
  _playAttackOverlay() {
    if (!this.animator) return 0;
    // prova gli alias finché non parte
    for (const name of this.attackAliases) {
      const ok = this.animator.playOverlay?.(name, { loop: 'once' });
      if (ok) {
        // ritorna la durata corretta di quella clip
        const d = this.animator.getClipDuration?.(name) || 0.6;
        return d;
      }
    }
    // fallback: prova “attack” comunque
    const ok = this.animator.playOverlay?.('attack', { loop: 'once' });
    return (ok ? (this.animator.getClipDuration?.('attack') || 0.6) : 0);
  }
}
