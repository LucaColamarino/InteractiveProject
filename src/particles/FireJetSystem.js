import * as THREE from 'three';

export class FireJetSystem {
  constructor(opts = {}) {
    this.length        = opts.length      ?? 7.0;
    this.radius        = opts.radius      ?? 0.1;
    this.coneRadius    = opts.coneRadius  ?? this.radius * 2.0;
    this.intensity     = opts.intensity   ?? 3.0;
    this.renderOrder   = opts.renderOrder ?? 1001;
    this.particleCount = opts.particleCount ?? 500;

    this._time   = 0;
    this._active = false;
    this._fade   = 0;
    this._fadeInK  = 7.0;
    this._fadeOutK = 6.0;

    this._tightness = 0.7;

    this.group = new THREE.Group();
    this.group.name = 'FireJetSystem';
    this.group.renderOrder = this.renderOrder;
    this.group.frustumCulled = false;

    this._createParticles();
    this._makeNonPickable();
  }

  _createParticles() {
    const geo  = new THREE.BufferGeometry();
    const pos  = new Float32Array(this.particleCount * 3);
    const vel  = new Float32Array(this.particleCount * 3);
    const life = new Float32Array(this.particleCount);
    const size = new Float32Array(this.particleCount);
    const seed = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      this._reset(i, pos, vel, life, size, seed);
    }

    geo.setAttribute('position',  new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('velocity',  new THREE.BufferAttribute(vel, 3));
    geo.setAttribute('lifetime',  new THREE.BufferAttribute(life, 1));
    geo.setAttribute('psize',     new THREE.BufferAttribute(size, 1));
    geo.setAttribute('pseed',     new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, this.length * 0.5), this.length * 2.0);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time:      { value: 0 },
        fade:      { value: 0 },
        uLen:      { value: this.length },
        uRad:      { value: this.radius },
        uConeR:    { value: this.coneRadius },
        uTight:    { value: this._tightness },
        intensity: { value: this.intensity }
      },
      vertexShader: `
        attribute vec3 velocity;
        attribute float lifetime;
        attribute float psize;
        attribute float pseed;

        uniform float time;
        uniform float fade;
        uniform float uLen;
        uniform float uRad;
        uniform float uConeR;
        uniform float uTight;

        varying float vLife;
        varying float vZ01;
        varying float vSeed;

        mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

        void main(){
          vLife = lifetime;
          vSeed = pseed;

          vec3 pos = position;
          pos.z = mod(position.z + velocity.z * time, uLen);
          pos.x += velocity.x * time;
          pos.y += velocity.y * time;

          float z01 = clamp(pos.z / uLen, 0.0, 1.0);
          vZ01 = z01;

          float spin = (1.3 + sin(time*1.8 + pseed*13.0)*0.35) * (1.0 - z01);
          pos.xy = rot(spin * 0.55) * pos.xy;

          float j1 = sin(time*2.8 + pseed*19.0 + pos.x*7.0) * 0.06;
          float j2 = cos(time*2.3 + pseed*17.0 + pos.y*6.0) * 0.05;
          pos.x += j1;
          pos.y += j2;

          float rNow = length(pos.xy);
          float rTarget = mix(uRad*0.95, uConeR*0.96, z01);
          float pull = clamp(uTight, 0.0, 1.0);
          float safe = max(rNow, 1e-4);
          pos.xy *= mix(1.0, rTarget / safe, pull);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);

          float s = mix(22.0, 36.0, smoothstep(0.0, 0.55, z01));
          gl_PointSize = s * psize * fade;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;

        varying float vLife;
        varying float vZ01;
        varying float vSeed;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i=floor(p), f=fract(p);
          float a=hash(i), b=hash(i+vec2(1.,0.)), c=hash(i+vec2(0.,1.)), d=hash(i+vec2(1.,1.));
          vec2 u=f*f*(3.-2.*f);
          return mix(a,b,u.x) + (c-a)*u.y*(1.-u.x) + (d-b)*u.x*u.y;
        }
        float fbm(vec2 p){
          float v=0., a=0.5;
          for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.0; a*=0.5; }
          return v;
        }

        vec3 fireRamp(float t){
          vec3 red    = vec3(0.9, 0.12, 0.03);
          vec3 orange = vec3(1.0, 0.55, 0.12);
          vec3 yellow = vec3(1.0, 0.92, 0.55);
          vec3 white  = vec3(1.0);
          vec3 mid    = mix(orange, yellow, smoothstep(0.3, 0.65, t));
          vec3 hot    = mix(mid, white,   smoothstep(0.78, 1.0, t));
          return mix(red, hot, t);
        }

        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if(d > 0.5) discard;

          float radial = pow(1.0 - d*2.0, 1.35);

          float baseHeat = 1.0 - vZ01;
          float n = fbm(uv*5.0 + vec2(vSeed*13.0, time*1.2));
          float flick = 0.87 + 0.13 * sin(time*22.0 + vSeed*11.0);
          float heat = clamp(baseHeat*0.9 + n*0.35, 0.0, 1.0) * flick;

          float core = smoothstep(0.55, 0.0, d);
          float coreBoost = mix(0.0, 0.35, core);

          float t = clamp(0.40 + heat*0.70 + coreBoost, 0.0, 1.0);
          vec3 col = fireRamp(t);

          float alpha = radial * (0.58 + 0.42*heat) * (1.0 - vZ01*0.22);
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

    const pts = new THREE.Points(geo, mat);
    pts.name = 'FireJetPoints';
    pts.frustumCulled = false;
    pts.renderOrder = this.renderOrder;

    this.group.add(pts);

    this.geometry = geo;
    this.material = mat;
    this.points   = pts;
  }

  _reset(i, pos, vel, life, size, seed) {
    const i3 = i * 3;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.max(0.12, this.radius * 0.18);
    pos[i3]     = Math.cos(a) * r;
    pos[i3 + 1] = Math.sin(a) * r;
    pos[i3 + 2] = Math.random() * (this.length * 0.95);

    const speed = 2.0 + Math.random() * 2.8;
    const sXY   = (Math.random() - 0.5) * 0.35;
    vel[i3]     = sXY * 0.38;
    vel[i3 + 1] = (Math.random() - 0.5) * 0.20;
    vel[i3 + 2] = speed;

    life[i] = Math.random();
    size[i] = 0.55 + Math.random() * 0.45; 
    seed[i] = Math.random();
  }

  setActive(flag) { this._active = !!flag; }
  isActive() { return !!this._active; }
  setFade(f){ this._fade = THREE.MathUtils.clamp(f, 0, 1); }

  setIntensity(v) {
    this.intensity = Math.max(0, v);
    if (this.material) this.material.uniforms.intensity.value = this.intensity;
  }

  setGeometry(length, radius) {
    if (length != null) this.length = length;
    if (radius != null) this.radius = radius;
    if (this.material) {
      this.material.uniforms.uLen.value = this.length;
      this.material.uniforms.uRad.value = this.radius;
    }
    if (this.geometry?.boundingSphere) {
      this.geometry.boundingSphere.center.set(0, 0, this.length * 0.5);
      this.geometry.boundingSphere.radius = this.length * 2.0;
    }
  }

  setConeRadius(r){
    this.coneRadius = Math.max(0.01, r);
    if (this.material) this.material.uniforms.uConeR.value = this.coneRadius;
  }

  setTightness(t){
    this._tightness = THREE.MathUtils.clamp(t ?? 0.7, 0, 1);
    if (this.material) this.material.uniforms.uTight.value = this._tightness;
  }

  attachTo(parent, localOffset = new THREE.Vector3()) {
    if (!parent) return;
    parent.add(this.group);
    this.group.position.copy(localOffset);
    this.group.rotation.set(0, 0, 0);
  }

  setVisible(v) {
    const vis = !!v;
    if (this.group) this.group.visible = vis;
    if (this.points) this.points.visible = vis;
  }

  update(dt = 0) {
    this._time += dt;

    const k = this._active ? this._fadeInK : this._fadeOutK;
    const target = this._active ? 1.0 : 0.0;
    this._fade += (target - this._fade) * (1 - Math.exp(-k * dt));
    if (Math.abs(this._fade - target) < 1e-3) this._fade = target;

    if (this.material) {
      this.material.uniforms.time.value = this._time;
      this.material.uniforms.fade.value = this._fade;
    }

    if (!this.points || (this._fade <= 0 && !this._active)) return;

    const life = this.geometry.attributes.lifetime.array;
    for (let i = 0; i < this.particleCount; i++) {
      life[i] += dt * (0.95 + Math.random() * 0.55);
      if (life[i] >= 1.0) {
        const pos = this.geometry.attributes.position.array;
        const vel = this.geometry.attributes.velocity.array;
        const size= this.geometry.attributes.psize.array;
        const seed= this.geometry.attributes.pseed.array;
        this._reset(i, pos, vel, life, size, seed);
      }
    }
    this.geometry.attributes.lifetime.needsUpdate = true;
    this.geometry.attributes.position.needsUpdate = true;
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
    noPick(this.points);
  }

  dispose() {
    if (this.points) {
      this.points.geometry?.dispose?.();
      this.points.material?.dispose?.();
      this.group.remove(this.points);
      this.points = null;
    }
    if (this.group?.parent) this.group.parent.remove(this.group);
  }
}
