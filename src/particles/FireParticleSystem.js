// src/effects/FireParticleSystem.js
import * as THREE from 'three';
import { scene, renderer, camera } from '../scene.js';

const _fires = [];

/** Texture radiale morbida con gradiente migliorato */
function makeSoftCircleTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  
  // Gradiente radiale più complesso per texture più realistica
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
  tex.flipY = false; // Ottimizzazione per le particelle
  return tex;
}

/** Generatore di noise per variazioni naturali */
function simpleNoise(x, y, z, t) {
  return Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + t * 23.421) * 43758.5453;
}

/** === Shaders migliorati === */
const VERT = /* glsl */`
  attribute vec3 aStart;
  attribute vec3 aVel;
  attribute float aAge;
  attribute float aLife;
  attribute float aPhase;
  attribute float aSize;      // size individuale per variazione
  attribute float aTemp;      // temperatura per colore
  attribute vec3 aNoise;      // valori di noise precalcolati

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

  // Funzione di noise semplificata
  float noise(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  void main(){
    float age01 = clamp(aAge / aLife, 0.0, 1.0);
    vAge01 = age01;
    vTemp = aTemp;

    // Movimento più complesso con turbolenza
    float t = uTime * 0.8 + aPhase * 6.2831853;
    
    // Vortici multipli a scale diverse
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

    // Effetto vento
    vec3 wind = uWindDir * uWindStrength * age01 * age01;
    
    // Turbolenza basata su noise
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
    
    // Movimento verticale con accelerazione naturale
    float verticalBoost = age01 * 0.9 + pow(age01, 1.5) * 0.7;
    pos.y += verticalBoost;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    
    // Calcolo prospettiva per ridimensionamento naturale con la distanza
    float dist = length(mv.xyz);
    float perspective = uViewportH / (2.0 * tan(uFovY * 0.5)) / dist;
    perspective = clamp(perspective, uMinScale, uMaxScale);
    
    // Fattore di distanza meno aggressivo ma ancora efficace
    float distanceFactor = 10.0 / (1.0 + dist * dist * 0.04); // Dimezzato il fattore
    distanceFactor = smoothstep(0.0, 1.0, distanceFactor);
    
    vDistScale = perspective * distanceFactor;
    vNoise = aNoise.xy;

    // Size con variazione individuale e animazione
    float sizeVariation = 0.7 + aSize * 0.6;
    float sizeAnim = 1.0 + sin(t * 5.0 + aPhase * 15.0) * 0.15;
    float ageFactor = (1.0 - pow(age01, 0.6)) * (0.8 + 0.4 * sin(t * 2.0 + aPhase * 8.0));
    
    float finalSize = uSize * sizeVariation * sizeAnim * ageFactor * perspective;
    gl_PointSize = finalSize * uPixelRatio;
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  
  uniform sampler2D uTexture;
  uniform mediump float uTime;
  
  varying float vAge01;
  varying float vTemp;
  varying float vDistScale;
  varying vec2 vNoise;

  void main(){
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = length(p);

    // Falloff più morbido e naturale
    float falloff = smoothstep(1.0, 0.1, r);
    falloff *= texture2D(uTexture, gl_PointCoord).a;

    // Palette di colori più ricca e realistica
    vec3 cCore = vec3(1.00, 0.98, 0.85);      // core caldissimo
    vec3 cHot = vec3(1.00, 0.85, 0.35);       // fiamma calda
    vec3 cMid = vec3(1.00, 0.55, 0.15);       // fiamma media
    vec3 cCool = vec3(0.85, 0.25, 0.05);      // fiamma fredda
    vec3 cSmoke = vec3(0.15, 0.15, 0.18);     // fumo scuro
    vec3 cSmokeLight = vec3(0.35, 0.35, 0.40); // fumo chiaro

    // Interpolazione colori più sofisticata
    vec3 fire;
    if (vAge01 < 0.15) {
      fire = mix(cCore, cHot, vAge01 / 0.15);
    } else if (vAge01 < 0.45) {
      fire = mix(cHot, cMid, (vAge01 - 0.15) / 0.30);
    } else if (vAge01 < 0.75) {
      fire = mix(cMid, cCool, (vAge01 - 0.45) / 0.30);
    } else {
      fire = mix(cCool, cSmokeLight, (vAge01 - 0.75) / 0.25);
    }

    // Variazione di temperatura individuale
    fire = mix(fire, cCore, vTemp * 0.3 * (1.0 - vAge01));
    
    // Fumo finale
    vec3 col = mix(fire, cSmoke, smoothstep(0.85, 1.0, vAge01));

    // Variazioni di intensità basate su noise
    float noiseIntensity = 0.5 + 0.5 * sin(vNoise.x * 20.0 + uTime * 3.0);
    noiseIntensity *= 0.5 + 0.5 * sin(vNoise.y * 15.0 + uTime * 4.0);
    
    // Alpha con fade graduato per buon equilibrio
    float baseAlpha = falloff * (1.0 - pow(vAge01, 0.8));
    float flicker = 0.85 + 0.15 * noiseIntensity;
    
    // Fade meno estremo ma ancora efficace contro la "palla"
    float distanceFade = vDistScale;
    distanceFade = pow(distanceFade, 2.0); // Tra lineare e cubico
    distanceFade = smoothstep(0.1, 0.8, distanceFade); // Range più permissivo
    
    float alpha = baseAlpha * flicker * distanceFade;

    // Le fiamme giovani sono più visibili da distanza media
    if (vAge01 < 0.3 && vDistScale > 0.25) {
      alpha *= 1.0 + (1.0 - vAge01 / 0.3) * 0.4;
    }

    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(col, alpha);
  }
`;

export class FireParticleSystem {
  constructor(pos = new THREE.Vector3(), opts = {}) {
    const COUNT   = opts.count ?? 320;        // Più particelle per densità
    const radius  = opts.radius ?? 0.32;      // Raggio leggermente maggiore
    const sizePx  = opts.size ?? 42.0;        // Particelle più grandi
    const lifeMin = opts.lifeMin ?? 0.8;
    const lifeMax = opts.lifeMax ?? 1.6;      // Vita più lunga
    const upMin   = opts.upMin ?? 0.8;
    const upMax   = opts.upMax ?? 1.4;        // Velocità verticale maggiore
    const side    = opts.side ?? 0.15;        // Più movimento laterale
    const windStrength = opts.windStrength ?? 0.08;
    const turbulence = opts.turbulence ?? 0.06;

    this.origin = pos.clone();
    this.windDirection = new THREE.Vector3(0.3, 0, 0.1).normalize();

    // Texture migliorata
    this.texture = makeSoftCircleTexture(256); // Risoluzione maggiore

    // Attributes con nuove proprietà
    const aStart = new Float32Array(COUNT * 3);
    const aVel   = new Float32Array(COUNT * 3);
    const aAge   = new Float32Array(COUNT);
    const aLife  = new Float32Array(COUNT);
    const aPhase = new Float32Array(COUNT);
    const aSize  = new Float32Array(COUNT);     // Size individuale
    const aTemp  = new Float32Array(COUNT);     // Temperatura
    const aNoise = new Float32Array(COUNT * 3); // Valori di noise

    for (let i = 0; i < COUNT; i++) {
      // Distribuzione più naturale con bias al centro
      const ang = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.6) * radius; // Bias verso il centro
      
      aStart[i*3+0] = pos.x + Math.cos(ang) * r;
      aStart[i*3+1] = pos.y + Math.random() * 0.08; // Variazione altezza iniziale
      aStart[i*3+2] = pos.z + Math.sin(ang) * r;

      // Velocità con più variazione
      const sideStrength = side * (0.5 + Math.random() * 0.5);
      aVel[i*3+0] = (Math.random() - 0.5) * sideStrength;
      aVel[i*3+1] = upMin + Math.random() * (upMax - upMin);
      aVel[i*3+2] = (Math.random() - 0.5) * sideStrength;

      aLife[i]  = lifeMin + Math.random() * (lifeMax - lifeMin);
      aAge[i]   = Math.random() * aLife[i];
      aPhase[i] = Math.random();
      aSize[i]  = 0.3 + Math.random() * 0.7; // Variazione dimensioni
      aTemp[i]  = Math.random(); // Temperatura casuale
      
      // Valori di noise precalcolati
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
      uMinScale:     { value: 0.20 },    // Bilanciato
      uMaxScale:     { value: 1.00 },    // Limite normale
      uTexture:      { value: this.texture },
      uWindStrength: { value: windStrength },
      uWindDir:      { value: this.windDirection },
      uTurbulence:   { value: turbulence }
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
    this.points.renderOrder = 100; // Renderizza dopo oggetti solidi
    scene.add(this.points);

    // Sistema di luci migliorato con ombre
    this.mainLight = new THREE.PointLight(0xffa040, 1.4, 8, 2.0);
    this.mainLight.position.copy(this.origin).add(new THREE.Vector3(0, 1.0, 0));
    this.mainLight.castShadow = true;
    
    // Configurazione ombre per la luce principale
    this.mainLight.shadow.mapSize.width = 1024;
    this.mainLight.shadow.mapSize.height = 1024;
    this.mainLight.shadow.camera.near = 0.1;
    this.mainLight.shadow.camera.far = 10;
    this.mainLight.shadow.bias = -0.0001;
    
    scene.add(this.mainLight);

    // Luce secondaria senza ombre (per fill light)
    this.ambientGlow = new THREE.PointLight(0xff6020, 0.6, 4, 2.5);
    this.ambientGlow.position.copy(this.origin).add(new THREE.Vector3(0, 0.5, 0));
    this.ambientGlow.castShadow = false;
    scene.add(this.ambientGlow);

    // References per gli attributi
    this._ageAttr   = geo.getAttribute('aAge');
    this._lifeAttr  = geo.getAttribute('aLife');
    this._startAttr = geo.getAttribute('aStart');
    this._velAttr   = geo.getAttribute('aVel');
    this._sizeAttr  = geo.getAttribute('aSize');
    this._tempAttr  = geo.getAttribute('aTemp');
    this._noiseAttr = geo.getAttribute('aNoise');

    // Timing per aggiornamenti ottimizzati
    this._lastSpawnTime = 0;
    this._spawnInterval = 0.02; // Spawn ogni 20ms per continuità
  }

  update(dt) {
    const currentTime = this.uniforms.uTime.value;
    
    // Aggiorna età e gestisce respawn
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
        // Respawn con posizione più naturale
        const ang = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.7) * 0.32; // Bias verso centro
        
        posA[i*3+0] = this.origin.x + Math.cos(ang) * r;
        posA[i*3+1] = this.origin.y + Math.random() * 0.08;
        posA[i*3+2] = this.origin.z + Math.sin(ang) * r;

        // Velocità con più realismo
        const centerBias = 1.0 - (r / 0.32); // Particelle centrali vanno più in alto
        const sideStr = 0.15 * (0.5 + Math.random() * 0.5);
        
        velA[i*3+0] = (Math.random() - 0.5) * sideStr;
        velA[i*3+1] = (0.8 + Math.random() * 0.6) * (0.7 + centerBias * 0.5);
        velA[i*3+2] = (Math.random() - 0.5) * sideStr;

        life[i] = 0.8 + Math.random() * 0.8;
        age[i]  = 0.0;
        sizeA[i] = 0.4 + Math.random() * 0.6;
        tempA[i] = 0.7 + Math.random() * 0.3; // Temperature più calde al respawn
        
        // Nuovi valori di noise
        noiseA[i*3+0] = (Math.random() - 0.5) * 2.0;
        noiseA[i*3+1] = (Math.random() - 0.5) * 2.0;
        noiseA[i*3+2] = (Math.random() - 0.5) * 2.0;
        
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      this._ageAttr.needsUpdate = true;
      this._lifeAttr.needsUpdate = true;
      this._startAttr.needsUpdate = true;
      this._velAttr.needsUpdate = true;
      this._sizeAttr.needsUpdate = true;
      this._tempAttr.needsUpdate = true;
      this._noiseAttr.needsUpdate = true;
    } else {
      this._ageAttr.needsUpdate = true; // Age si aggiorna sempre
    }

    // Aggiorna uniforms
    this.uniforms.uTime.value += dt;
    const t = this.uniforms.uTime.value;
    
    // Aggiorna direzione vento con variazione naturale
    const windAngle = Math.sin(t * 0.3) * 0.5;
    this.windDirection.set(
      0.3 + Math.sin(windAngle) * 0.2,
      0.1 + Math.sin(t * 0.8) * 0.05,
      0.1 + Math.cos(windAngle) * 0.15
    ).normalize();
    this.uniforms.uWindDir.value.copy(this.windDirection);

    // Luci con flicker più naturale e complesso
    const mainFlicker = 1.0 + 
      Math.sin(t * 12.7) * 0.08 + 
      Math.sin(t * 23.3) * 0.06 + 
      Math.sin(t * 47.1) * 0.04;
    
    this.mainLight.intensity = 1.3 * mainFlicker;
    this.mainLight.position.set(
      this.origin.x + Math.sin(t * 1.5) * 0.03,
      this.origin.y + 1.0 + Math.sin(t * 2.2) * 0.04,
      this.origin.z + Math.cos(t * 1.8) * 0.03
    );

    const ambientFlicker = 1.0 + 
      Math.sin(t * 8.9 + 1.5) * 0.06 + 
      Math.sin(t * 19.7 + 2.3) * 0.04;
    
    this.ambientGlow.intensity = 0.5 * ambientFlicker;
    this.ambientGlow.position.set(
      this.origin.x + Math.sin(t * 2.1 + 1.0) * 0.02,
      this.origin.y + 0.5 + Math.sin(t * 3.3 + 0.5) * 0.03,
      this.origin.z + Math.cos(t * 2.5 + 1.5) * 0.02
    );

    // Aggiorna parametri camera
    this.uniforms.uFovY.value = THREE.MathUtils.degToRad(camera.fov);
  }

  // Metodi per controllo dinamico
  setIntensity(intensity) {
    this.uniforms.uSize.value = 42.0 * intensity;
    this.mainLight.intensity = 1.3 * intensity;
    this.ambientGlow.intensity = 0.5 * intensity;
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
    this.mainLight.position.copy(v3).add(new THREE.Vector3(0, 1.0, 0));
    this.ambientGlow.position.copy(v3).add(new THREE.Vector3(0, 0.5, 0));
  }

  dispose() {
    scene.remove(this.points);
    scene.remove(this.mainLight);
    scene.remove(this.ambientGlow);
    this.points.geometry.dispose();
    this.points.material.dispose();
    if (this.texture) this.texture.dispose();
  }
}

// Helpers migliorati
export function spawnFire(pos, options = {}) {
  const fx = new FireParticleSystem(pos, options);
  _fires.push(fx);
  return fx;
}

export function updateFires(dt) { 
  for (let i = 0; i < _fires.length; i++) {
    _fires[i].update(dt);
  }
}

export function clearFires() { 
  while(_fires.length) { 
    const f = _fires.pop(); 
    f.dispose(); 
  } 
}

// Funzione per controllare globalmente l'intensità del vento
export function setGlobalWind(direction, strength) {
  _fires.forEach(fire => {
    fire.setWindDirection(direction);
    fire.setWindStrength(strength);
  });
}

// Funzione per controllare globalmente la turbolenza
export function setGlobalTurbulence(turbulence) {
  _fires.forEach(fire => {
    fire.setTurbulence(turbulence);
  });
}

// Event listener migliorato per il resize
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