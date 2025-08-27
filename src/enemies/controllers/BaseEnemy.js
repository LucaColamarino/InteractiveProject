// BaseEnemy.js
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';

export class BaseEnemy {
  constructor(opt = {}) {
    this.type = opt.type ?? 'enemy';
    this.model = opt.model || null;
    this.mixer = opt.mixer || null;
    this.actions = opt.actions || {};
    this.animator = opt.animator || null; // istanza di Animator
    this.forwardYawOffsetDeg = opt.forwardYawOffsetDeg ?? 0;

    this.alive = true;
    this.state = {
      speed: 0,
      isFlying: false,
      isSitting: false,
      isAttacking: false,
      isSprinting: false,
      isBacking: false,
      allowLocomDuringAttack: false,
    };

    this._tmpV = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3(1, 0, 0);

    this.yOffset = opt.yOffset ?? 0;
    this.speed = opt.speed ?? 1.0;
    this.maxUpdateDistance = opt.maxUpdateDistance ?? 250;

    this.target = null;
  }

  get player() { return gameManager.controller?.player || null; }
  setTarget(obj3D) { this.target = obj3D; }

  // Hooks per sottoclassi
  preUpdate(_dt) {}
  postUpdate(_dt) {}

  update(dt) {
    this.preUpdate(dt);

    // default behaviour: wandering
    this.wanderOnGround(dt);
    this.applyGroundHeightSnap(dt);
    this.applyLookForward();

    // aggiorna anims
    this.updateAnimFromMove();
    this.animator?.update?.(dt);

    this.postUpdate(dt);
  }

  faceDirection(dir, turnSpeed = 6.0, dt = 1/60) {
    if (!this.model) return;
    this._tmpV.copy(this.model.position).add(dir);
    const curQuat = this.model.quaternion.clone();
    this.model.lookAt(this._tmpV);
    const targetQuat = this.model.quaternion.clone();

    const yawRad = (this.forwardYawOffsetDeg ?? 0) * Math.PI / 180;
    if (yawRad !== 0) {
      const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yawRad);
      targetQuat.multiply(fix);
    }

    const t = Math.min(1, turnSpeed * dt);
    this.model.quaternion.copy(curQuat).slerp(targetQuat, t);
  }

  moveForward(speed, dt) {
    if (!this.model) return;
    this.model.getWorldDirection(this._tmpDir);
    this._tmpDir.y = 0; this._tmpDir.normalize();
    this.model.position.addScaledVector(this._tmpDir, speed * dt);
  }

  applyGroundHeightSnap(dt, lerpSpeed = 10) {
    if (!this.model) return;
    const x = this.model.position.x, z = this.model.position.z;
    const targetY = getTerrainHeightAt(x, z) + this.yOffset;
    this.model.position.y = THREE.MathUtils.lerp(this.model.position.y, targetY, Math.min(1, dt * lerpSpeed));
    this.state.isFlying = false;
  }

  applyLookForward() {
    if (!this.model) return;
    this.model.getWorldDirection(this._tmpDir);
    const target = this._tmpV.copy(this.model.position).add(this._tmpDir);
    this.model.lookAt(target);
  }

  updateAnimFromMove() {
    const blocking = this.state.isAttacking && !this.state.allowLocomDuringAttack;
    // Lo “blocking” sugli overlay lo gestisce internamente l'Animator: qui passiamo solo lo stato
    this.animator?.setLocomotion?.({
      speed: this.state.speed || 0,
      isFlying: !!this.state.isFlying,
      isSprinting: !!this.state.isSprinting,
      isSitting: !!this.state.isSitting,
      isBacking: !!this.state.isBacking,
      blocking: !!blocking,
    });
  }

  wanderOnGround(dt, angularSpeed = 0.8) {
    this._wanderAngle = (this._wanderAngle ?? Math.random() * Math.PI * 2) + dt * angularSpeed;
    const dir = this._tmpDir.set(Math.cos(this._wanderAngle), 0, Math.sin(this._wanderAngle)).normalize();
    this.faceDirection(dir, 6.0, dt);
    const v = this.speed;
    this.moveForward(v, dt);
    this.state.speed = v;
  }

  onKilled() {}
}
