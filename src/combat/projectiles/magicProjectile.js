// combat/projectiles/magicProjectile.js
import * as THREE from 'three';
import { getEnemies } from '../../controllers/npcController.js';

const TAG = '[MagicProjectile]';
const dlog = (...a) => {
  if (typeof window !== 'undefined' && window.__WAND_DEBUG__) console.log(TAG, ...a);
};

export class MagicProjectile {
  /**
   * @param {THREE.Object3D} sceneRoot
   * @param {object} [opts]
   * @param {number} [opts.radius=0.5]
   * @param {number} [opts.size=0.18]
   * @param {THREE.ColorRepresentation} [opts.color=0x66ccff]
   */
  constructor(sceneRoot, opts = {}) {
    this.radius = opts.radius ?? 0.5;
    const size = opts.size ?? 0.18;

    const geom = new THREE.SphereGeometry(1, 14, 14);
    const mat = new THREE.MeshBasicMaterial({
      color: opts.color ?? 0x66ccff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.scale.setScalar(size);
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;

    sceneRoot.add(this.mesh);

    this.active = false;
    this.life = 0;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.target = null;

    dlog('created projectile', { radius: this.radius, size });
  }

  activate(origin, dir, speed, lifetime, target = null) {
    this.mesh.position.copy(origin);
    this.vel.copy(dir).multiplyScalar(speed);
    this.speed = speed;
    this.life = lifetime;
    this.target = target;
    this.active = true;
    this.mesh.visible = true;

    dlog('activate', {
      origin: origin.toArray(),
      dir: dir.toArray(),
      speed,
      lifetime,
      target: target ? (target.model?.uuid || 'enemy') : null
    });
  }

  deactivate() {
    if (!this.active) return;
    dlog('deactivate at', this.mesh.position.toArray(), 'life=', this.life);
    this.active = false;
    this.mesh.visible = false;
    this.target = null;
    this.life = 0;
    this.speed = 0;
    this.vel.set(0,0,0);
  }

  steerToTarget(homing, dt) {
    if (!this.target || !this.target.alive || homing <= 0) return;
    const to = new THREE.Vector3()
      .subVectors(this.target.model.position, this.mesh.position)
      .normalize()
      .multiplyScalar(this.speed);
    const t = Math.min(homing * dt, 1);
    this.vel.lerp(to, t);
    // log leggero (rate-limit mentale: stampa solo saltuariamente se serve)
  }

  integrate(dt) {
    this.mesh.position.addScaledVector(this.vel, dt);
    this.life -= dt;
    if (this.life <= 0) {
      dlog('life expired');
      this.deactivate();
    }
  }

  checkCollision() {
    if (!this.active) return null;
    const R = this.radius;
    if (this.target && this.target.alive) {
      if (this.mesh.position.distanceTo(this.target.model.position) <= (R + 0.8)) {
        dlog('hit locked target');
        return this.target;
      }
    }
    const enemies = getEnemies();
    for (const e of enemies) {
      if (this.mesh.position.distanceTo(e.model.position) <= (R + 0.8)) {
        dlog('hit enemy (area)');
        return e;
      }
    }
    return null;
  }
}
