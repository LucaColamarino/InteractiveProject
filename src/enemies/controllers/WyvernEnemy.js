import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';
import { FireBreathCone } from '../../particles/FireBreathCone.js';

const BOSS_NAME = 'AZHARYX, ASH VORTEX';

export class WyvernEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'wyvern' });

    this.health = opt.health ?? 30;
    this.maxHealth = this.health;
    this._prevHealth = this.health;
    this._deathNotified = false;
    this.xp = opt.xp ?? 250;
    this.engageRange = opt.engageRange ?? 45;
    this._engagedBoss = false;
    this._bossUiId = `wyvern-${(Math.random() * 1e9 | 0).toString(16)}`;

    this.altitudeMin = opt.altitudeMin ?? 15;
    this.altitudeMax = opt.altitudeMax ?? 20;
    this.flySpeed = opt.flySpeed ?? 6.5;
    this.turnK = opt.turnK ?? 6.0;
    this.yOffset = opt.yOffset ?? 0;

    this.orbitRadius = opt.orbitRadius ?? 20;
    this.minAirDistance = opt.minAirDistance ?? Math.max(15, this.orbitRadius * 0.9);
    this.orbitTightenK = opt.orbitTightenK ?? 2.5;

    const fireLength = opt.fireLength ?? 30;
    const fireRadius = opt.fireRadius ?? 1.5;
    this.fireDps = opt.fireDps ?? 5;
    this.breathIntensity = opt.breathIntensity ?? 10;

    this._fire = new FireBreathCone({
      length: fireLength,
      radius: fireRadius,
      intensity: this.breathIntensity,
      renderOrder: 1000
    });

    this.animClips = {
      idle: 'metarig|metarig|metarig|idle',
      groundFire: 'metarig|metarig|metarig|fire',
      takeoff: 'metarig|metarig|metarig|takeoff',
      airFlame: 'metarig|flapingFiring'
    };
    this._activeAnim = null;

    this.behaviorState = 'idle';
    this.stateTimer = 0;
    this._altitude = this._randAltitude();
    this._mouthRef = null;

    this._atkT = 0;
    this._ATK_WARMUP = 0.20;
    this._ATK_BURST = 0.50;
    this._ATK_SUSTAIN = 1.60;
    this._ATK_WINDDOWN = 0.60;
    this._ATK_TOTAL = this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN + this._ATK_WINDDOWN;

    this.airBurstsPerCycle = opt.airBurstsPerCycle ?? 2;
    this.airMaxTime = opt.airMaxTime ?? 14.0;
    this._airBurstsDone = 0;
    this._airPause = 0.6;
    this._airPauseLeft = 0;
    this._airTime = 0;

    this.mouthBoneName = opt.mouthBoneName ?? null;
    this.invertForward = !!opt.invertForward;

    this._playerCapsule = {
      height: opt.playerHeight ?? 1.7,
      radius: opt.playerRadius ?? 0.35,
      centerYOffset: opt.playerCenterYOffset ?? 0.9
    };

    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this._isFiring = false;
  }

  onModelReady() {
    this._tryHookMouth();
    this.model.traverse(o => { o.frustumCulled = false; });
    this._fire.setIntensity(this.breathIntensity);
    this._fire.setRotationOffsetDegrees?.(-35, 0, 0);
    this._enterIdle(true);
  }

  update(dt) {
    this._tryHookMouth();
    this._fire.update?.(dt);
    this.stateTimer += dt;

    if (this.health !== this._prevHealth) {
      if (!this._engagedBoss) this._dispatchBossEngage();
      window.dispatchEvent(new CustomEvent('boss:update', {
        detail: { id: this._bossUiId, cur: this.health }
      }));
      this._prevHealth = this.health;
    }
    if (!this._deathNotified && this.health <= 0) {
      window.dispatchEvent(new CustomEvent('boss:disengage', { detail: { id: this._bossUiId } }));
      this._deathNotified = true;
      this._engagedBoss = false;
    }

    switch (this.behaviorState) {
      case 'idle': this._updateIdle(dt); break;
      case 'ground_fire': this._updateGroundFire(dt); break;
      case 'takeoff': this._updateTakeoff(dt); break;
      case 'air_assault': this._updateAirAssault(dt); break;
      case 'landing_ground': this._updateLandingGround(dt); break;
    }
  }

  _enterIdle(first = false) {
    this.behaviorState = 'idle';
    this.stateTimer = 0;
    this.state.isFlying = false;
    this._atkT = 0;
    this._fire.setActive(false);
    if (!first) this._altitude = this._randAltitude();
    this._setAnim(this.animClips.idle, { loop: 'repeat' });
  }

  _updateIdle(dt) {
    const p = this.model.position;
    const groundY = this._terrainY();
    p.y = THREE.MathUtils.lerp(p.y, groundY + this.yOffset, Math.min(1, dt * 8));

    const dist = this._distanceToPlayer();
    if (dist <= this.engageRange) {
      this._dispatchBossEngage();
      this._enterGroundFire();
    }
  }

  _enterGroundFire() {
    this.behaviorState = 'ground_fire';
    this.stateTimer = 0;
    this.state.isFlying = false;
    this._beginFireTimeline();
    this._setAnim(this.animClips.groundFire, { loop: 'once' });
  }

  _updateGroundFire(dt) {
    const p = this.model.position;
    p.y = THREE.MathUtils.lerp(p.y, this._terrainY() + this.yOffset, Math.min(1, dt * 8));
    const player = this.player?.model;
    if (player) {
      const toP = this._tmpDir.subVectors(player.position, p).normalize();
      this.faceDirection(toP, this.turnK * 1.2, dt);
    }
    if (this._updateFireTimeline(dt)) this._enterTakeoff();
  }

  _enterTakeoff() {
    this.behaviorState = 'takeoff';
    this.stateTimer = 0;
    this.state.isFlying = true;
    this._fire.setActive(false);
    this._setAnim(this.animClips.takeoff, { loop: 'once' });
  }

  _updateTakeoff(dt) {
    const p = this.model.position;
    const targetH = this._terrainY() + this._altitude;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 3.2));

    const player = this.player?.model;
    if (player) {
      const toP = this._tmpDir.subVectors(player.position, p).normalize();
      this.faceDirection(toP, this.turnK, dt);
    }

    const clipDur = this.animator?.getClipDuration?.(this.animClips.takeoff) ?? 1.8;
    if (this.stateTimer >= clipDur * 0.95 || Math.abs(p.y - targetH) < 0.3) {
      this._enterAirAssault();
    }
  }

  _enterAirAssault() {
    this.behaviorState = 'air_assault';
    this.stateTimer = 0;
    this._airTime = 0;
    this._airPauseLeft = 0;
    this._airBurstsDone = 0;
    this.state.isFlying = true;
    this._beginFireTimeline();
    this._setAnim(this.animClips.airFlame, { loop: 'repeat' });
  }

  _updateAirAssault(dt) {
    const player = this.player?.model;
    if (!player) { this._enterLandingGround(); return; }
    this._airTime += dt;

    const p = this.model.position;
    const center = player.position;
    const targetH = this._terrainY() + this._altitude + Math.sin(this.stateTimer * 1.6) * 0.8;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 2.5));

    const fromCenter = this._tmpDir.subVectors(p, center);
    let dist = fromCenter.length(); if (dist < 0.001) dist = 0.001;
    const outward = fromCenter.clone().normalize();
    const tangent = this._up.clone().cross(fromCenter).normalize();
    const desired = Math.max(this.orbitRadius, this.minAirDistance);
    const tangentialSpeed = this.flySpeed * THREE.MathUtils.clamp(dist / desired, 0.5, 1.0);
    p.addScaledVector(tangent, tangentialSpeed * dt);
    const radialErr = dist - desired;
    p.addScaledVector(outward, -radialErr * this.orbitTightenK * dt);
    if (dist < this.minAirDistance) {
      const push = (this.minAirDistance - dist) * (this.orbitTightenK * 2.5);
      p.addScaledVector(outward, push * dt);
    }

    const toPlayer = this._tmpPos.subVectors(center, p).normalize();
    this.faceDirection(toPlayer, this.turnK * 1.15, dt);

    if (this._isFiring) {
      const finished = this._updateFireTimeline(dt);
      if (finished) {
        this._airBurstsDone++;
        this._airPauseLeft = this._airPause;
        if (this._airBurstsDone >= this.airBurstsPerCycle) { this._enterLandingGround(); return; }
      }
    } else {
      this._airPauseLeft -= dt;
      if (this._airPauseLeft <= 0 && this._distanceToPlayer() <= this._breathEngageRange()) {
        this._beginFireTimeline();
      }
    }

    const far = this._distanceToPlayer() > Math.max(this.engageRange * 1.8, this._fire.length * 1.4);
    if (far || this._airTime >= this.airMaxTime) this._enterLandingGround();
  }

  _enterLandingGround() {
    this.behaviorState = 'landing_ground';
    this.stateTimer = 0;
    this._fire.setActive(false);
    this.state.isFlying = true;
  }

  _updateLandingGround(dt) {
    const p = this.model.position;
    const targetY = this._terrainY() + this.yOffset;
    p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 4.0));
    const pl = this.player?.model;
    if (pl) {
      const toP = this._tmpDir.subVectors(pl.position, p).normalize();
      this.faceDirection(toP, this.turnK, dt);
    }
    if (Math.abs(p.y - targetY) < 0.2 || this.stateTimer > 1.2) {
      this._altitude = this._randAltitude();
      this._enterGroundFire();
    }
  }

  _beginFireTimeline() {
    this._atkT = 0;
    this._isFiring = true;
    this._fire.setActive(true);
  }

  _updateFireTimeline(dt) {
    this._atkT += dt;

    if (this._atkT <= this._ATK_WARMUP) {
      const t = this._atkT / this._ATK_WARMUP;
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity * 0.3, this.breathIntensity * 0.9, t));
      this._applyConeDps(dt);
    } else if (this._atkT <= this._ATK_WARMUP + this._ATK_BURST) {
      const t = (this._atkT - this._ATK_WARMUP) / this._ATK_BURST;
      this._fire.addExplosiveBurst?.();
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity * 0.9, this.breathIntensity * 1.2, t));
      this._applyConeDps(dt);
    } else if (this._atkT <= this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN) {
      this._fire.setIntensity(this.breathIntensity);
      this._applyConeDps(dt);
    } else if (this._atkT <= this._ATK_TOTAL) {
      const t = (this._atkT - (this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN)) / this._ATK_WINDDOWN;
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity, this.breathIntensity * 0.2, t));
      this._applyConeDps(dt);
    }

    if (this._atkT >= this._ATK_TOTAL) {
      this._fire.setActive(false);
      this._isFiring = false;
      this._atkT = 0;
      return true;
    }

    return false;
  }

  _applyConeDps(dt) {
    if (!this._playerInFireVolume()) return;
    const dmg = this.fireDps * dt;
    if (dmg > 0) gameManager?.controller?.stats?.damage?.(dmg);
  }

  _playerInFireVolume() {
    if (!this._fire?.group || !this.player?.model) return false;

    this._fire.group.updateMatrixWorld(true);
    const origin = new THREE.Vector3().setFromMatrixPosition(this._fire.group.matrixWorld);

    const pp = this.player.model.position.clone();
    const axis = pp.clone().sub(origin).normalize();

    const L = this._fire.length;
    const baseR = this._fire.radius;

    const h = this._playerCapsule.height;
    const r = this._playerCapsule.radius;
    const pFeet  = new THREE.Vector3(pp.x, pp.y, pp.z);
    const pChest = new THREE.Vector3(pp.x, pp.y + this._playerCapsule.centerYOffset, pp.z);
    const pHead  = new THREE.Vector3(pp.x, pp.y + h, pp.z);

    const insideCone = (P) => {
      const v = new THREE.Vector3().subVectors(P, origin);
      const z = v.dot(axis);
      if (z < -0.2 || z > L) return false;
      const radial = v.sub(axis.clone().multiplyScalar(z)).length();
      const z01 = THREE.MathUtils.clamp(z / Math.max(L, 1e-3), 0, 1);
      const maxR = THREE.MathUtils.lerp(baseR * 0.10, baseR, z01);
      return radial <= (maxR + r);
    };

    return insideCone(pFeet) || insideCone(pChest) || insideCone(pHead);
  }

  _breathEngageRange() { return this._fire.length * 1.15; }
  _randAltitude() { return this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin); }
  _terrainY() { const p = this.model.position; return getTerrainHeightAt(p.x, p.z); }
  _distanceToPlayer() { if (!this.player?.model) return Infinity; return this.model.position.distanceTo(this.player.model.position); }

  _setAnim(name, opts = {}) {
    if (!name || this._activeAnim === name) return;
    this._activeAnim = name;
    try { this.animator?.play?.(name, { mode: 'full', fade: 0.18, ...opts }); } catch (_) {}
  }

  _tryHookMouth() {
    if (!this.model || this._mouthRef) return;

    const exact = [
      this.mouthBoneName, 'Mouth', 'mouth', 'Mouth_end', 'mouth_end', 'Head', 'head',
      'Head_end', 'head_end', 'metarigHead', 'metarig.head', 'metarig_Head',
      'jaw', 'Jaw', 'jaw_end', 'Jaw_end', 'Snout', 'snout', 'muzzle', 'Muzzle'
    ].filter(Boolean);

    for (const name of exact) {
      const bone = this.model.getObjectByName(name);
      if (bone) { this._mouthRef = bone; break; }
    }

    if (!this._mouthRef) {
      const keywords = ['mouth', 'muzzle', 'jaw', 'head', 'snout', 'face', 'teeth', 'skull'];
      let best = null, bestScore = 0;
      this.model.traverse(obj => {
        if (!obj?.name) return;
        const nm = obj.name.toLowerCase();
        for (const kw of keywords) {
          if (nm.includes(kw)) {
            const s = kw === 'mouth' ? 10 : kw === 'head' ? 8 : 5;
            if (s > bestScore) { bestScore = s; best = obj; }
          }
        }
      });
      if (best) this._mouthRef = best;
    }

    const scale = this._getModelScale();
    const mouthOffset = new THREE.Vector3(0, 0.8 * scale, 2.5 * scale);

    if (this._mouthRef) {
      this._fire.attachTo(this._mouthRef, mouthOffset);
      this._fire.invertForward(this.invertForward);
      this._fire.autoscaleFromParentWorldScale?.(1.5, 1.2);
    } else {
      const fallbackOffset = new THREE.Vector3(0, 2.0 * scale, 3.5 * scale);
      this._fire.attachTo(this.model, fallbackOffset);
      this._fire.autoscaleFromParentWorldScale?.(1.8, 1.5);
    }

    this._fire.group.renderOrder = 1001;
    this._fire.group.traverse(child => { if (child.material) { child.renderOrder = 1001; child.frustumCulled = false; } });
  }

  _getModelScale() {
    if (!this.model) return 1.0;
    const s = new THREE.Vector3(); this.model.getWorldScale(s);
    return (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3;
  }

  _dispatchBossEngage() {
    if (this._engagedBoss) return;
    this._engagedBoss = true;
    window.dispatchEvent(new CustomEvent('boss:engage', {
      detail: { id: this._bossUiId, name: BOSS_NAME, max: this.maxHealth, cur: this.health }
    }));
  }
}

export default WyvernEnemy;
