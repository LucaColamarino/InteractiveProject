import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

const IDLE_ARROW_SPEED_THRESH = 0.25;

export class ArcherEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'archer' });

    this.health = 50;

    this.visionRange  = opt.visionRange  ?? 28;
    this.attackRange  = opt.attackRange  ?? 16;
    this.keepOutRange = opt.keepOutRange ?? 8;
    this.fleeRange    = opt.fleeRange    ?? this.keepOutRange;
    this.fleeHyst     = opt.fleeHyst     ?? 0.6;
    this.deadzone     = opt.deadzone     ?? 0.75;

    this.walkSpeed    = opt.walkSpeed    ?? 4.0;
    this.runSpeed     = opt.runSpeed     ?? 6.5;
    this.backSpeed    = opt.backSpeed    ?? 4.0;
    this.fleeRunSpeed = opt.fleeRunSpeed ?? 4.0;
    this.turnSpeed    = opt.turnSpeed    ?? 5.0;
    this.patrolSpeed  = opt.patrolSpeed  ?? this.walkSpeed;

    this.shootCooldown = opt.shootCooldown ?? 1.6;
    this._coolT = 0;

    this._state = 'patrol';
    this._fleeing = false;

    this._atk = null;
    this.onArrowFired = opt.onArrowFired || null;

    this.arrowMesh = opt.model?.userData?.attachments?.arrow || null;
    this.arrowBoneName = 'mixamorigLeft_arch2';
    this._arrowBone = null;

    this.state.allowLocomDuringAttack = false;
  }

  _getArrowRefs() {
    if (!this._arrowRefs) {
      this._arrowRefs = [];
      if (this.arrowMesh) this._arrowRefs.push(this.arrowMesh);
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
      if (o.traverse) o.traverse(c => { if (c !== o) c.visible = v; });
    }
  }

  update(dt) {
    const playerObj = this.player?.model;
    if (!playerObj || !this.model) { this._patrol(dt); this._afterUpdate(dt); return; }

    const pos = this.model.position;
    const toTgt = new THREE.Vector3().subVectors(playerObj.position, pos);
    const dist = toTgt.length();
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
    this._updateArrowInHand();
  }

  _updateArrowInHand() {
    if (!this.model) return;
    let wantVisible = false;
    if (this._atk) {
      wantVisible = !this._atk.didShoot;
    } else {
      const isIdlePatrol = (this._state === 'patrol') &&
                           (this.state.speed <= IDLE_ARROW_SPEED_THRESH) &&
                           !this.state.isBacking && !this.state.isSprinting;
      wantVisible = isIdlePatrol;
    }
    const refs = this._getArrowRefs();
    const currentlyVisible = refs.some(o => o.visible);
    if (wantVisible !== currentlyVisible) this._setArrowVisible(wantVisible);
  }

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
      this.state.isSprinting = false; this.state.isBacking = false; this.state.speed = 0.05;
    }
  }

  _findArrowBoneOnce() {
    if (this._arrowBone) return this._arrowBone;
    const targetName = (this.arrowBoneName || '').toLowerCase();
    let found = null;
    this.model.traverse(o => {
      if (found) return;
      const nm = (o.name || '').toLowerCase();
      if (nm === targetName) found = o;
    });
    if (found) this._arrowBone = found;
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

  _startAttack() {
    const ok = this.animator?.playOverlay?.('attack', { loop: 'once' });
    const action = this.animator?.actions?.attack || null;
    const clipDur = this.animator?.getClipDuration?.('attack') || action?.getClip?.()?.duration || 2.0;
    const dur = ok ? clipDur : 2.0;

    const FIRE_FRAME = 9, FPS = 30;
    const fireTimeSec = Math.min(dur - 0.05, Math.max(0, FIRE_FRAME / FPS));

    this._atk = { elapsed: 0, dur, fireTimeSec, didShoot: false, action };
    this.state.isAttacking = true;
    this._setArrowVisible(true);
  }

  _updateAttack(dt, toTgt, _dist) {
    this.faceDirection(toTgt, this.turnSpeed, dt);
    const S = this._atk; if (!S) return;

    const t = (S.action && typeof S.action.time === 'number') ? S.action.time : (S.elapsed += dt, S.elapsed);
    const d = S.dur;

    if (!S.didShoot && t >= S.fireTimeSec) {
      S.didShoot = true;
      this._shootNow();
    }

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
  }

  _cancelAttack() {
    this._atk = null;
    this.state.isAttacking = false;
    this.animator?.stopOverlay?.();
  }

  _shootNow() {
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const gotBone = this._getBoneWorld(pos, quat);

    if (!gotBone) {
      this.model.getWorldPosition(pos);
      this.model.getWorldQuaternion(quat);
      pos.y += this.yOffset + 1.4;
    }

    const playerObj = this.player?.model;
    let targetPos = null;
    if (playerObj) {
      targetPos = playerObj.position.clone();
      targetPos.y += 1.2;
    } else {
      const fwd = new THREE.Vector3(0,0,-1)
        .applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()))
        .setY(0).normalize();
      targetPos = pos.clone().addScaledVector(fwd, 10);
    }

    const dir = targetPos.clone().sub(pos).normalize();
    pos.addScaledVector(dir, 0.18);

    this._setArrowVisible(false);
    const speed = 36;
    const damage = 10;

    if (typeof this.onArrowFired === 'function') {
      this.onArrowFired(pos.clone(), dir.clone(), { damage, speed, source: this, bone: this.arrowBoneName, boneQuat: quat.clone() });
    }
  }
}
