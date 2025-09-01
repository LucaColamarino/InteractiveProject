import * as THREE from 'three';
import { scene, renderer, camera } from '../scene.js';

const _fires = [];
let FIRE_SHADOW_BUDGET = 6;
const _tmpCam = new THREE.Vector3();

export function setFireShadowBudget(n){
  FIRE_SHADOW_BUDGET = Math.max(0, n|0);
  _rebalanceFireShadows();
}
function _rebalanceFireShadows(){
  camera.getWorldPosition(_tmpCam);
  const arr = _fires
    .filter(f => f.lightCore)
    .map(f => ({f, d2: f.origin.distanceToSquared(_tmpCam)}))
    .sort((a,b)=>a.d2-b.d2);

  arr.forEach((o, i) => {
    const shouldCast = i < FIRE_SHADOW_BUDGET && o.f._wantsShadows;
    if (o.f.lightCore.castShadow !== shouldCast) {
      o.f.lightCore.castShadow = shouldCast;
      if (shouldCast) {
        const s = o.f.lightCore.shadow;
        s.mapSize.width = 1024; s.mapSize.height = 1024;
        s.camera.near = 0.1; s.camera.far = Math.max(10, o.f._lightingRange || 9);
      }
    }
  });
}

function makeSoftCircleTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.3)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy?.() ?? 1;
  tex.needsUpdate = true;
  tex.flipY = false;
  return tex;
}

const VERT = `
  attribute vec3 aStart;
  attribute vec3 aVel;
  attribute float aAge;
  attribute float aLife;
  attribute float aPhase;
  attribute float aSize;
  attribute float aTemp;
  attribute vec3 aNoise;

  uniform mediump float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  uniform float uFovY;
  uniform float uViewportH;
  uniform float uMinScale;
  uniform float uMaxScale;
  uniform float uWindStrength;
  uniform vec3 uWindDir;
  uniform float uTurbulence;

  varying float vAge01;
  varying float vTemp;
  varying float vDistScale;
  varying vec2 vNoise;

  float noise(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

  void main(){
    float age01 = clamp(aAge / aLife, 0.0, 1.0);
    vAge01 = age01;
    vTemp = aTemp;

    float t = uTime * 0.8 + aPhase * 6.2831853;

    vec3 swirl1 = vec3(
      sin(t * 1.7 + aStart.x * 4.0) * 0.08,
      sin(t * 2.1 + aStart.y * 3.5) * 0.03,
      cos(t * 1.3 + aStart.z * 4.0) * 0.08
    );

    vec3 swirl2 = vec3(
      sin(t * 3.2 + aNoise.x * 8.0) * 0.04,
      0.0,
      cos(t * 2.8 + aNoise.z * 8.0) * 0.04
    );

    vec3 wind = uWindDir * uWindStrength * age01 * age01;

    vec3 turbulence = vec3(
      aNoise.x * sin(t * 4.0 + aPhase * 10.0),
      aNoise.y * sin(t * 3.5 + aPhase * 8.0),
      aNoise.z * sin(t * 4.2 + aPhase * 12.0)
    ) * uTurbulence * age01;

    vec3 pos = aStart;
    pos += aVel * (age01 * aLife);
    pos += (swirl1 + swirl2) * age01 * 1.8;
    pos += wind;
    pos += turbulence;

    float verticalBoost = age01 * 0.9 + pow(age01, 1.5) * 0.7;
    pos.y += verticalBoost;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float dist = length(mv.xyz);
    float perspective = uViewportH / (2.0 * tan(uFovY * 0.5)) / dist;
    perspective = clamp(perspective, uMinScale, uMaxScale);

    float distanceFactor = 10.0 / (1.0 + dist * dist * 0.04);
    distanceFactor = smoothstep(0.0, 1.0, distanceFactor);

    vDistScale = perspective * distanceFactor;
    vNoise = aNoise.xy;

    float sizeVariation = 0.7 + aSize * 0.6;
    float sizeAnim = 1.0 + sin(t * 5.0 + aPhase * 15.0) * 0.15;
    float ageFactor = (1.0 - pow(age01, 0.6)) * (0.8 + 0.4 * sin(t * 2.0 + aPhase * 8.0));

    float finalSize = uSize * sizeVariation * sizeAnim * ageFactor * perspective;
    gl_PointSize = finalSize * uPixelRatio;
  }
`;

const FRAG = `
  precision mediump float;

  uniform sampler2D uTexture;
  uniform mediump float uTime;
  uniform float uPaletteBlend;
  uniform float uTransition;

  varying float vAge01;
  varying float vTemp;
  varying float vDistScale;
  varying vec2 vNoise;

  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);

    float falloff = smoothstep(1.0, 0.1, r);
    falloff *= texture2D(uTexture, gl_PointCoord).a;

    vec3 cCore = vec3(1.00, 0.98, 0.85);
    vec3 cHot = vec3(1.00, 0.85, 0.35);
    vec3 cMid = vec3(1.00, 0.55, 0.15);
    vec3 cCool = vec3(0.85, 0.25, 0.05);
    vec3 cSmoke = vec3(0.15, 0.15, 0.18);
    vec3 cSmokeLight = vec3(0.35, 0.35, 0.40);

    vec3 cCoreBlue = vec3(0.85, 0.95, 1.00);
    vec3 cHotBlue = vec3(0.40, 0.70, 1.00);
    vec3 cMidBlue = vec3(0.20, 0.50, 0.95);
    vec3 cCoolBlue = vec3(0.10, 0.35, 0.80);
    vec3 cSmokeBlue = vec3(0.12, 0.18, 0.25);
    vec3 cSmokeLightBlue = vec3(0.30, 0.38, 0.50);

    vec3 fireNormal;
    if (vAge01 < 0.15) {
      fireNormal = mix(cCore, cHot, vAge01 / 0.15);
    } else if (vAge01 < 0.45) {
      fireNormal = mix(cHot, cMid, (vAge01 - 0.15) / 0.30);
    } else if (vAge01 < 0.75) {
      fireNormal = mix(cMid, cCool, (vAge01 - 0.45) / 0.30);
    } else {
      fireNormal = mix(cCool, cSmokeLight, (vAge01 - 0.75) / 0.25);
    }

    vec3 fireBlue;
    if (vAge01 < 0.15) {
      fireBlue = mix(cCoreBlue, cHotBlue, vAge01 / 0.15);
    } else if (vAge01 < 0.45) {
      fireBlue = mix(cHotBlue, cMidBlue, (vAge01 - 0.15) / 0.30);
    } else if (vAge01 < 0.75) {
      fireBlue = mix(cMidBlue, cCoolBlue, (vAge01 - 0.45) / 0.30);
    } else {
      fireBlue = mix(cCoolBlue, cSmokeLightBlue, (vAge01 - 0.75) / 0.25);
    }

    fireNormal = mix(fireNormal, cCore, vTemp * 0.3 * (1.0 - vAge01));
    fireBlue = mix(fireBlue, cCoreBlue, vTemp * 0.3 * (1.0 - vAge01));

    vec3 colNormal = mix(fireNormal, cSmoke, smoothstep(0.85, 1.0, vAge01));
    vec3 colBlue = mix(fireBlue, cSmokeBlue, smoothstep(0.85, 1.0, vAge01));

    float blendFactor = uPaletteBlend * uTransition;
    vec3 col = mix(colNormal, colBlue, blendFactor);

    float noiseIntensity = 0.5 + 0.5 * sin(vNoise.x * 20.0 + uTime * 3.0);
    noiseIntensity *= 0.5 + 0.5 * sin(vNoise.y * 15.0 + uTime * 4.0);

    float baseAlpha = falloff * (1.0 - pow(vAge01, 0.8));
    float flicker = 0.85 + 0.15 * noiseIntensity;

    float distanceFade = vDistScale;
    distanceFade = pow(distanceFade, 2.0);
    distanceFade = smoothstep(0.1, 0.8, distanceFade);

    float alpha = baseAlpha * flicker * distanceFade;

    if (vAge01 < 0.3 && vDistScale > 0.25) {
      alpha *= 1.0 + (1.0 - vAge01 / 0.3) * 0.4;
    }

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(col, alpha);
  }
`;

export class FireParticleSystem {
  constructor(pos = new THREE.Vector3(), opts = {}) {
    const COUNT   = opts.count ?? 320;
    const radius  = opts.radius ?? 0.32;
    const sizePx  = opts.size ?? 42.0;
    const lifeMin = opts.lifeMin ?? 0.8;
    const lifeMax = opts.lifeMax ?? 1.6;
    const upMin   = opts.upMin ?? 0.8;
    const upMax   = opts.upMax ?? 1.4;
    const side    = opts.side ?? 0.15;
    const windStrength = opts.windStrength ?? 0.08;
    const turbulence = opts.turbulence ?? 0.06;

    const lightingStrength = opts.lightingStrength ?? 1.0;
    const lightingRange    = opts.lightingRange ?? 9;
    const enableShadows = opts.enableShadows ?? true;
    this._wantsShadows = enableShadows;
    this._lightingRange = lightingRange;

    const shadowJitter = opts.shadowJitter ?? 1.0;
    const shadowBias    = opts.shadowBias    ?? -0.00008;
    const shadowNormalBias = opts.shadowNormalBias ?? 0.01;
    const useHemiBounce = opts.useHemiBounce ?? false;
    this.hemi = null;
    this._shadowJitter = shadowJitter;
    this.origin = pos.clone();
    this.windDirection = new THREE.Vector3(0.3, 0, 0.1).normalize();
    this._lightingStrength = lightingStrength;

    this.currentPalette = 'normal';
    this.targetPalette = 'normal';
    this.paletteBlend = 0.0;
    this.transitionSpeed = 2.0;
    this.transitionProgress = 1.0;

    this.originalLightColors = {
      core: 0xFF9A3C,
      column: 0xFF7A2A,
      halo: 0xFF5A20
    };

    this.texture = makeSoftCircleTexture(256);

    const aStart = new Float32Array(COUNT * 3);
    const aVel   = new Float32Array(COUNT * 3);
    const aAge   = new Float32Array(COUNT);
    const aLife  = new Float32Array(COUNT);
    const aPhase = new Float32Array(COUNT);
    const aSize  = new Float32Array(COUNT);
    const aTemp  = new Float32Array(COUNT);
    const aNoise = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * radius;

      aStart[i*3+0] = pos.x + Math.cos(ang) * r;
      aStart[i*3+1] = pos.y + Math.random() * 0.08;
      aStart[i*3+2] = pos.z + Math.sin(ang) * r;

      const sideStrength = side * (0.5 + Math.random() * 0.5);
      aVel[i*3+0] = (Math.random() - 0.5) * sideStrength;
      aVel[i*3+1] = upMin + Math.random() * (upMax - upMin);
      aVel[i*3+2] = (Math.random() - 0.5) * sideStrength;

      aLife[i]  = lifeMin + Math.random() * (lifeMax - lifeMin);
      aAge[i]   = Math.random() * aLife[i];
      aPhase[i] = Math.random();
      aSize[i]  = 0.3 + Math.random() * 0.7;
      aTemp[i]  = Math.random();

      aNoise[i*3+0] = (Math.random() - 0.5) * 2.0;
      aNoise[i*3+1] = (Math.random() - 0.5) * 2.0;
      aNoise[i*3+2] = (Math.random() - 0.5) * 2.0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(aStart, 3));
    geo.setAttribute('aStart',   new THREE.BufferAttribute(aStart, 3));
    geo.setAttribute('aVel',     new THREE.BufferAttribute(aVel,   3));
    geo.setAttribute('aAge',     new THREE.BufferAttribute(aAge,   1));
    geo.setAttribute('aLife',    new THREE.BufferAttribute(aLife,  1));
    geo.setAttribute('aPhase',   new THREE.BufferAttribute(aPhase, 1));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(aSize,  1));
    geo.setAttribute('aTemp',    new THREE.BufferAttribute(aTemp,  1));
    geo.setAttribute('aNoise',   new THREE.BufferAttribute(aNoise, 3));

    geo.computeBoundingSphere();
    if (geo.boundingSphere) {
      geo.boundingSphere.radius = Math.max(3.0, geo.boundingSphere.radius + 2.5);
    }

    this.uniforms = {
      uTime:         { value: 0 },
      uSize:         { value: sizePx },
      uPixelRatio:   { value: Math.min(2, renderer.getPixelRatio?.() ?? 1) },
      uFovY:         { value: THREE.MathUtils.degToRad(camera.fov) },
      uViewportH:    { value: renderer.getSize(new THREE.Vector2()).y },
      uMinScale:     { value: 0.20 },
      uMaxScale:     { value: 1.00 },
      uTexture:      { value: this.texture },
      uWindStrength: { value: windStrength },
      uWindDir:      { value: this.windDirection },
      uTurbulence:   { value: turbulence },
      uPaletteBlend: { value: 0.0 },
      uTransition:   { value: 1.0 }
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 100;
    scene.add(this.points);

    this.lightCore = new THREE.PointLight(0xFF9A3C, 60 * lightingStrength, lightingRange * 0.55, 2.0);
    this.lightCore.position.copy(this.origin).add(new THREE.Vector3(0, 0.7, 0));
    this.lightCore.castShadow = false;
    this._wantsShadows = enableShadows;
    if (enableShadows) {
      const s = this.lightCore.shadow;
      s.mapSize.width = 1024; s.mapSize.height = 1024;
      s.camera.near = 0.1;
      s.camera.far = Math.max(10, lightingRange);
      s.bias = shadowBias;
      s.normalBias = shadowNormalBias;
    }
    scene.add(this.lightCore);

    this.lightColumn = new THREE.PointLight(0xFF7A2A, 28 * lightingStrength, lightingRange * 0.9, 2.0);
    this.lightColumn.position.copy(this.origin).add(new THREE.Vector3(0, 1.6, 0));
    this.lightColumn.castShadow = false;
    scene.add(this.lightColumn);

    this.lightHalo = new THREE.PointLight(0xFF5A20, 14 * lightingStrength, lightingRange * 1.35, 1.8);
    this.lightHalo.position.copy(this.origin).add(new THREE.Vector3(0, 1.0, 0));
    this.lightHalo.castShadow = false;
    scene.add(this.lightHalo);

    if (useHemiBounce) {
      this.hemi = new THREE.HemisphereLight(0xFFB97A, 0x150a05, 0.18 * lightingStrength);
      this.hemi.position.copy(this.origin).add(new THREE.Vector3(0, 3.0, 0));
      scene.add(this.hemi);
    }

    this._ageAttr   = geo.getAttribute('aAge');
    this._lifeAttr  = geo.getAttribute('aLife');
    this._startAttr = geo.getAttribute('aStart');
    this._velAttr   = geo.getAttribute('aVel');
    this._sizeAttr  = geo.getAttribute('aSize');
    this._tempAttr  = geo.getAttribute('aTemp');
    this._noiseAttr = geo.getAttribute('aNoise');

    this._lastSpawnTime = 0;
    this._spawnInterval = 0.02;
    _fires.push(this);
    _rebalanceFireShadows();
  }

  setPalette(palette) {
    this.currentPalette = palette;
    this.targetPalette = palette;
    this.paletteBlend = palette === 'blue' ? 1.0 : 0.0;
    this.transitionProgress = 1.0;
    this.uniforms.uPaletteBlend.value = this.paletteBlend;
    this.uniforms.uTransition.value = this.transitionProgress;
    this._updateLightColors(palette === 'blue');
  }

  transitionPalette(palette, duration = 1.0) {
    if (this.targetPalette === palette) return;
    this.targetPalette = palette;
    this.transitionSpeed = 1.0 / Math.max(0.1, duration);
    this.transitionProgress = 0.0;
  }

  _updateLightColors(isBlue) {
    if (isBlue) {
      this.lightCore.color.setHex(0x4A9BFF);
      this.lightColumn.color.setHex(0x2C74FF);
      this.lightHalo.color.setHex(0x1E5FE6);
      if (this.hemi) {
        this.hemi.color.setHex(0x7ABAFF);
        this.hemi.groundColor.setHex(0x0A1520);
      }
    } else {
      this.lightCore.color.setHex(this.originalLightColors.core);
      this.lightColumn.color.setHex(this.originalLightColors.column);
      this.lightHalo.color.setHex(this.originalLightColors.halo);
      if (this.hemi) {
        this.hemi.color.setHex(0xFFB97A);
        this.hemi.groundColor.setHex(0x150a05);
      }
    }
  }

  update(dt) {
    const age   = this._ageAttr.array;
    const life  = this._lifeAttr.array;
    const posA  = this._startAttr.array;
    const velA  = this._velAttr.array;
    const sizeA = this._sizeAttr.array;
    const tempA = this._tempAttr.array;
    const noiseA = this._noiseAttr.array;
    const N = this._ageAttr.count;

    let needsUpdate = false;

    for (let i = 0; i < N; i++) {
      age[i] += dt;

      if (age[i] > life[i]) {
        const ang = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.7) * 0.32;

        posA[i*3+0] = this.origin.x + Math.cos(ang) * r;
        posA[i*3+1] = this.origin.y + Math.random() * 0.08;
        posA[i*3+2] = this.origin.z + Math.sin(ang) * r;

        const centerBias = 1.0 - (r / 0.32);
        const sideStr = 0.15 * (0.5 + Math.random() * 0.5);

        velA[i*3+0] = (Math.random() - 0.5) * sideStr;
        velA[i*3+1] = (0.8 + Math.random() * 0.6) * (0.7 + centerBias * 0.5);
        velA[i*3+2] = (Math.random() - 0.5) * sideStr;

        life[i]  = 0.8 + Math.random() * 0.8;
        age[i]   = 0.0;
        sizeA[i] = 0.4 + Math.random() * 0.6;
        tempA[i] = 0.7 + Math.random() * 0.3;

        noiseA[i*3+0] = (Math.random() - 0.5) * 2.0;
        noiseA[i*3+1] = (Math.random() - 0.5) * 2.0;
        noiseA[i*3+2] = (Math.random() - 0.5) * 2.0;

        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      this._lifeAttr.needsUpdate = true;
      this._startAttr.needsUpdate = true;
      this._velAttr.needsUpdate = true;
      this._sizeAttr.needsUpdate = true;
      this._tempAttr.needsUpdate = true;
      this._noiseAttr.needsUpdate = true;
    }
    this._ageAttr.needsUpdate = true;

    if (this.transitionProgress < 1.0) {
      this.transitionProgress += dt * this.transitionSpeed;
      this.transitionProgress = Math.min(1.0, this.transitionProgress);

      const targetBlend = this.targetPalette === 'blue' ? 1.0 : 0.0;
      const currentBlend = this.currentPalette === 'blue' ? 1.0 : 0.0;
      this.paletteBlend = THREE.MathUtils.lerp(currentBlend, targetBlend, this.transitionProgress);

      this.uniforms.uPaletteBlend.value = this.paletteBlend;
      this.uniforms.uTransition.value = this.transitionProgress;

      const isTransitioningToBlue = this.targetPalette === 'blue';
      this._updateLightColorsGradual(isTransitioningToBlue, this.transitionProgress);

      if (this.transitionProgress >= 1.0) {
        this.currentPalette = this.targetPalette;
      }
    }

    this.uniforms.uTime.value += dt;
    const t = this.uniforms.uTime.value;

    const windAngle = Math.sin(t * 0.3) * 0.5;
    this.windDirection.set(
      0.3 + Math.sin(windAngle) * 0.2,
      0.1 + Math.sin(t * 0.8) * 0.05,
      0.1 + Math.cos(windAngle) * 0.15
    ).normalize();
    this.uniforms.uWindDir.value.copy(this.windDirection);

    const base = 1.0 + Math.sin(t * 1.1) * 0.04;
    const f1 = 1.0 + Math.sin(t * 12.7) * 0.10;
    const f2 = 1.0 + Math.sin(t * 23.3 + 1.3) * 0.08;
    const f3 = 1.0 + Math.sin(t * 47.1 + 0.7) * 0.05;
    const flicker = base * f1 * f2 * f3;

    if (this.transitionProgress >= 1.0) {
      if (this.currentPalette === 'normal') {
        const coreHot = new THREE.Color(0xFFD9AA);
        const coreCool = new THREE.Color(0xFF8A3C);
        const mixCore = (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.6;
        this.lightCore.color.copy(coreHot).lerp(coreCool, mixCore);

        const colA = new THREE.Color(0xFF8A3C);
        const colB = new THREE.Color(0xFF6A22);
        const mixCol = (Math.sin(t * 0.6 + 0.9) * 0.5 + 0.5) * 0.7;
        this.lightColumn.color.copy(colA).lerp(colB, mixCol);

        const haloA = new THREE.Color(0xFF6A22);
        const haloB = new THREE.Color(0xE6451A);
        const mixHalo = (Math.sin(t * 0.5 + 1.7) * 0.5 + 0.5) * 0.5;
        this.lightHalo.color.copy(haloA).lerp(haloB, mixHalo);
      } else {
        const coreHot = new THREE.Color(0x7ABAFF);
        const coreCool = new THREE.Color(0x4A9BFF);
        const mixCore = (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.6;
        this.lightCore.color.copy(coreHot).lerp(coreCool, mixCore);

        const colA = new THREE.Color(0x4A9BFF);
        const colB = new THREE.Color(0x2C74FF);
        const mixCol = (Math.sin(t * 0.6 + 0.9) * 0.5 + 0.5) * 0.7;
        this.lightColumn.color.copy(colA).lerp(colB, mixCol);

        const haloA = new THREE.Color(0x2C74FF);
        const haloB = new THREE.Color(0x1E5FE6);
        const mixHalo = (Math.sin(t * 0.5 + 1.7) * 0.5 + 0.5) * 0.5;
        this.lightHalo.color.copy(haloA).lerp(haloB, mixHalo);
      }
    }

    const k = this._lightingStrength;
    this.lightCore.intensity   = 60 * k * flicker;
    this.lightColumn.intensity = 28 * k * (0.9 + (flicker - 1.0) * 0.6);
    this.lightHalo.intensity   = 14 * k * (0.85 + (flicker - 1.0) * 0.5);
    if (this.hemi) {
      this.hemi.intensity = 0.18 * k * (0.9 + (f1 - 1.0) * 0.4);
      this.hemi.position.set(this.origin.x, this.origin.y + 3.0, this.origin.z);
    }

    const j = this._shadowJitter;
    this.lightCore.position.set(
      this.origin.x + Math.sin(t * 2.1) * 0.03 * j,
      this.origin.y + 0.7 + Math.sin(t * 3.3) * 0.04 * j,
      this.origin.z + Math.cos(t * 2.5) * 0.03 * j
    );
    this.lightColumn.position.set(
      this.origin.x + Math.sin(t * 1.3) * 0.02,
      this.origin.y + 1.6 + Math.sin(t * 2.1) * 0.03,
      this.origin.z + Math.cos(t * 1.7) * 0.02
    );
    this.lightHalo.position.set(
      this.origin.x, this.origin.y + 1.0, this.origin.z
    );

    this.uniforms.uFovY.value = THREE.MathUtils.degToRad(camera.fov);
  }

  _updateLightColorsGradual(toBlue, progress) {
    const normalCore = new THREE.Color(this.originalLightColors.core);
    const normalColumn = new THREE.Color(this.originalLightColors.column);
    const normalHalo = new THREE.Color(this.originalLightColors.halo);

    const blueCore = new THREE.Color(0x4A9BFF);
    const blueColumn = new THREE.Color(0x2C74FF);
    const blueHalo = new THREE.Color(0x1E5FE6);

    if (toBlue) {
      this.lightCore.color.copy(normalCore).lerp(blueCore, progress);
      this.lightColumn.color.copy(normalColumn).lerp(blueColumn, progress);
      this.lightHalo.color.copy(normalHalo).lerp(blueHalo, progress);
    } else {
      this.lightCore.color.copy(blueCore).lerp(normalCore, progress);
      this.lightColumn.color.copy(blueColumn).lerp(normalColumn, progress);
      this.lightHalo.color.copy(blueHalo).lerp(normalHalo, progress);
    }

    if (this.hemi) {
      const normalSky = new THREE.Color(0xFFB97A);
      const normalGround = new THREE.Color(0x150a05);
      const blueSky = new THREE.Color(0x7ABAFF);
      const blueGround = new THREE.Color(0x0A1520);

      if (toBlue) {
        this.hemi.color.copy(normalSky).lerp(blueSky, progress);
        this.hemi.groundColor.copy(normalGround).lerp(blueGround, progress);
      } else {
        this.hemi.color.copy(blueSky).lerp(normalSky, progress);
        this.hemi.groundColor.copy(blueGround).lerp(normalGround, progress);
      }
    }
  }

  setIntensity(intensity) {
    this.uniforms.uSize.value = 42.0 * intensity;
    this._lightingStrength = intensity;
  }

  setWindStrength(strength) {
    this.uniforms.uWindStrength.value = strength;
  }

  setTurbulence(turbulence) {
    this.uniforms.uTurbulence.value = turbulence;
  }

  setWindDirection(direction) {
    this.windDirection.copy(direction).normalize();
    this.uniforms.uWindDir.value.copy(this.windDirection);
  }

  setPosition(v3) {
    this.origin.copy(v3);
    this.lightCore.position.copy(v3).add(new THREE.Vector3(0, 0.7, 0));
    this.lightColumn.position.copy(v3).add(new THREE.Vector3(0, 1.6, 0));
    this.lightHalo.position.copy(v3).add(new THREE.Vector3(0, 1.0, 0));
    if (this.hemi) this.hemi.position.copy(v3).add(new THREE.Vector3(0, 3.0, 0));
  }

  dispose() {
    const index = _fires.indexOf(this);
    if (index > -1) _fires.splice(index, 1);

    scene.remove(this.points);
    scene.remove(this.lightCore, this.lightColumn, this.lightHalo);
    if (this.hemi) scene.remove(this.hemi);
    this.points.geometry.dispose();
    this.points.material.dispose();
    if (this.texture) this.texture.dispose();
  }
}

export function spawnFire(pos, options = {}) {
  const fx = new FireParticleSystem(pos, options);
  _rebalanceFireShadows();
  return fx;
}

let _rebalanceTimer = 0;
export function updateFires(dt){
  for (let i = 0; i < _fires.length; i++) _fires[i].update(dt);
  _rebalanceTimer += dt;
  if (_rebalanceTimer > 0.5) { _rebalanceFireShadows(); _rebalanceTimer = 0; }
}

export function clearFires() {
  while (_fires.length) {
    const f = _fires.pop();
    f.dispose();
  }
}

export function setGlobalWind(direction, strength) {
  _fires.forEach(fire => {
    fire.setWindDirection(direction);
    fire.setWindStrength(strength);
  });
}

export function setGlobalTurbulence(turbulence) {
  _fires.forEach(fire => {
    fire.setTurbulence(turbulence);
  });
}

export function setGlobalPalette(palette) {
  _fires.forEach(fire => {
    fire.setPalette(palette);
  });
}

export function transitionGlobalPalette(palette, duration = 1.0) {
  _fires.forEach(fire => {
    fire.transitionPalette(palette, duration);
  });
}

window.addEventListener('resize', () => {
  const v2 = new THREE.Vector2();
  renderer.getSize(v2);
  const pixelRatio = Math.min(2, renderer.getPixelRatio?.() ?? 1);
  const fovY = THREE.MathUtils.degToRad(camera.fov);

  _fires.forEach(f => {
    f.uniforms.uViewportH.value = v2.y;
    f.uniforms.uPixelRatio.value = pixelRatio;
    f.uniforms.uFovY.value = fovY;
  });
});
