import * as THREE from 'three';
import { FireJetSystem } from './FireJetSystem.js';

export class FireBreathCone {
  constructor(opts = {}) {
    this.parent      = opts.parent || null;
    this.localOffset = (opts.localOffset || new THREE.Vector3(0, 0.6, 2.2)).clone();
    this.length      = opts.length    ?? 8.0;
    this.radius      = opts.radius    ?? 2.5;
    this.intensity   = opts.intensity ?? 6.0;
    this.renderOrder = opts.renderOrder ?? 999;

    this._active     = false;
    this._forcedTime = 0;
    this._fade = 0;
    this._fadeInK  = 6.0;
    this._fadeOutK = 5.0;
    this._helpersOn = false;
    this._time = 0;

    this.particleCount = 300;
    this.sparkCount    = 50;
    this.smokeCount    = 0;

    this.group = new THREE.Group();
    this.group.name = 'FireBreathCone';
    this.group.renderOrder = this.renderOrder;
    this.group.frustumCulled = false;

    this._createFireSystem();
    this._createSparkSystem();
    this._createSmokeSystem();
    this._createJetCore();
    this._createDistortionEffect();

    this.setVisible(false);
    this._makeNonPickable();

    this._invertForward = false;
    this.aimOffsetEuler = new THREE.Euler(0, 0, 0, 'XYZ');

    if (this.parent) this.attachTo(this.parent, this.localOffset);
  }

  _createFireSystem() {
    const fireGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.particleCount * 3);
    const velocities = new Float32Array(this.particleCount * 3);
    const lifetimes = new Float32Array(this.particleCount);
    const scales    = new Float32Array(this.particleCount);
    const uvs       = new Float32Array(this.particleCount * 2);

    for (let i = 0; i < this.particleCount; i++) {
      this._resetFireParticle(i, positions, velocities, lifetimes, scales);
      uvs[i * 2] = Math.random();
      uvs[i * 2 + 1] = Math.random();
    }

    fireGeo.setAttribute('position',  new THREE.BufferAttribute(positions, 3));
    fireGeo.setAttribute('velocity',  new THREE.BufferAttribute(velocities, 3));
    fireGeo.setAttribute('lifetime',  new THREE.BufferAttribute(lifetimes, 1));
    fireGeo.setAttribute('scale',     new THREE.BufferAttribute(scales, 1));
    fireGeo.setAttribute('uv',        new THREE.BufferAttribute(uvs, 2));
    fireGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, this.length / 2), this.length * 2);

    const fireMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time:      { value: 0 },
        fade:      { value: 0 },
        intensity: { value: this.intensity },
        uLen:      { value: this.length },
        coneRadius:{ value: this.radius }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float lifetime;
        attribute float scale;

        uniform float time;
        uniform float fade;
        uniform float uLen;
        uniform float coneRadius;

        varying float vLife;
        varying float vZ;
        varying float vSeed;

        mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

        void main() {
          vLife = lifetime;
          vSeed = uv.x;
          vec3 pos = position;
          pos.z = mod(position.z + velocity.z * time, uLen);
          pos.x += velocity.x * time;
          pos.y += velocity.y * time;

          float z01 = clamp(pos.z / uLen, 0.0, 1.0);

          float swirl = (1.5 + sin(time*1.2 + vSeed*12.0)*0.5) * (1.0 - z01);
          pos.xy = rot(swirl * 0.6) * pos.xy;

          float n1 = sin(time*2.7 + vSeed*20.0 + pos.x*6.0) * 0.12;
          float n2 = cos(time*2.1 + vSeed*18.0 + pos.y*5.0) * 0.10;
          pos.x += n1;
          pos.y += n2;

          float baseR = 0.8;
          float widen = mix(1.0, coneRadius / baseR, z01);
          pos.xy *= widen;

          float maxR = mix(coneRadius * 0.10, coneRadius, z01);
          float m = length(pos.xy);
          if (m > maxR) pos.xy *= maxR / max(m, 1e-4);

          vZ = z01;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          float sizeBase = mix(42.0, 70.0, smoothstep(0.0, 0.6, z01));
          gl_PointSize = sizeBase * scale * fade;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        varying float vLife;
        varying float vZ;
        varying float vSeed;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p);
          float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
          vec2 u=f*f*(3.0-2.0*f);
          return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
        }
        float fbm(vec2 p){
          float v=0.0, a=0.5;
          for(int i=0;i<4;i++){ v += a*noise(p); p*=2.0; a*=0.5; }
          return v;
        }
        vec3 fireRamp(float t){
          vec3 red    = vec3(0.85, 0.12, 0.03);
          vec3 orange = vec3(1.00, 0.50, 0.10);
          vec3 yellow = vec3(1.00, 0.90, 0.50);
          vec3 white  = vec3(1.00);
          vec3 mid    = mix(orange, yellow, smoothstep(0.30, 0.65, t));
          vec3 hot    = mix(mid, white,   smoothstep(0.78, 1.00, t));
          return mix(red, hot, t);
        }
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if(d > 0.5) discard;

          float radial = pow(1.0 - d*2.0, 1.35);
          float baseHeat = 1.0 - vZ;
          float n = fbm(uv*5.0 + vec2(vSeed*13.0, time*1.2));
          float flick = 0.85 + 0.15 * sin(time*20.0 + vSeed*10.0);
          float heat = clamp(baseHeat*0.85 + n*0.35, 0.0, 1.0) * flick;

          float core = smoothstep(0.55, 0.0, d);
          float coreBoost = mix(0.0, 0.35, core);

          float t = clamp(0.35 + heat*0.75 + coreBoost, 0.0, 1.0);
          vec3 col = fireRamp(t);

          float alpha = radial * (0.55 + 0.45*heat) * (1.0 - vZ*0.25);
          alpha *= (0.35 + 0.65 * clamp(intensity/8.0, 0.0, 1.5));
          float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453)-0.5) * 0.02;
          alpha = max(alpha + dither, 0.0);

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false
    });

    this.fireMesh = new THREE.Points(fireGeo, fireMaterial);
    this.fireMesh.name = 'FireParticles';
    this.fireMesh.renderOrder = this.renderOrder;
    this.fireMesh.frustumCulled = false;
    this.group.add(this.fireMesh);

    this.fireGeometry = fireGeo;
    this.fireMaterial = fireMaterial;
  }

  setRotationOffsetEuler(euler) {
    this.aimOffsetEuler.copy(euler);
    this._applyLocalRotation();
  }

  setRotationOffsetDegrees(pitchDeg = 0, yawDeg = 0, rollDeg = 0) {
    this.aimOffsetEuler.set(
      THREE.MathUtils.degToRad(pitchDeg),
      THREE.MathUtils.degToRad(yawDeg),
      THREE.MathUtils.degToRad(rollDeg),
      'XYZ'
    );
    this._applyLocalRotation();
  }

  invertForward(flag = true) {
    this._invertForward = !!flag;
    this._applyLocalRotation();
  }

  _applyLocalRotation() {
    const qOffset = new THREE.Quaternion().setFromEuler(this.aimOffsetEuler);
    if (this._invertForward) {
      const qInv = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI);
      qInv.multiply(qOffset);
      this.group.quaternion.copy(qInv);
    } else {
      this.group.quaternion.copy(qOffset);
    }
  }

  _createJetCore() {
    this.jet = new FireJetSystem({
      length: this.length * 0.95,
      radius: this.radius * 0.55,
      intensity: this.intensity * 1.15,
      renderOrder: this.renderOrder + 1
    });
    this.group.add(this.jet.group);
    this.jet.group.position.set(0, 0, 0);
  }

  _updateJetSync() {
    if (!this.jet) return;
    this.jet.setIntensity(this.intensity);
    this.jet.setFade(this._fade);
    this.jet.setGeometry(this.length * 0.95, this.radius * 0.55);
    this.jet.setActive(this._active);
  }

  _createSparkSystem() {
    const sparkGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.sparkCount * 3);
    const velocities = new Float32Array(this.sparkCount * 3);
    const lifetimes = new Float32Array(this.sparkCount);
    const sizes     = new Float32Array(this.sparkCount);

    for (let i = 0; i < this.sparkCount; i++) {
      this._resetSparkParticle(i, positions, velocities, lifetimes, sizes);
    }

    sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    sparkGeo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    sparkGeo.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    sparkGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    sparkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, this.length / 2), this.length * 2);

    const sparkMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 }, fade: { value: 0 },
        uLen: { value: this.length },
        coneRadius: { value: this.radius },
        sparkRange: { value: this.length },
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float lifetime;
        attribute float size;

        uniform float time;
        uniform float fade;
        uniform float uLen;
        uniform float coneRadius;
        uniform float sparkRange;

        varying float vLife;

        void main(){
          vLife = lifetime;

          float age = clamp(lifetime, 0.0, 1.0);
          vec3 pos = position;

          pos += velocity * (age * sparkRange);
          pos.y -= age * age * 0.9 * (sparkRange * 0.03);
          pos.z = clamp(pos.z, 0.0, uLen);

          float z01 = clamp(pos.z / uLen, 0.0, 1.0);
          float maxR = mix(coneRadius * 0.20, coneRadius, z01);
          float m = length(pos.xy);
          if (m > maxR) pos.xy *= maxR / max(m, 1e-4);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
          gl_PointSize = size * (1.0 - age) * fade * 12.0;
        }
      `,
      fragmentShader: `
        varying float vLife;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          if(length(c) > 0.5) discard;
          float core = 1.0 - smoothstep(0.0, 0.5, length(c));
          vec3 col = mix(vec3(1.0,0.4,0.1), vec3(1.0,0.85,0.5), core);
          float alpha = core * (1.0 - vLife);
          gl_FragColor = vec4(col, alpha * 0.9);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    });

    this.sparkMesh = new THREE.Points(sparkGeo, sparkMaterial);
    this.sparkMesh.name = 'SparkParticles';
    this.sparkMesh.renderOrder = this.renderOrder + 2;
    this.sparkMesh.frustumCulled = false;
    this.group.add(this.sparkMesh);

    this.sparkGeometry = sparkGeo;
    this.sparkMaterial = sparkMaterial;
  }

  _createSmokeSystem() {
    const smokeGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.smokeCount * 3);
    const velocities = new Float32Array(this.smokeCount * 3);
    const lifetimes = new Float32Array(this.smokeCount);
    const scales    = new Float32Array(this.smokeCount);
    const rotations = new Float32Array(this.smokeCount);

    for (let i = 0; i < this.smokeCount; i++) {
      this._resetSmokeParticle(i, positions, velocities, lifetimes, scales, rotations);
    }

    smokeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    smokeGeo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
    smokeGeo.setAttribute('lifetime', new THREE.BufferAttribute(lifetimes, 1));
    smokeGeo.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
    smokeGeo.setAttribute('rotation', new THREE.BufferAttribute(rotations, 1));
    smokeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, this.length / 2), this.length * 2.2);

    const smokeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time:   { value: 0 },
        fade:   { value: 0 },
        uLen:   { value: this.length },
        coneRadius: { value: this.radius }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float lifetime;
        attribute float scale;
        attribute float rotation;

        uniform float time;
        uniform float fade;
        uniform float uLen;
        uniform float coneRadius;

        varying float vLife;
        varying float vRot;
        varying float vZ01;

        mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

        void main(){
          vLife = lifetime;
          vRot  = rotation;

          vec3 pos = position;
          pos.z = mod(position.z + velocity.z * time, uLen);
          pos.x += velocity.x * time;
          pos.y += velocity.y * time;

          float z01 = clamp(pos.z / uLen, 0.0, 1.0);
          vZ01 = z01;

          float swirl = mix(0.2, 1.2, z01);
          float ang = time * mix(0.8, 1.6, z01) + rotation;
          pos.xy = rot(ang * swirl) * pos.xy;

          float maxR = mix(coneRadius * 0.15, coneRadius, z01);
          float m = length(pos.xy);
          if (m > maxR) pos.xy *= maxR / max(m, 1e-4);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
          gl_PointSize = scale * mix(24.0, 110.0, lifetime) * fade;
        }
      `,
      fragmentShader: `
        uniform float time;
        varying float vLife;
        varying float vRot;
        varying float vZ01;

        float noise(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          uv = vec2(uv.x*c - uv.y*s, uv.x*s + uv.y*c) + 0.5;

          if(length(uv - 0.5) > 0.5) discard;

          float d = length(uv - 0.5);
          vec2 nc = (uv-0.5) * 3.5 + time * 0.22;
          float sn = noise(nc) * 0.6 + noise(nc*2.0) * 0.25;

          vec3 dark  = vec3(0.06, 0.05, 0.05);
          vec3 grey  = vec3(0.36);
          float tint = smoothstep(0.2, 1.0, vZ01);
          vec3 smokeColor = mix(dark, grey, tint);

          float density = (1.0 - d*2.0) * sn;
          float lifeFade = (1.0 - vLife * 0.85);
          float alpha = density * 0.55 * lifeFade;
          gl_FragColor = vec4(smokeColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      fog: false
    });

    this.smokeMesh = new THREE.Points(smokeGeo, smokeMaterial);
    this.smokeMesh.name = 'SmokeParticles';
    this.smokeMesh.renderOrder = this.renderOrder - 1;
    this.smokeMesh.frustumCulled = false;
    this.group.add(this.smokeMesh);

    this.smokeGeometry = smokeGeo;
    this.smokeMaterial = smokeMaterial;
  }

  _createDistortionEffect() {
    const distortGeo = new THREE.CylinderGeometry(this.radius * 0.9, 0, this.length, 18, 1, true);
    distortGeo.rotateX(Math.PI / 2);
    distortGeo.translate(0, 0, this.length / 2);
    distortGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, this.length/2), this.length * 1.5);

    const distortMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, fade: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        uniform float time;
        void main(){
          vUv = uv;
          vec3 pos = position;
          float w1 = sin(time*7.0 + position.z*3.5) * 0.06;
          float w2 = cos(time*5.8 + position.x*4.2) * 0.05;
          pos.x += w1;
          pos.y += w2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
        }
      `,
      fragmentShader: `
        uniform float fade;
        varying vec2 vUv;
        void main(){
          float alpha = 0.06 * fade * (1.0 - vUv.y);
          gl_FragColor = vec4(1.0, 0.5, 0.2, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false
    });

    this.distortMesh = new THREE.Mesh(distortGeo, distortMaterial);
    this.distortMesh.name = 'ThermalDistortion';
    this.distortMesh.renderOrder = this.renderOrder - 2;
    this.distortMesh.frustumCulled = false;
    this.group.add(this.distortMesh);

    this.distortMaterial = distortMaterial;
  }

  _resetFireParticle(index, positions, velocities, lifetimes, scales) {
    const i3 = index * 3;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.22;
    positions[i3]     = Math.cos(angle) * r;
    positions[i3 + 1] = Math.sin(angle) * r;
    positions[i3 + 2] = Math.random() * this.length;

    const speed  = 1.6 + Math.random() * 2.2;
    velocities[i3]     = (Math.random() - 0.5) * 0.6 * 0.6;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.25;
    velocities[i3 + 2] = speed;

    lifetimes[index] = Math.random();
    scales[index]    = 0.6 + Math.random() * 0.6;
  }

  _resetSparkParticle(index, positions, velocities, lifetimes, sizes) {
    const i3 = index * 3;
    const z = Math.random() * this.length * 0.9;
    const expansion = z / this.length;
    const maxR = this.radius * (1 + expansion * 2.2);

    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (maxR * 0.6);
    positions[i3]     = Math.cos(a) * r;
    positions[i3 + 1] = Math.sin(a) * r;
    positions[i3 + 2] = z;

    const speed = 1.2 + Math.random() * 1.8;
    const dir = new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 0.3,
      0.7 + Math.random() * 0.6
    ).normalize();

    velocities[i3]     = dir.x * speed;
    velocities[i3 + 1] = dir.y * speed;
    velocities[i3 + 2] = dir.z * speed;

    lifetimes[index] = Math.random();
    sizes[index]     = 0.3 + Math.random() * 0.8;
  }

  _resetSmokeParticle(index, positions, velocities, lifetimes, scales, rotations) {
    const i3 = index * 3;
    const z = this.length * (Math.random() * 0.95);
    const expansion = z / this.length;
    const maxR = this.radius * (1 + expansion * 2.0) * 0.9;

    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * maxR;
    positions[i3]     = Math.cos(a) * r;
    positions[i3 + 1] = Math.sin(a) * r;
    positions[i3 + 2] = z;

    velocities[i3]     = (Math.random() - 0.5) * 0.22;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.15;
    velocities[i3 + 2] = 0.6 + Math.random() * 0.9;

    lifetimes[index] = Math.random();
    scales[index]    = 0.85 + Math.random() * 0.5;
    rotations[index] = Math.random() * Math.PI * 2;
  }

  update(dt = 0) {
    this._time += dt;

    if (this._forcedTime > 0) {
      this._forcedTime -= dt;
      if (this._forcedTime <= 0) this._forcedTime = 0;
      this._active = true;
    }

    const k = this._active ? this._fadeInK : this._fadeOutK;
    const target = this._active ? 1.0 : 0.0;
    this._fade += (target - this._fade) * (1 - Math.exp(-k * dt));
    if (Math.abs(this._fade - target) < 1e-3) this._fade = target;

    if (this.fireMaterial) {
      this.fireMaterial.uniforms.time.value = this._time;
      this.fireMaterial.uniforms.fade.value = this._fade;
      this.fireMaterial.uniforms.intensity.value = this.intensity;
      this.fireMaterial.uniforms.uLen.value = this.length;
      if (this.fireMaterial.uniforms.coneRadius)
        this.fireMaterial.uniforms.coneRadius.value = this.radius;
    }
    if (this.sparkMaterial) {
      this.sparkMaterial.uniforms.time.value = this._time;
      this.sparkMaterial.uniforms.fade.value = this._fade;
      this.sparkMaterial.uniforms.uLen.value = this.length;
      this.sparkMaterial.uniforms.coneRadius.value = this.radius;
      this.sparkMaterial.uniforms.sparkRange.value = this.length;
    }
    if (this.smokeMaterial) {
      this.smokeMaterial.uniforms.time.value = this._time;
      this.smokeMaterial.uniforms.fade.value = this._fade;
      this.smokeMaterial.uniforms.uLen.value = this.length;
      this.smokeMaterial.uniforms.coneRadius.value = this.radius;
    }
    if (this.distortMaterial) {
      this.distortMaterial.uniforms.time.value = this._time;
      this.distortMaterial.uniforms.fade.value = this._fade;
    }

    this._updateJetSync();
    this.jet?.update?.(dt);

    if (this._active || this._fade > 0.001) {
      this._updateFireParticles(dt);
      this._updateSparkParticles(dt);
      this._updateSmokeParticles(dt);
      this._updateBoundingSpheres();
    }

    const wantVisible = this._helpersOn || this._active || this._fade > 0.001;
    this.setVisible(wantVisible);
  }

  _updateBoundingSpheres() {
    const cen = new THREE.Vector3(0, 0, this.length / 2);
    if (this.fireGeometry?.boundingSphere) {
      this.fireGeometry.boundingSphere.center.copy(cen);
      this.fireGeometry.boundingSphere.radius = this.length * 2;
    }
    if (this.sparkGeometry?.boundingSphere) {
      this.sparkGeometry.boundingSphere.center.copy(cen);
      this.sparkGeometry.boundingSphere.radius = this.length * 2;
    }
    if (this.smokeGeometry?.boundingSphere) {
      this.smokeGeometry.boundingSphere.center.copy(cen);
      this.smokeGeometry.boundingSphere.radius = this.length * 2.2;
    }
    if (this.distortMesh?.geometry?.boundingSphere) {
      this.distortMesh.geometry.boundingSphere.center.copy(cen);
      this.distortMesh.geometry.boundingSphere.radius = this.length * 1.5;
    }
  }

  _updateFireParticles(dt) {
    const lifetimes = this.fireGeometry.attributes.lifetime.array;
    for (let i = 0; i < this.particleCount; i++) {
      lifetimes[i] += dt * (0.9 + Math.random() * 0.5);
      if (lifetimes[i] >= 1.0) {
        const pos = this.fireGeometry.attributes.position.array;
        const vel = this.fireGeometry.attributes.velocity.array;
        const sca = this.fireGeometry.attributes.scale.array;
        this._resetFireParticle(i, pos, vel, lifetimes, sca);
      }
    }
    this.fireGeometry.attributes.lifetime.needsUpdate = true;
    this.fireGeometry.attributes.position.needsUpdate = true;
  }

  _updateSparkParticles(dt) {
    const lifetimes = this.sparkGeometry.attributes.lifetime.array;
    for (let i = 0; i < this.sparkCount; i++) {
      lifetimes[i] += dt * (1.2 + Math.random() * 0.6);
      if (lifetimes[i] >= 1.0) {
        const pos = this.sparkGeometry.attributes.position.array;
        const vel = this.sparkGeometry.attributes.velocity.array;
        const siz = this.sparkGeometry.attributes.size.array;
        this._resetSparkParticle(i, pos, vel, lifetimes, siz);
      }
    }
    this.sparkGeometry.attributes.lifetime.needsUpdate = true;
    this.sparkGeometry.attributes.position.needsUpdate = true;
  }

  _updateSmokeParticles(dt) {
    const lifetimes = this.smokeGeometry.attributes.lifetime.array;
    for (let i = 0; i < this.smokeCount; i++) {
      lifetimes[i] += dt * 0.32;
      if (lifetimes[i] >= 1.0) {
        const pos = this.smokeGeometry.attributes.position.array;
        const vel = this.smokeGeometry.attributes.velocity.array;
        const sca = this.smokeGeometry.attributes.scale.array;
        const rot = this.smokeGeometry.attributes.rotation.array;
        this._resetSmokeParticle(i, pos, vel, lifetimes, sca, rot);
      }
    }
    this.smokeGeometry.attributes.lifetime.needsUpdate = true;
  }

  setActive(flag) { this._active = !!flag; }
  isActive() { return !!this._active; }

  forceFire(seconds = 1.0) {
    this._forcedTime = Math.max(this._forcedTime, seconds);
    this.setActive(true);
  }

  setSparksEnabled(on){
    if (!this.sparkMesh) return;
    this.sparkMesh.visible = !!on;
  }

  showHelpers(on = true) {
    this._helpersOn = !!on;
    if (this._helpersOn) this.setVisible(true);
  }

  attachTo(parent, localOffset = null) {
    this.parent = parent;
    if (localOffset) this.localOffset.copy(localOffset);
    if (!parent) return;
    parent.add(this.group);
    this.group.position.copy(this.localOffset);
    this._applyLocalRotation();
  }

  autoscaleFromModelBounds(diagonal, kLen = 0.35, kRad = 0.10) {
    if (!diagonal || !isFinite(diagonal)) return;
    this.length = Math.max(0.5, diagonal * kLen);
    this.radius = Math.max(0.15, diagonal * kRad);
    this._rebuildGeometry();
  }

  autoscaleFromParentWorldScale(kLen = 1.0, kRad = 1.0) {
    if (!this.group?.parent) return;
    const s = new THREE.Vector3();
    this.group.parent.getWorldScale(s);
    const avg = (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3;
    this.length = Math.max(0.5, this.length * avg * kLen);
    this.radius = Math.max(0.15, this.radius * avg * kRad);
    this._rebuildGeometry();
  }

  setVisible(v) {
    const vis = !!v;
    this.group.visible = vis;
    if (this.fireMesh)   this.fireMesh.visible   = vis;
    if (this.sparkMesh)  this.sparkMesh.visible  = vis;
    if (this.smokeMesh)  this.smokeMesh.visible  = vis;
    if (this.distortMesh)this.distortMesh.visible= vis;
    if (this.jet)        this.jet.setVisible(vis);
  }

  setIntensity(value) {
    this.intensity = Math.max(0, value);
    if (this.fireMaterial) this.fireMaterial.uniforms.intensity.value = this.intensity;
    if (this.jet)          this.jet.setIntensity(this.intensity);
  }

  setWindEffect(windVector) {
    if (!windVector) return;
    const w = windVector.length();
    if (w < 0.1) return;
    const dir = windVector.clone().normalize();

    if (this.fireGeometry) {
      const vel = this.fireGeometry.attributes.velocity.array;
      for (let i = 0; i < this.particleCount; i++) {
        const i3 = i * 3;
        vel[i3]     += dir.x * w * 0.30;
        vel[i3 + 1] += dir.y * w * 0.20;
        vel[i3 + 2] += dir.z * w * 0.10;
      }
      this.fireGeometry.attributes.velocity.needsUpdate = true;
    }
    if (this.smokeGeometry) {
      const velS = this.smokeGeometry.attributes.velocity.array;
      for (let i = 0; i < this.smokeCount; i++) {
        const i3 = i * 3;
        velS[i3]     += dir.x * w * 0.06;
        velS[i3 + 1] += dir.y * w * 0.03;
        velS[i3 + 2] += dir.z * 0.06 * w;
      }
      this.smokeGeometry.attributes.velocity.needsUpdate = true;
    }
    if (this.sparkGeometry) {
      const velK = this.sparkGeometry.attributes.velocity.array;
      for (let i = 0; i < this.sparkCount; i++) {
        const i3 = i * 3;
        velK[i3]     += dir.x * w * 0.09;
        velK[i3 + 1] += dir.y * w * 0.05;
        velK[i3 + 2] += dir.z * w * 0.09;
      }
      this.sparkGeometry.attributes.velocity.needsUpdate = true;
    }
  }

  setGeometry(length = null, radius = null) {
    if (length != null)  this.length = Math.max(0.5, length);
    if (radius != null)  this.radius = Math.max(0.15, radius);

    if (this.fireMaterial) {
      this.fireMaterial.uniforms.uLen.value = this.length;
      if (this.fireMaterial.uniforms.coneRadius)
        this.fireMaterial.uniforms.coneRadius.value = this.radius;
    }
    if (this.smokeMaterial) {
      this.smokeMaterial.uniforms.uLen.value = this.length;
      if (this.smokeMaterial.uniforms.coneRadius)
        this.smokeMaterial.uniforms.coneRadius.value = this.radius;
    }
    if (this.sparkMaterial) {
      if (this.sparkMaterial.uniforms.uLen)
        this.sparkMaterial.uniforms.uLen.value = this.length;
      if (this.sparkMaterial.uniforms.coneRadius)
        this.sparkMaterial.uniforms.coneRadius.value = this.radius;
      if (this.sparkMaterial.uniforms.sparkRange)
        this.sparkMaterial.uniforms.sparkRange.value = this.length;
    }

    this._rebuildGeometry();
    if (this.jet) this.jet.setGeometry(this.length * 0.95, this.radius * 0.55);
    this._updateBoundingSpheres();
  }

  setRadius(r){ this.setGeometry(null, r); }

  _rebuildGeometry() {
    if (this.distortMesh) {
      this.distortMesh.geometry.dispose?.();
      const g = new THREE.CylinderGeometry(this.radius * 0.9, 0, this.length, 18, 1, true);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, this.length / 2);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, this.length / 2), this.length * 1.5);
      this.distortMesh.geometry = g;
    }

    if (this.fireGeometry) {
      const pos = this.fireGeometry.attributes.position.array;
      const vel = this.fireGeometry.attributes.velocity.array;
      const life = this.fireGeometry.attributes.lifetime.array;
      const sca = this.fireGeometry.attributes.scale.array;
      for (let i = 0; i < this.particleCount; i++) {
        this._resetFireParticle(i, pos, vel, life, sca);
      }
      this.fireGeometry.attributes.position.needsUpdate = true;
      this.fireGeometry.attributes.velocity.needsUpdate = true;
      this.fireGeometry.attributes.lifetime.needsUpdate = true;
    }

    if (this.smokeGeometry) {
      const posS = this.smokeGeometry.attributes.position.array;
      const velS = this.smokeGeometry.attributes.velocity.array;
      const lifeS= this.smokeGeometry.attributes.lifetime.array;
      const scaS = this.smokeGeometry.attributes.scale.array;
      const rotS = this.smokeGeometry.attributes.rotation.array;
      for (let i = 0; i < this.smokeCount; i++) {
        this._resetSmokeParticle(i, posS, velS, lifeS, scaS, rotS);
      }
      this.smokeGeometry.attributes.position.needsUpdate = true;
      this.smokeGeometry.attributes.velocity.needsUpdate = true;
      this.smokeGeometry.attributes.lifetime.needsUpdate = true;
    }
  }

  addExplosiveBurst() {
    if (!this.sparkGeometry) return;
    const pos = this.sparkGeometry.attributes.position.array;
    const vel = this.sparkGeometry.attributes.velocity.array;
    const life = this.sparkGeometry.attributes.lifetime.array;
    const N = Math.min(this.sparkCount, 100);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = 0; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = 0;
      const a = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const s = 3.0 + Math.random() * 4.0;
      vel[i * 3]     = Math.sin(phi) * Math.cos(a) * s;
      vel[i * 3 + 1] = Math.cos(phi) * s;
      vel[i * 3 + 2] = Math.sin(phi) * Math.sin(a) * s;
      life[i] = 0;
    }
    this.sparkGeometry.attributes.position.needsUpdate = true;
    this.sparkGeometry.attributes.velocity.needsUpdate = true;
    this.sparkGeometry.attributes.lifetime.needsUpdate = true;
  }

  pulseIntensity(duration = 0.5, maxIntensity = null) {
    const orig = this.intensity;
    const target = maxIntensity || (orig * 2);
    let elapsed = 0;
    const step = () => {
      elapsed += 0.016;
      if (elapsed < duration) {
        const t = elapsed / duration;
        const wave = Math.sin(t * Math.PI);
        this.setIntensity(orig + (target - orig) * wave);
        requestAnimationFrame(step);
      } else {
        this.setIntensity(orig);
      }
    };
    requestAnimationFrame(step);
  }

  _makeNonPickable() {
    const noPick = (o) => {
      if (!o) return;
      o.userData = o.userData || {};
      o.userData.noPick = true;
      o.raycast = () => {};
      o.frustumCulled = false;
    };
    noPick(this.group);
    noPick(this.fireMesh);
    noPick(this.sparkMesh);
    noPick(this.smokeMesh);
    noPick(this.distortMesh);
    this.jet?.group && noPick(this.jet.group);
  }

  dispose() {
    const safeDispose = (o) => {
      if (!o) return;
      if (o.geometry) o.geometry.dispose?.();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
        else o.material.dispose?.();
      }
      if (o.parent) o.parent.remove(o);
    };
    safeDispose(this.fireMesh);
    safeDispose(this.sparkMesh);
    safeDispose(this.smokeMesh);
    safeDispose(this.distortMesh);
    this.jet?.dispose?.();
    if (this.group?.parent) this.group.parent.remove(this.group);
  }

  getStats() {
    return {
      active: this._active,
      fade: +this._fade.toFixed(3),
      time: +this._time.toFixed(2),
      forcedTime: +this._forcedTime.toFixed(2),
      particleCount: this.particleCount,
      sparkCount: this.sparkCount,
      smokeCount: this.smokeCount,
      intensity: this.intensity,
      length: +this.length.toFixed(2),
      radius: +this.radius.toFixed(2)
    };
  }
}

export default FireBreathCone;
