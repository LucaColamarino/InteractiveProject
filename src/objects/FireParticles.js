import * as THREE from 'three';
import { scene } from '../scene.js';
export var fire;
export class FireParticles {
  constructor(pos = new THREE.Vector3()) {
    const COUNT = 180;
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const life = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const r = 0.25 * Math.random();
      const a = Math.random() * Math.PI * 2;
      positions[i*3+0] = pos.x + Math.cos(a) * r;
      positions[i*3+1] = pos.y + 0.05;
      positions[i*3+2] = pos.z + Math.sin(a) * r;
      velocities[i*3+0] = (Math.random() - 0.5) * 0.05;
      velocities[i*3+1] = 0.4 + Math.random() * 0.6;
      velocities[i*3+2] = (Math.random() - 0.5) * 0.05;

      life[i] = Math.random();
    }

    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    g.setAttribute('life', new THREE.BufferAttribute(life, 1));

    this.material = new THREE.PointsMaterial({
      size: 0.25,
      sizeAttenuation: true,
      color: 0xffaa55,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = true;
    scene.add(this.points);

    this.tmp = new THREE.Vector3();
  }

  update(dt) {
    const pos = this.points.geometry.attributes.position;
    const vel = this.points.geometry.attributes.velocity;
    const life = this.points.geometry.attributes.life;
    const n = pos.count;

    for (let i = 0; i < n; i++) {
      pos.array[i*3+0] += vel.array[i*3+0] * dt;
      pos.array[i*3+1] += vel.array[i*3+1] * dt;
      pos.array[i*3+2] += vel.array[i*3+2] * dt;

      life.array[i] += dt * 0.6;
      if (life.array[i] > 1) {
        life.array[i] = 0;
        const a = Math.random() * Math.PI * 2;
        const r = 0.25 * Math.random();
        pos.array[i*3+0] = this.points.position.x + Math.cos(a) * r;
        pos.array[i*3+1] = this.points.position.y + 0.05;
        pos.array[i*3+2] = this.points.position.z + Math.sin(a) * r;

        vel.array[i*3+0] = (Math.random() - 0.5) * 0.05;
        vel.array[i*3+1] = 0.4 + Math.random() * 0.6;
        vel.array[i*3+2] = (Math.random() - 0.5) * 0.05;
      }
    }
    this.material.opacity = 0.7 + Math.sin(performance.now()*0.006) * 0.15;
    pos.needsUpdate = true;
  }

  dispose() {
    scene.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
export function spawnStandaloneFire(x, z, y = 0) {
  const fx = new FireParticles(new THREE.Vector3(x, y, z));
  fire = fx;
  return fx;
}
