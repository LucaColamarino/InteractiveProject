// WerewolfEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';

/**
 * WerewolfEnemy — melee aggressivo con lunge e colpo ad arco frontale.
 * Overlay "attack" sopra la locomotion, con finestra di hit singola per attacco.
 */
export class WerewolfEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'werewolf' });

    // ===== Stats base =====
    this.health = opt.health ?? 120;
    this.xp     = opt.xp     ?? 25;

    // ===== Perception / ranges =====
    this.visionRange = opt.visionRange ?? 34;
    this.attackRange = opt.attackRange ?? 1.25;  // raggio a cui considera "in range"
    this.lungeRange  = opt.lungeRange  ?? 4.5;   // distanza massima per partire col lunge
    this.deadzone    = opt.deadzone    ?? 0.8;

    // ===== Locomotion (units / sec) =====
    this.walkSpeed   = opt.walkSpeed   ?? 4.8;
    this.runSpeed    = opt.runSpeed    ?? 9.6;
    this.turnSpeed   = opt.turnSpeed   ?? 12.0;
    this.circleSpeed = opt.circleSpeed ?? 6.2;
    this.backSpeed   = opt.backSpeed   ?? 3.8;

    // ===== Attack timings =====
    this.attackCooldown = opt.attackCooldown ?? 0.95;
    this.windupTime     = opt.windupTime     ?? 0.18;
    this.recoveryTime   = opt.recoveryTime   ?? 0.24;

    // ===== Melee config =====
    this.meleeDamage = opt.meleeDamage ?? 16;
    this.arcDeg      = opt.arcDeg      ?? 120;     // ampiezza dell’arco frontale
    this.reachExtra  = opt.reachExtra  ?? 0.6;     // margine oltre attackRange
    this.hitFrac     = opt.hitFrac     ?? 0.2;     // colpo più presto (20% della clip)
    this.lungeDist   = opt.lungeDist   ?? 1.2;     // distanza coperta dal lunge durante l’attacco
    this.lungeFrac   = opt.lungeFrac   ?? 0.28;    // porzione iniziale della clip dedicata al lunge
    this.maxLungeSpeed = opt.maxLungeSpeed ?? 10.5; // cap sicurezza
    this.preferredAttackDist = opt.preferredAttackDist ?? 1.2; // distanza comoda

    // Alias per trovare una clip d’attacco sull’Animator
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

    // Transienti attacco
    this._didHit = false;
    this._attackDur = 0.6;                  // fallback
    this._attackTime = 0;                   // tempo interno nella clip
    this._hitTime = 0.2;                    // istante in cui applico il danno
    this._lungeTime = 0.18;                 // quanto dura la fase di lunge all’inizio
    this._lungeDone = false;

    // Durante l’attacco non permettere locomotion-driven movement
    this.state.allowLocomDuringAttack = false;

    // Micro-backoff quando troppo vicino (evita incollaggio)
    this._backoffTimer = 0;

    // Prima ingaggio: avvicinati un po’ di più prima del primo attacco
    this._firstAttack = true;
  }

  /* ========================= LOOP ========================= */
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
      case 'attack':   this._attackStep(dt, toTgt, dist); break;
      case 'recover':  this._recover(dt); break;
    }

    this._afterUpdate(dt);
  }

  /* ========================= STATI ========================= */

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
    this.state.speed = 0; // fermo
  }

  _enterAttack(faceDir) {
    this._state = 'attack';

    // Avvia overlay attacco e misura durata
    const dur = this._playAttackOverlay() || 0.6;
    this._attackDur = dur;
    this._attackTime = 0;

    // istanti chiave in secondi
    this._hitTime   = Math.min(dur - 0.05, Math.max(0.02, dur * this.hitFrac));
    this._lungeTime = Math.min(dur * this.lungeFrac, dur - 0.05);

    // reset transienti
    this._didHit = false;
    this._lungeDone = false;

    this.state.isAttacking = true;
    this.state.speed = 0;

    // dopo il primo attacco, disattivo il comportamento "prima volta"
    this._firstAttack = false;

    // orienta verso il target al momento dell’attacco
    if (faceDir && faceDir.lengthSq() > 0) this.faceDirection(faceDir, this.turnSpeed);
  }

  _enterRecover() {
    this._state = 'recover';
    this._timer = this.recoveryTime;
    this.state.isAttacking = false;
    this.state.speed = 0;
    this._coolT = this.attackCooldown;
    this.animator?.stopOverlay?.();
  }

  _patrol(dt) {
    this.state.isSprinting = false;
    this.state.isBacking = false;
    const v = this.walkSpeed;
    this.state.speed = v;
    this.wanderOnGround(dt, 0.9);
  }

  _hunt(dt, toTgt, dist) {
    // in prima ingaggio permetti di avvicinarti un po' di più
    const minDist = this._firstAttack ? this.preferredAttackDist * 0.8
                                      : this.preferredAttackDist;

    const tooClose = dist < minDist * 0.8;
    if (tooClose) this._backoffTimer = Math.max(this._backoffTimer, 0.12);

    if (this._backoffTimer > 0) {
      this._backoffTimer -= dt;
      const back = toTgt.clone().negate();
      this.model.position.addScaledVector(back, this.backSpeed * dt);
      this.state.isBacking = true;
      this.state.isSprinting = false;
      this.state.speed = this.backSpeed;
      this.faceDirection(toTgt, this.turnSpeed, dt);
      return;
    } else {
      this.state.isBacking = false;
    }

    this.faceDirection(toTgt, this.turnSpeed, dt);

    // Se troppo vicino, non avanzare (mantieni spazio per l'animazione)
    if (dist <= minDist) {
      this.state.isSprinting = false;
      this.state.speed = 0.1;
      return;
    }

    // Avvicinamento
    if (dist > this.attackRange + this.deadzone) {
      const v = (dist > this.attackRange * 1.8) ? this.runSpeed : this.walkSpeed;
      this.state.isSprinting = v === this.runSpeed;
      this.state.speed = v;
      this.model.position.addScaledVector(toTgt, v * dt);
      return;
    }

    // Dentro close range ma in cooldown → circling con bias frontale
    if (this._coolT > 0) {
      this._timer -= dt;
      if (this._timer <= 0) {
        this._timer = 0.6 + Math.random() * 0.6;
        this._circleDir *= -1;
      }
      const tangent = new THREE.Vector3(-toTgt.z * this._circleDir, 0, toTgt.x * this._circleDir).normalize();
      const v = this.circleSpeed;
      this.state.isSprinting = false;
      this.state.speed = v;
      const forwardBias = toTgt.clone().multiplyScalar(0.35);
      const moveDir = tangent.add(forwardBias).normalize();
      this.model.position.addScaledVector(moveDir, v * dt);
    }
  }

  _windup(dt, toTgt) {
    // guarda il target ma resta fermo
    this.faceDirection(toTgt, this.turnSpeed * 1.25, dt);
    this._timer -= dt;
    this.state.speed = 0;
    if (this._timer <= 0) {
      this._enterAttack(toTgt.clone());
    }
  }

  _attackStep(dt, toTgt, dist) {
    this.state.speed = 0;
    this.faceDirection(toTgt, this.turnSpeed * 1.4, dt);

    const action = this.animator?.actions?.attack || null;
    const t = (action && typeof action.time === 'number') ? action.time : (this._attackTime += dt);
    const d = this._attackDur;

    // 1) Lunge, ma fermati a preferredAttackDist
    if (!this._lungeDone && t <= this._lungeTime) {
      const maxAdvance = Math.max(dist - this.preferredAttackDist, 0);
      const speed = Math.min(this.maxLungeSpeed, maxAdvance / Math.max(0.08, this._lungeTime));
      this.model.position.addScaledVector(toTgt, speed * dt);
      this._lungeDone = (t >= this._lungeTime);
    }

    // 2) Finestra hit singola (anticipata)
    if (!this._didHit && t >= this._hitTime) {
      this._didHit = true;
      this._tryApplyMeleeHit();
    }

    // 3) Fine
    if ((action && t >= d - 1e-3) || (!action && this._attackTime >= d - 1e-3)) {
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
    // Snap al terreno
    const p = this.model.position;
    const y = getTerrainHeightAt(p.x, p.z);
    p.y = THREE.MathUtils.lerp(p.y, y + this.yOffset, Math.min(1, dt * 10));

    // Animazioni
    this.updateAnimFromMove();
    this.animator?.update?.(dt);
  }

  /* ========================= MELEE / ANIMATOR ========================= */

  _playAttackOverlay() {
    if (!this.animator) return 0;
    for (const name of this.attackAliases) {
      const ok = this.animator.playOverlay?.(name, { loop: 'once' });
      if (ok) {
        return this.animator.getClipDuration?.(name) || 0.6;
      }
    }
    const ok = this.animator.playOverlay?.('attack', { loop: 'once' });
    return (ok ? (this.animator.getClipDuration?.('attack') || 0.6) : 0);
  }

  _tryApplyMeleeHit() {
    const playerObj = this.player?.model;
    if (!playerObj) return;

    const playerPos = new THREE.Vector3();
    playerObj.getWorldPosition(playerPos);

    const myPos = new THREE.Vector3();
    this.model.getWorldPosition(myPos);

    // Distanza e arco
    const toPlayer = new THREE.Vector3().subVectors(playerPos, myPos);
    const horizontal = new THREE.Vector3(toPlayer.x, 0, toPlayer.z);
    const dist = horizontal.length();

    const reach = this.attackRange + this.reachExtra;
    if (dist > reach) return; // troppo lontano

    if (dist > 1e-4) horizontal.divideScalar(dist);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.quaternion).normalize();
    const cosHalfArc = Math.cos(THREE.MathUtils.degToRad(this.arcDeg * 0.5));
    if (fwd.dot(horizontal) < cosHalfArc) return; // fuori arco frontale

    // === Colpito ===
    try {
      const isBlocking = !!gameManager?.controller?.isBlocking;
      if (isBlocking) {
        const reduced = Math.round(this.meleeDamage * 0.3); // 70% mitigato
        gameManager?.controller?.stats?.damage?.(reduced);
        console.log(`[Werewolf] → BLOCK: danno ridotto a ${reduced}`);
      } else {
        gameManager?.controller?.stats?.damage?.(this.meleeDamage);
        console.log(`[Werewolf] → HIT al player, ${this.meleeDamage} dmg`);
      }

      // opzionale: knockback sempre applicato (anche in parry ma ridotto)
      const kb = isBlocking ? 2.0 : 4.0;
      const imp = horizontal.clone().multiplyScalar(kb);
      gameManager?.controller?.physics?.addImpulse?.(imp);

    } catch (e) {
      console.warn('[Werewolf] damage call failed:', e);
    }
  }

}
