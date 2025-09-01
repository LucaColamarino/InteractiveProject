import * as THREE from 'three';
import { getEnemies } from '../../enemies/EnemyManager.js';
function _closestPointParamAndDistSqToSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ap = new THREE.Vector3().subVectors(p, a);
  const abLenSq = ab.lengthSq();
  let t = abLenSq > 1e-12 ? ap.dot(ab) / abLenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const closest = new THREE.Vector3().copy(a).addScaledVector(ab, t);
  const distSq = p.distanceToSquared(closest);
  return { t, distSq };
}
function _enemyRadius(e) {
  if (e._colRadius) return e._colRadius;
  let r = 0.6;
  const obj = e.model;
  if (obj) {
    const geom = obj.geometry;
    if (geom?.boundingSphere) {
      r = Math.max(r, geom.boundingSphere.radius * obj.scale.length() / Math.sqrt(3));
    } else if (geom?.boundingBox) {
      const bb = geom.boundingBox;
      const halfDiag = new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.5).length();
      r = Math.max(r, halfDiag * obj.scale.length() / Math.sqrt(3));
    } else {
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty() === false) {
        const halfDiag = new THREE.Vector3().subVectors(box.max, box.min).multiplyScalar(0.5).length();
        r = Math.max(r, halfDiag);
      }
    }
  }
  e._colRadius = r;
  return r;
}
export class MagicProjectile {
  constructor(sceneRoot, opts = {}) {
    this.radius = opts.radius ?? 0.5;
    const size = opts.size ?? 0.18;
    this.baseColor = new THREE.Color(opts.color ?? 0x66ccff);
    this.group = new THREE.Group();
    this.group.visible = false;
    sceneRoot.add(this.group);
    this.createCore(size);
    this.createEnergyRing(size);
    this.createParticles(size);
    this.createGlow(size);
    this.createTrail();
    this.active = false;
    this.life = 0;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.target = null;
    this.time = 0;
    this.trailPoints = [];
    this._prevPos = new THREE.Vector3();
  }
  createCore(size) {
    const coreGeom = new THREE.SphereGeometry(1, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({
      color: this.baseColor,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.core = new THREE.Mesh(coreGeom, coreMat);
    this.core.scale.setScalar(size);
    this.group.add(this.core);
    const innerGeom = new THREE.SphereGeometry(1, 12, 12);
    const innerMat = new THREE.MeshBasicMaterial({
      color: this.baseColor.clone().multiplyScalar(1.5),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.innerCore = new THREE.Mesh(innerGeom, innerMat);
    this.innerCore.scale.setScalar(size * 0.6);
    this.group.add(this.innerCore);
  }
  createEnergyRing(size) {
    const ringGeom = new THREE.TorusGeometry(1.5, 0.1, 8, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.baseColor.clone().lerp(new THREE.Color(0xffffff), 0.3),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.energyRing = new THREE.Mesh(ringGeom, ringMat);
    this.energyRing.scale.setScalar(size * 0.8);
    this.group.add(this.energyRing);
  }

  createParticles(size) {
    const particleCount = 20;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const radius = Math.random() * size * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      const color = this.baseColor.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.5);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
      sizes[i] = Math.random() * 0.003 + 0.001;
    }
    const particleGeom = new THREE.BufferGeometry();
    particleGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeom.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const particleMat = new THREE.PointsMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
      size: 0.2
    });
    this.particles = new THREE.Points(particleGeom, particleMat);
    this.group.add(this.particles);
  }
  createGlow(size) {
    const glowGeom = new THREE.SphereGeometry(1, 12, 12);
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.baseColor.clone().multiplyScalar(0.3),
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide
    });
    this.glow = new THREE.Mesh(glowGeom, glowMat);
    this.glow.scale.setScalar(size * 3);
    this.group.add(this.glow);
  }
  createTrail() {
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailMaterial = new THREE.LineBasicMaterial({
      color: this.baseColor,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 3
    });
    this.trail = new THREE.Line(this.trailGeometry, this.trailMaterial);
    this.group.add(this.trail);
    this.trailPoints = [];
    this.maxTrailPoints = 15;
  }
  activate(origin, dir, speed, lifetime, target = null) {
    this.group.position.copy(origin);
    this._prevPos.copy(origin);
    this.vel.copy(dir).multiplyScalar(speed);
    this.speed = speed;
    this.life = lifetime;
    this.target = target;
    this.active = true;
    this.group.visible = true;
    this.time = 0;
    this.trailPoints = [];
    this.updateTrail();
  }
  deactivate() {
    if (!this.active) return;
    this.active = false;
    this.group.visible = false;
    this.target = null;
    this.life = 0;
    this.speed = 0;
    this.vel.set(0,0,0);
    this.time = 0;
    this.trailPoints = [];
  }
  steerToTarget(homing, dt) {
    if (!this.target || !this.target.alive || homing <= 0) return;
    const desiredDir = new THREE.Vector3()
      .subVectors(this.target.model.position, this.group.position)
      .normalize();
    const curDir = this.vel.lengthSq() > 1e-12
      ? this.vel.clone().normalize()
      : desiredDir.clone();
    const dot = THREE.MathUtils.clamp(curDir.dot(desiredDir), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) { this.vel.copy(desiredDir).multiplyScalar(this.speed); return; }
    const maxTurn = Math.max(0, homing) * dt;
    const t = Math.min(1, maxTurn / angle);
    const newDir = curDir.lerp(desiredDir, t).normalize();
    this.vel.copy(newDir).multiplyScalar(this.speed);
  }
  updateVisualEffects(dt) {
    if (!this.active) return;
    this.time += dt;
    const pulse = Math.sin(this.time * 15) * 0.2 + 1;
    this.innerCore.scale.setScalar(this.core.scale.x * 0.6 * pulse);
    this.energyRing.rotation.x += dt * 8;
    this.energyRing.rotation.y += dt * 6;
    this.particles.rotation.x += dt * 2;
    this.particles.rotation.y += dt * 3;
    this.particles.rotation.z += dt * 1.5;
    const glowPulse = Math.sin(this.time * 8) * 0.1 + 1;
    this.glow.scale.setScalar(this.core.scale.x * 3 * glowPulse);
    const glowOpacity = (Math.sin(this.time * 10) * 0.1 + 0.3) * (this.life / 2);
    this.glow.material.opacity = Math.max(0.05, glowOpacity);
    this.updateTrail();
  }
  updateTrail() {
    this.trailPoints.unshift(this.group.position.clone());
    if (this.trailPoints.length > this.maxTrailPoints) this.trailPoints.pop();
    if (this.trailPoints.length > 1) {
      const positions = new Float32Array(this.trailPoints.length * 3);
      for (let i = 0; i < this.trailPoints.length; i++) {
        positions[i * 3] = this.trailPoints[i].x;
        positions[i * 3 + 1] = this.trailPoints[i].y;
        positions[i * 3 + 2] = this.trailPoints[i].z;
      }
      this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.trailGeometry.setDrawRange(0, this.trailPoints.length);
      const trailOpacity = Math.min(0.8, this.life / 1.5);
      this.trailMaterial.opacity = trailOpacity;
    }
  }
  integrate(dt) {
    this._prevPos.copy(this.group.position);
    this.group.position.addScaledVector(this.vel, dt);
    this.life -= dt;
    this.updateVisualEffects(dt);
    if (this.life <= 0) {
      this.deactivate();
    }
  }
  checkCollision() {
    if (!this.active) return null;
    const p0 = this._prevPos;
    const p1 = this.group.position;
    const almostStatic = p0.distanceToSquared(p1) < 1e-10;
    let bestEnemy = null;
    let bestT = Infinity;
    const projR = this.radius;
    const _testEnemy = (e, label) => {
      if (!e?.alive || !e.model) return;
      const center = e.model.position;
      const r = projR + _enemyRadius(e);
      if (almostStatic) {
        if (center.distanceTo(p1) <= r) {
          if (1 < bestT) { bestT = 1; bestEnemy = e; }
        }
        return;
      }
      const { t, distSq } = _closestPointParamAndDistSqToSegment(center, p0, p1);
      if (distSq <= r * r) {
        if (t < bestT) { bestT = t; bestEnemy = e; }
      }
    };
    if (this.target) _testEnemy(this.target, 'locked target');
    const enemies = getEnemies();
    for (const e of enemies) {
      if (e === this.target) continue;
      _testEnemy(e, 'enemy');
    }
    if (bestEnemy) {
      return bestEnemy;
    }
    return null;
  }
  get mesh() { return this.group; }
}
