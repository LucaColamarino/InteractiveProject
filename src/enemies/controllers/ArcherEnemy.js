// ArcherEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

const IDLE_ARROW_SPEED_THRESH = 0.25; // speed <= soglia => considerato idle-ish

export class ArcherEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'archer' });
    this.health=50;
    // Ranges
    this.visionRange   = opt.visionRange   ?? 28;
    this.attackRange   = opt.attackRange   ?? 16;
    this.keepOutRange  = opt.keepOutRange  ?? 8;
    this.fleeRange     = opt.fleeRange     ?? this.keepOutRange;
    this.fleeHyst      = opt.fleeHyst      ?? 0.6;
    this.deadzone      = opt.deadzone      ?? 0.75;

    // Velocità
    this.walkSpeed     = opt.walkSpeed     ?? 4.0;
    this.runSpeed      = opt.runSpeed      ?? 6.5;
    this.backSpeed     = opt.backSpeed     ?? 4.0;
    this.fleeRunSpeed  = opt.fleeRunSpeed  ?? 4.0;
    this.turnSpeed     = opt.turnSpeed     ?? 5.0;
    this.patrolSpeed   = opt.patrolSpeed   ?? this.walkSpeed;

    // Attacco
    this.shootCooldown = opt.shootCooldown ?? 1.6;
    this._coolT = 0;

    // FSM
    this._state = 'patrol';
    this._fleeing = false;

    // Stato attacco: { elapsed, dur, fireTimeSec, didShoot, action }
    this._atk = null;

    // Hook esterno per spawn freccia
    this.onArrowFired = opt.onArrowFired || null;

    // Riferimenti freccia e bone (nome corretto dal tuo dump)
    this.arrowMesh = opt.model?.userData?.attachments?.arrow || null;
    this.arrowBoneName = 'mixamorigLeft_arch2';
    this._arrowBone = null;

    // locomotion overlay-friendly
    this.state.allowLocomDuringAttack = false;

    if (!this.onArrowFired) {
      console.warn('[Archer] onArrowFired non definito (nessun proiettile verrà spawnato finché non lo imposti).');
    }
  }
  // ====== Arrow refs & visibility helpers ======
  _getArrowRefs() {
    if (!this._arrowRefs) {
      this._arrowRefs = [];
      if (this.arrowMesh) this._arrowRefs.push(this.arrowMesh);
      // raccogli qualsiasi nodo che nel nome contiene "arrow"
      if (this.model) {
        this.model.traverse(o => {
          const nm = (o.name || '').toLowerCase();
          if (nm.includes('arrow') && !this._arrowRefs.includes(o)) this._arrowRefs.push(o);
        });
      }
    }
    return this._arrowRefs;
  }

  _setArrowVisible(v) {
    const refs = this._getArrowRefs();
    for (const o of refs) {
      o.visible = v;
      // cintura e bretelle: propaga ai figli (utile col dual-pass)
      if (o.traverse) o.traverse(c => { if (c !== o) c.visible = v; });
    }
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

    // gestisci visibilità freccia “in mano”
    this._updateArrowInHand();
  }

  // ====== Arrow visibility controller ======
// ====== Arrow visibility controller ======
_updateArrowInHand() {
  if (!this.model) return;

  let wantVisible = false;

  if (this._atk) {
    // durante l'attacco → visibile solo nel wind-up (prima dello scocco)
    wantVisible = !this._atk.didShoot;
  } else {
    // fuori dall'attacco → visibile solo se davvero idle in PATROL
    const isIdlePatrol = (this._state === 'patrol') &&
                         (this.state.speed <= IDLE_ARROW_SPEED_THRESH) &&
                         !this.state.isBacking && !this.state.isSprinting;
    wantVisible = isIdlePatrol;
  }

  // applica solo se cambia
  const refs = this._getArrowRefs();
  const currentlyVisible = refs.some(o => o.visible);
  if (wantVisible !== currentlyVisible) this._setArrowVisible(wantVisible);
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
        // banda "fermo" durante engage
        this.state.isSprinting = false; this.state.isBacking = false; this.state.speed = 0.2;
      }
    } else {
      // durante l'attacco: quasi fermi
      this.state.isSprinting = false; this.state.isBacking = false; this.state.speed = 0.05;
    }
  }

  // ====== Bone helpers ======
  _findArrowBoneOnce() {
    if (this._arrowBone) return this._arrowBone;

    const targetName = (this.arrowBoneName || '').toLowerCase();
    let found = null;

    this.model.traverse(o => {
      if (found) return;
      const nm = (o.name || '').toLowerCase();
      if (nm === targetName) found = o;
    });

    if (found) {
      this._arrowBone = found;
    } else {
    }
    return this._arrowBone;
  }

  _getBoneWorld(posOut, quatOut) {
    const bone = this._findArrowBoneOnce();
    if (!bone) return false;
    bone.updateWorldMatrix(true, false);
    bone.getWorldPosition(posOut);
    bone.getWorldQuaternion(quatOut);
    return true;
  }

  // --- Attacco ---
  _startAttack() {
    const ok = this.animator?.playOverlay?.('attack', { loop: 'once' });
    const action = this.animator?.actions?.attack || null;
    const clipDur = this.animator?.getClipDuration?.('attack') || action?.getClip?.()?.duration || 2.0;
    const dur = ok ? clipDur : 2.0;

    // Frame 9 @ 30fps ≈ 0.30s (clamp di sicurezza)
    const FIRE_FRAME = 9, FPS = 30;
    const fireTimeSec = Math.min(dur - 0.05, Math.max(0, FIRE_FRAME / FPS));

    this._atk = { elapsed: 0, dur, fireTimeSec, didShoot: false, action };
    this.state.isAttacking = true;


    this._setArrowVisible(true)
  }

  _updateAttack(dt, toTgt, _dist) {
    this.faceDirection(toTgt, this.turnSpeed, dt);
    const S = this._atk; if (!S) return;

    // usa il tempo reale della clip se disponibile
    const t = (S.action && typeof S.action.time === 'number') ? S.action.time : (S.elapsed += dt, S.elapsed);
    const d = S.dur;

    if (!S.didShoot && t >= S.fireTimeSec) {
      S.didShoot = true;
      this._shootNow();
      // la visibilità post-scocco verrà gestita da _updateArrowInHand()
    }

    // fine clip
    if ((S.action && t >= d - 1e-3) || (!S.action && S.elapsed >= d - 1e-3)) {
      this._endAttack();
    }
  }

  _endAttack() {
    const S = this._atk;
    if (S?.action?.fadeOut) S.action.fadeOut(0.08);
    this._atk = null;
    this.state.isAttacking = false;
    this._coolT = this.shootCooldown * (0.85 + Math.random() * 0.5);
    this.animator?.stopOverlay?.();
    // NON ripristino visibilità qui: la gestisce _updateArrowInHand() quando torna idle
  }

  _cancelAttack() {
    this._atk = null;
    this.state.isAttacking = false;
    this.animator?.stopOverlay?.();
    // NON ripristino: ci pensa _updateArrowInHand()
  }

  // ====== Evento freccia (aim → player) ======
  _shootNow() {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const gotBone = this._getBoneWorld(pos, quat);

    if (!gotBone) {
      console.warn('[Archer] fallback, uso posizione modello');
      this.model.getWorldPosition(pos);
      this.model.getWorldQuaternion(quat);
      pos.y += this.yOffset + 1.4;
    }

    // direzione verso il player (torace)
    const playerObj = this.player?.model;
    let targetPos = null;
    if (playerObj) {
      targetPos = playerObj.position.clone();
      targetPos.y += 1.2; // mira al torace
    } else {
      const fwd = new THREE.Vector3(0,0,-1)
        .applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0).normalize();
      targetPos = pos.clone().addScaledVector(fwd, 10);
    }

    const dir = targetPos.clone().sub(pos).normalize();
    pos.addScaledVector(dir, 0.18); // piccolo offset per non intersecare l’arco

    // freccia “in mano” si nasconde allo scocco
    this._setArrowVisible(false);
    const speed  = 36;
    const damage = 10;

    if (typeof this.onArrowFired === 'function') {
      this.onArrowFired(pos.clone(), dir.clone(), { damage, speed, source: this, bone: this.arrowBoneName, boneQuat: quat.clone() });
    } else {
      console.warn('[Archer] onArrowFired assente — nessun proiettile spawnato.');
    }
  }
}
