// WyvernEnemy.js
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';

export class WyvernEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'wyvern' });
    this.health=50;
    this.behaviorState = 'walking';         // 'walking' | 'flying' | 'landing'
    this.stateTimer = 0;
    this.altitude = opt.altitude ?? 12;
    this.flyTime = opt.flyTime ?? 10;
    this.walkTime = opt.walkTime ?? 5;
    this.yOffset = opt.yOffset ?? 0.0;
    this.flySpeed = opt.flySpeed ?? 5.0;
    this.walkSpeed = opt.walkSpeed ?? 1.2;
    this._angle = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.stateTimer += dt;

    const p = this.model.position;
    const terrainY = getTerrainHeightAt(p.x, p.z);

    if (this.behaviorState === 'flying') {
      // tempo di volo trascorso → inizia atterraggio
      if (this.stateTimer > (this.flyTime + Math.random() * 5)) {
        this.behaviorState = 'landing';
      }

      // altezza volo sinusoidale
      const flightHeight = terrainY + this.altitude + Math.sin(this.stateTimer * 2) * 1.5;
      p.y = THREE.MathUtils.lerp(p.y, flightHeight, Math.min(1, dt * 5));

      // direzione/rotta
      this._angle += dt * 0.5;
      const dir = new THREE.Vector3(Math.cos(this._angle), 0, Math.sin(this._angle));
      p.x += dir.x * this.flySpeed * dt;
      p.z += dir.z * this.flySpeed * dt;

      // orientamento
      this.faceDirection(dir, 6.0);

      // state -> animazioni
      this.state.isFlying = true;
      this.state.speed = this.flySpeed;

    } else if (this.behaviorState === 'landing') {
      const targetY = terrainY + this.yOffset;
      p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 3));
      // muovi piano durante la discesa
      const dir = new THREE.Vector3(Math.cos(this._angle), 0, Math.sin(this._angle));
      p.x += dir.x * this.walkSpeed * 0.3 * dt;
      p.z += dir.z * this.walkSpeed * 0.3 * dt;
      this.faceDirection(dir, 6.0);

      if (Math.abs(p.y - targetY) < 0.15) {
        p.y = targetY;
        this.behaviorState = 'walking';
        this.stateTimer = 0;
      }

      this.state.isFlying = false;
      this.state.speed = 0.6;

    } else { // walking
      if (this.stateTimer > (this.walkTime * (0.5 + Math.random()))) {
        this.behaviorState = 'flying';
        this.stateTimer = 0;
        this.altitude = 10 + Math.random() * 6;
      } else {
        // piccolo wander
        this._angle += dt * 0.2;
        const dir = new THREE.Vector3(Math.cos(this._angle), 0, Math.sin(this._angle));
        this.faceDirection(dir, 6.0);
        this.model.position.addScaledVector(dir, this.walkSpeed * dt);

        const targetY = getTerrainHeightAt(p.x, p.z) + this.yOffset;
        p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 6));

        this.state.isFlying = false;
        this.state.speed = this.walkSpeed;
      }
    }

    this.updateAnimFromMove();
  }
}
