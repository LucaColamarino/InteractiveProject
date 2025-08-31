// PortalSpawner.js — Minimal 3D single-portal spawner for Three.js
// Usage:
//   import { PortalSpawner } from './PortalSpawner.js';
//   const spawner = new PortalSpawner(scene, camera); // aggiungi camera
//   spawner.spawn({ position: new THREE.Vector3(10, 2, -5) });
//   // in your game loop: spawner.update(deltaSeconds);
//   // to remove: spawner.remove();

import * as THREE from 'three';

export class PortalSpawner {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera - Necessaria per far guardare il portale verso il player
   */
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.group = null;    // THREE.Group containing the portal
    this._shaderMesh = null;
    this._ringMesh = null;
    this._light = null;
    this._time = 0;
  }

  /**
   * Spawn (or replace) the single portal.
   * @param {Object} opt
   * @param {THREE.Vector3} [opt.position=new THREE.Vector3()]  World position
   * @param {boolean} [opt.lookAtPlayer=true] Se true, il portale guarda sempre il player
   * @param {number} [opt.radius=1.6]  Outer radius in meters
   * @param {number} [opt.thickness=0.15] Ring thickness (outer - inner)
   * @param {THREE.Color|number|string} [opt.color=0x8a2be2] Main color
   * @param {number} [opt.emissive=2.0] Emissive intensity (visual glow)
   */
  spawn(opt = {}) {
    const {
      position = new THREE.Vector3(),
      lookAtPlayer = true,
      radius = 1.6,
      thickness = 0.15,
      color = 0x8a2be2,
      emissive = 2.0,
    } = opt;

    // Remove previous portal if any
    this.remove();

    // Group (for easy transform)
    this.group = new THREE.Group();
    this.group.position.copy(position);

    // Simple ring frame (geometry-only, no post)
    const innerR = Math.max(0.01, radius - thickness);
    const ringGeo = new THREE.RingGeometry(innerR, radius, 96, 1);
    const ringMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color).multiplyScalar(0.35),
      metalness: 0.1,
      roughness: 0.35,
      side: THREE.DoubleSide,
    });
    this._ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.group.add(this._ringMesh);

    // Inner disk con geometria circolare invece di quadrata
    const circleGeo = new THREE.CircleGeometry(innerR, 64);
    const portalMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        u_time: { value: 0.0 },
        u_color: { value: new THREE.Color(color) },
        u_emissive: { value: emissive },
        u_softness: { value: 0.2 },   // edge softness
        u_noiseAmp: { value: 0.25 },  // swirl strength
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0; // [-1,1]x[-1,1]
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec2 vUv;
        uniform float u_time;
        uniform vec3  u_color;
        uniform float u_emissive;
        uniform float u_softness;
        uniform float u_noiseAmp;

        // Tiny hash/noise helpers
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
        float noise(vec2 p){
          vec2 i = floor(p), f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a, b, u.x) + (c - a)*u.y*(1.0 - u.x) + (d - b)*u.x*u.y;
        }

        void main() {
          // Polar coords
          float r = length(vUv);
          float a = atan(vUv.y, vUv.x);

          // Swirl displacement
          float n = noise(vec2(a * 2.0, r * 4.0) + u_time * 0.7);
          float swirl = (n - 0.5) * u_noiseAmp;

          // Feathered circular mask (più morbido)
          float edge = smoothstep(1.0, 1.0 - u_softness, r);

          // Animated radiance
          float rings = 0.4 + 0.6 * sin(10.0 * r - u_time * 2.5 + swirl * 6.0);
          float core = smoothstep(0.0, 0.2, 0.2 - r);
          vec3 col = u_color * (u_emissive * (rings * 0.35 + core * 0.8));

          // Final alpha: inside circle, soft edge
          float alpha = (1.0 - edge) * (0.85 + 0.15 * sin(u_time * 3.0 + r * 12.0));

          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    this._shaderMesh = new THREE.Mesh(circleGeo, portalMat);
    this.group.add(this._shaderMesh);

    // Subtle point light to sell the glow (optional, cheap)
    this._light = new THREE.PointLight(new THREE.Color(color), 0.8, radius * 6.0, 2.0);
    this._light.position.set(0, 0, 0.05); // just in front of the disk
    this.group.add(this._light);

    // Orienta il portale verso il player se richiesto
    if (lookAtPlayer && this.camera) {
      this.group.lookAt(this.camera.position);
    }

    // Add to scene
    this.scene.add(this.group);
  }

  /**
   * Advance the portal animation.
   * Call once per frame with delta time in seconds.
   * @param {number} dt
   */
  update(dt) {
    if (!this.group || !this._shaderMesh) return;
    this._time += dt;
    
    // spin the ring very slightly
    if (this._ringMesh) this._ringMesh.rotation.z += dt * 0.8;

    // animate glow pulse
    if (this._light) this._light.intensity = 0.7 + Math.sin(this._time * 3.0) * 0.15;

    // feed shader time
    this._shaderMesh.material.uniforms.u_time.value = this._time;

    // Far guardare sempre il portale verso il player
    if (this.camera && this.group) {
      this.group.lookAt(this.camera.position);
    }
  }

  /**
   * Remove current portal from scene.
   */
  remove() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.isMesh) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      }
      if (o.isLight && o.dispose) o.dispose();
    });
    this.group = null;
    this._shaderMesh = null;
    this._ringMesh = null;
    this._light = null;
    this._time = 0;
  }

  /**
   * @returns {THREE.Group|null} The portal group (read-only) or null
   */
  get() { return this.group; }
}