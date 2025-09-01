// src/particles/LeafSiphonFX.js
import * as THREE from 'three';

export class LeafSiphonFX {
  constructor(scene) {
    this.scene = scene;
    this.active = false;

    const MAX_PARTICLES = 60;
    const particleGeometry = new THREE.BufferGeometry();
    this._positions = new Float32Array(MAX_PARTICLES * 3);
    this._velocities = new Float32Array(MAX_PARTICLES * 3);
    this._scales    = new Float32Array(MAX_PARTICLES);
    this._lifetimes = new Float32Array(MAX_PARTICLES);

    particleGeometry.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    particleGeometry.setAttribute('scale',    new THREE.BufferAttribute(this._scales, 1));
    particleGeometry.setAttribute('lifetime', new THREE.BufferAttribute(this._lifetimes, 1));

    const particleMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: `
        attribute float scale;
        attribute float lifetime;
        uniform float time;
        varying float vLifetime;
        void main() {
          vLifetime = lifetime;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float s = scale * (0.6 + 0.4 * sin(time * 5.0 + position.x * 6.0));
          gl_PointSize = s * (50.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float time;
        varying float vLifetime;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float alphaCore = smoothstep(0.5, 0.0, d);
          float pulse = 0.85 + 0.15 * sin(time * 6.0);
          vec3 col = mix(vec3(0.25,0.55,1.0), vec3(0.65,0.85,1.0), pulse);
          float alpha = alphaCore * vLifetime * 0.9;
          gl_FragColor = vec4(col, alpha);
        }
      `
    });

    this.particles = new THREE.Points(particleGeometry, particleMaterial);
    this.particles.visible = false;
    this.scene.add(this.particles);

    const auraGeometry = new THREE.SphereGeometry(0.6, 16, 8);
    const auraMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: { time: { value: 0 }, opacity: { value: 0.28 } },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float opacity;
        varying vec3 vNormal;
        void main() {
          float fresnel = pow(1.0 - abs(vNormal.z), 2.0);
          float pulse = 0.6 + 0.4 * sin(time * 4.0);
          gl_FragColor = vec4(vec3(0.35,0.65,1.0), fresnel * pulse * opacity);
        }
      `
    });

    this.aura = new THREE.Mesh(auraGeometry, auraMaterial);
    this.aura.visible = false;
    this.scene.add(this.aura);

    this._playerRef = null;
    this._playerAnchor = null;
    this._playerYOffset = 1.3;
    this._treeRef = null;

    this._timer = 0;
    this._intensity = 0;
    this.MAX_PARTICLES = MAX_PARTICLES;

    this._tmpV1 = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
    this._tmpV3 = new THREE.Vector3();
  }

  start(playerObj, treeAnchor) {
    this._playerRef = playerObj;
    this._treeRef = treeAnchor;
    this._playerAnchor = this._findPlayerAnchor(playerObj);
    this._playerYOffset = this._computePlayerYOffset(playerObj, this._playerAnchor);

    this.active = true;
    this._timer = 0;
    this._intensity = 0;

    this.particles.visible = true;
    this.aura.visible = true;

    this._initializeParticles();
  }

  stop() {
    this.active = false;
    this.particles.visible = false;
    this.aura.visible = false;

    this._playerRef = null;
    this._playerAnchor = null;
    this._treeRef = null;
    this._intensity = 0;
  }

  update(dt) {
    if (!this.active || !this._playerRef || !this._treeRef) return;

    this._timer += dt;
    this._intensity = Math.min(this._intensity + dt * 2, 1);

    const playerPos = this._getPlayerTargetPos(this._tmpV1);
    this._updateParticles(playerPos, dt);
    this._updateAura(playerPos);

    this.particles.material.uniforms.time.value = this._timer;
    this.aura.material.uniforms.time.value = this._timer;
  }

  _getPlayerTargetPos(out) {
    if (this._playerAnchor) return out.setFromMatrixPosition(this._playerAnchor.matrixWorld);
    out.setFromMatrixPosition(this._playerRef.matrixWorld);
    out.y += this._playerYOffset;
    return out;
  }

  _getTreeWorldPos(out) {
    return this._treeRef.getWorldPosition(out);
  }

  _findPlayerAnchor(obj) {
    const names = ['Head','head','Neck','neck','Spine2','spine2','Chest','chest','UpperChest','upperchest','mixamorig:Head','mixamorig:Neck','mixamorig:Spine2','mixamorig:Spine1'];
    let found = null;
    obj.traverse(n => {
      if (found) return;
      const nm = n.name || '';
      if (names.some(s => nm.includes(s))) found = n;
    });
    return found || null;
  }

  _computePlayerYOffset(playerObj, anchor) {
    if (anchor) return 0;
    const box = new THREE.Box3().setFromObject(playerObj);
    const h = Math.max(0, box.max.y - box.min.y);
    if (isFinite(h) && h > 0.2) return Math.max(0.9, Math.min(2.0, h * 0.55));
    return 1.3;
  }

  _updateParticles(playerPos, dt) {
    const accelBase = 2.2;
    const accelRand = 0.6;
    const drag = 0.985;

    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const i3 = i * 3;

      this._positions[i3    ] += this._velocities[i3    ] * dt;
      this._positions[i3 + 1] += this._velocities[i3 + 1] * dt;
      this._positions[i3 + 2] += this._velocities[i3 + 2] * dt;

      const dx = playerPos.x - this._positions[i3    ];
      const dy = playerPos.y - this._positions[i3 + 1];
      const dz = playerPos.z - this._positions[i3 + 2];
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

      if (dist > 0.12) {
        const force = (accelBase + Math.random() * accelRand) * this._intensity * dt;
        const inv = force / (dist || 1.0);
        this._velocities[i3    ] += dx * inv;
        this._velocities[i3 + 1] += dy * inv;
        this._velocities[i3 + 2] += dz * inv;
        this._lifetimes[i] = Math.max(0, 1.0 - dist / 5.0);
      } else {
        this._respawnParticle(i);
      }

      this._velocities[i3    ] *= drag;
      this._velocities[i3 + 1] *= drag;
      this._velocities[i3 + 2] *= drag;
    }

    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.lifetime.needsUpdate = true;
  }

  _updateAura(playerPos) {
    this.aura.position.copy(playerPos);
    this.aura.scale.setScalar(0.6 + 0.4 * this._intensity);
    this.aura.material.uniforms.opacity.value = 0.22 * this._intensity;
  }

  _initializeParticles() {
    const treePos = this._getTreeWorldPos(this._tmpV2);
    for (let i = 0; i < this.MAX_PARTICLES; i++) this._respawnParticle(i, treePos);
    const geo = this.particles.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.scale.needsUpdate = true;
    geo.attributes.lifetime.needsUpdate = true;
  }

  _respawnParticle(index, treePos = this._getTreeWorldPos(this._tmpV2)) {
    const i3 = index * 3;
    const r = 1.2 + Math.random() * 1.8;
    const a = Math.random() * Math.PI * 2;
    const h = 1.0 + Math.random() * 3.0;

    this._positions[i3    ] = treePos.x + Math.cos(a) * r;
    this._positions[i3 + 1] = treePos.y + h;
    this._positions[i3 + 2] = treePos.z + Math.sin(a) * r;

    const p = this._getPlayerTargetPos(this._tmpV1);
    this._tmpV3.set(
      p.x - this._positions[i3    ],
      p.y - this._positions[i3 + 1],
      p.z - this._positions[i3 + 2]
    ).normalize();

    const speed = 0.6 + Math.random() * 0.8;
    this._velocities[i3    ] = this._tmpV3.x * speed + (Math.random() - 0.5) * 0.25;
    this._velocities[i3 + 1] = this._tmpV3.y * speed + (Math.random() - 0.5) * 0.25;
    this._velocities[i3 + 2] = this._tmpV3.z * speed + (Math.random() - 0.5) * 0.25;

    this._scales[index]    = 10 + Math.random() * 14;
    this._lifetimes[index] = 0.2 + Math.random() * 0.4;
  }

  getIntensity() { return this._intensity; }
  setIntensity(v) { this._intensity = Math.max(0, Math.min(1, v)); }
}
