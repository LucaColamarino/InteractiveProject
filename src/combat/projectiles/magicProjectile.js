// combat/projectiles/magicProjectile.js
import * as THREE from 'three';
import { getEnemies } from '../../enemies/EnemyManager.js';

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
    this.baseColor = new THREE.Color(opts.color ?? 0x66ccff);

    // Gruppo principale che contiene tutti gli effetti
    this.group = new THREE.Group();
    this.group.visible = false;
    sceneRoot.add(this.group);

    // Core del proiettile - sfera interna brillante
    this.createCore(size);
    
    // Anello energetico rotante
    this.createEnergyRing(size);
    
    // Particelle magiche
    this.createParticles(size);
    
    // Glow esterno
    this.createGlow(size);
    
    // Scia luminosa
    this.createTrail();

    this.active = false;
    this.life = 0;
    this.speed = 0;
    this.vel = new THREE.Vector3();
    this.target = null;
    this.time = 0;
    this.trailPoints = [];

    dlog('created magical projectile', { radius: this.radius, size });
  }

  createCore(size) {
    // Sfera centrale con materiale energetico
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

    // Sfera interna più piccola che pulsa
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
    // Anello energetico che ruota attorno al proiettile
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
    // Sistema particellare per scintille magiche
    const particleCount = 20;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);
    
    for (let i = 0; i < particleCount; i++) {
      // Posizioni casuali in una sfera
      const radius = Math.random() * size * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      // Colori con variazioni
      const color = this.baseColor.clone();
      color.lerp(new THREE.Color(0xffffff), Math.random() * 0.5);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
      
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
    // Alone luminoso esterno
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
    // Scia luminosa che segue il proiettile
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
    this.vel.copy(dir).multiplyScalar(speed);
    this.speed = speed;
    this.life = lifetime;
    this.target = target;
    this.active = true;
    this.group.visible = true;
    this.time = 0;
    
    // Reset della scia
    this.trailPoints = [];
    this.updateTrail();

    dlog('activate magical projectile', {
      origin: origin.toArray(),
      dir: dir.toArray(),
      speed,
      lifetime,
      target: target ? (target.model?.uuid || 'enemy') : null
    });
  }

  deactivate() {
    if (!this.active) return;
    dlog('deactivate magical projectile at', this.group.position.toArray(), 'life=', this.life);
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
    const to = new THREE.Vector3()
      .subVectors(this.target.model.position, this.group.position)
      .normalize()
      .multiplyScalar(this.speed);
    const t = Math.min(homing * dt, 1);
    this.vel.lerp(to, t);
  }

  updateVisualEffects(dt) {
    if (!this.active) return;
    
    this.time += dt;
    
    // Pulsazione del core interno
    const pulse = Math.sin(this.time * 15) * 0.2 + 1;
    this.innerCore.scale.setScalar(this.core.scale.x * 0.6 * pulse);
    
    // Rotazione dell'anello energetico
    this.energyRing.rotation.x += dt * 8;
    this.energyRing.rotation.y += dt * 6;
    
    // Rotazione delle particelle
    this.particles.rotation.x += dt * 2;
    this.particles.rotation.y += dt * 3;
    this.particles.rotation.z += dt * 1.5;
    
    // Oscillazione del glow
    const glowPulse = Math.sin(this.time * 8) * 0.1 + 1;
    this.glow.scale.setScalar(this.core.scale.x * 3 * glowPulse);
    
    // Variazione dell'opacità del glow
    const glowOpacity = (Math.sin(this.time * 10) * 0.1 + 0.3) * (this.life / 2); // Fade con la vita
    this.glow.material.opacity = Math.max(0.05, glowOpacity);
    
    // Aggiornamento della scia
    this.updateTrail();
  }

  updateTrail() {
    // Aggiungi punto corrente alla scia
    this.trailPoints.unshift(this.group.position.clone());
    
    // Limita il numero di punti
    if (this.trailPoints.length > this.maxTrailPoints) {
      this.trailPoints.pop();
    }
    
    // Aggiorna la geometria della scia
    if (this.trailPoints.length > 1) {
      const positions = new Float32Array(this.trailPoints.length * 3);
      for (let i = 0; i < this.trailPoints.length; i++) {
        positions[i * 3] = this.trailPoints[i].x;
        positions[i * 3 + 1] = this.trailPoints[i].y;
        positions[i * 3 + 2] = this.trailPoints[i].z;
      }
      
      this.trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.trailGeometry.setDrawRange(0, this.trailPoints.length);
      
      // Fade dell'opacità della scia
      const trailOpacity = Math.min(0.8, this.life / 1.5);
      this.trailMaterial.opacity = trailOpacity;
    }
  }

  integrate(dt) {
    this.group.position.addScaledVector(this.vel, dt);
    this.life -= dt;
    
    // Aggiorna gli effetti visivi
    this.updateVisualEffects(dt);
    
    if (this.life <= 0) {
      dlog('magical projectile life expired');
      this.deactivate();
    }
  }

  checkCollision() {
    if (!this.active) return null;
    const R = this.radius;
    if (this.target && this.target.alive) {
      if (this.group.position.distanceTo(this.target.model.position) <= (R + 0.8)) {
        dlog('hit locked target with magic');
        return this.target;
      }
    }
    const enemies = getEnemies();
    for (const e of enemies) {
      if (this.group.position.distanceTo(e.model.position) <= (R + 0.8)) {
        dlog('hit enemy with magic (area)');
        return e;
      }
    }
    return null;
  }

  // Getter per compatibilità con il vecchio codice
  get mesh() {
    return this.group;
  }
}