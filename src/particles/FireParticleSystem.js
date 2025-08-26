// src/effects/FireParticleSystem.js
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
    .filter(f => f.lightCore) // solo quelli con light
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

/** === Shaders migliorati con supporto per cambio colore === */
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
    float distanceFactor = 10.0 / (1.0 + dist * dist * 0.04);
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
  uniform float uPaletteBlend; // 0.0 = normale, 1.0 = blu
  uniform float uTransition;   // per animare la transizione

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

    // === PALETTE NORMALE (arancio/rosso) ===
    vec3 cCore = vec3(1.00, 0.98, 0.85);      // core caldissimo
    vec3 cHot = vec3(1.00, 0.85, 0.35);       // fiamma calda
    vec3 cMid = vec3(1.00, 0.55, 0.15);       // fiamma media
    vec3 cCool = vec3(0.85, 0.25, 0.05);      // fiamma fredda
    vec3 cSmoke = vec3(0.15, 0.15, 0.18);     // fumo scuro
    vec3 cSmokeLight = vec3(0.35, 0.35, 0.40); // fumo chiaro

    // === PALETTE BLU ===
    vec3 cCoreBlue = vec3(0.85, 0.95, 1.00);     // core blu chiaro
    vec3 cHotBlue = vec3(0.40, 0.70, 1.00);      // fiamma blu calda
    vec3 cMidBlue = vec3(0.20, 0.50, 0.95);      // fiamma blu media
    vec3 cCoolBlue = vec3(0.10, 0.35, 0.80);     // fiamma blu fredda
    vec3 cSmokeBlue = vec3(0.12, 0.18, 0.25);    // fumo blu scuro
    vec3 cSmokeLightBlue = vec3(0.30, 0.38, 0.50); // fumo blu chiaro

    // Interpolazione colori per palette normale
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

    // Interpolazione colori per palette blu
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

    // Variazione di temperatura individuale
    fireNormal = mix(fireNormal, cCore, vTemp * 0.3 * (1.0 - vAge01));
    fireBlue = mix(fireBlue, cCoreBlue, vTemp * 0.3 * (1.0 - vAge01));

    // Fumo finale per entrambe le palette
    vec3 colNormal = mix(fireNormal, cSmoke, smoothstep(0.85, 1.0, vAge01));
    vec3 colBlue = mix(fireBlue, cSmokeBlue, smoothstep(0.85, 1.0, vAge01));

    // Blend tra le due palette usando uPaletteBlend e uTransition
    float blendFactor = uPaletteBlend * uTransition;
    vec3 col = mix(colNormal, colBlue, blendFactor);

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

    // Nuove opzioni di illuminazione
    const lightingStrength = opts.lightingStrength ?? 1.0; // 0..2
    const lightingRange    = opts.lightingRange ?? 9;      // raggio in metri
    const enableShadows = opts.enableShadows ?? true;
    this._wantsShadows = enableShadows;
    this._lightingRange = lightingRange;

    const shadowJitter = opts.shadowJitter ?? 1.0; // 0 = nessun movimento
    const shadowBias    = opts.shadowBias    ?? -0.00008;
    const shadowNormalBias = opts.shadowNormalBias ?? 0.01;
    const useHemiBounce = opts.useHemiBounce ?? false;
    this.hemi = null;
    this._shadowJitter = shadowJitter;
    this.origin = pos.clone();
    this.windDirection = new THREE.Vector3(0.3, 0, 0.1).normalize();
    this._lightingStrength = lightingStrength;

    // === SISTEMA DI TRANSIZIONE COLORE ===
    this.currentPalette = 'normal'; // 'normal' o 'blue'
    this.targetPalette = 'normal';
    this.paletteBlend = 0.0;      // 0 = normale, 1 = blu
    this.transitionSpeed = 2.0;   // velocità di transizione
    this.transitionProgress = 1.0; // 1 = transizione completata
    
    // Colori originali delle luci per ripristino
    this.originalLightColors = {
      core: 0xFF9A3C,
      column: 0xFF7A2A,
      halo: 0xFF5A20
    };

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
      uTurbulence:   { value: turbulence },
      // Nuovi uniforms per il cambio colore
      uPaletteBlend: { value: 0.0 },     // 0 = normale, 1 = blu
      uTransition:   { value: 1.0 }      // progresso della transizione
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

    // ──────────────────────────────────
    // RIG DI LUCI PER IL FUOCO
    // ──────────────────────────────────

    // 1) luce core...
    this.lightCore = new THREE.PointLight(0xFF9A3C, 60 * lightingStrength, lightingRange * 0.55, 2.0);
    this.lightCore.position.copy(this.origin).add(new THREE.Vector3(0, 0.7, 0));

    // PARTI SEMPRE SPENTO per evitare overflow texture units nel frame di spawn
    this.lightCore.castShadow = false;

    // salva le preferenze per il rebalance
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

    // 2) luce colonna (più alta, media, no ombre)
    this.lightColumn = new THREE.PointLight(0xFF7A2A, 28 * lightingStrength, lightingRange * 0.9, 2.0);
    this.lightColumn.position.copy(this.origin).add(new THREE.Vector3(0, 1.6, 0));
    this.lightColumn.castShadow = false;
    scene.add(this.lightColumn);

    // 3) alone largo (morbido, largo, no ombre: "riempie" l'ambiente)
    this.lightHalo = new THREE.PointLight(0xFF5A20, 14 * lightingStrength, lightingRange * 1.35, 1.8);
    this.lightHalo.position.copy(this.origin).add(new THREE.Vector3(0, 1.0, 0));
    this.lightHalo.castShadow = false;
    scene.add(this.lightHalo);

    // 4) bounce globale caldo/freddo (hemisphere light)
    if (useHemiBounce) {
      this.hemi = new THREE.HemisphereLight(0xFFB97A, 0x150a05, 0.18 * lightingStrength);
      this.hemi.position.copy(this.origin).add(new THREE.Vector3(0, 3.0, 0));
      scene.add(this.hemi);
    }

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
    _fires.push(this);
    _rebalanceFireShadows();
  }

  // === METODI PER IL CAMBIO COLORE ===
  
  /**
   * Imposta immediatamente la palette del fuoco
   * @param {string} palette - 'normal' o 'blue'
   */
  setPalette(palette) {
    this.currentPalette = palette;
    this.targetPalette = palette;
    this.paletteBlend = palette === 'blue' ? 1.0 : 0.0;
    this.transitionProgress = 1.0;
    
    this.uniforms.uPaletteBlend.value = this.paletteBlend;
    this.uniforms.uTransition.value = this.transitionProgress;
    
    this._updateLightColors(palette === 'blue');
  }

  /**
   * Anima la transizione verso una nuova palette
   * @param {string} palette - 'normal' o 'blue'
   * @param {number} duration - durata in secondi (default: 1.0)
   */
  transitionPalette(palette, duration = 1.0) {
    if (this.targetPalette === palette) return; // Già in transizione verso questa palette
    
    this.targetPalette = palette;
    this.transitionSpeed = 1.0 / Math.max(0.1, duration);
    this.transitionProgress = 0.0; // Inizia la transizione
  }

  /**
   * Aggiorna i colori delle luci in base alla palette
   * @param {boolean} isBlue - true per palette blu
   */
  _updateLightColors(isBlue) {
    if (isBlue) {
      // Colori blu per le luci
      this.lightCore.color.setHex(0x4A9BFF);   // Blu core
      this.lightColumn.color.setHex(0x2C74FF); // Blu colonna
      this.lightHalo.color.setHex(0x1E5FE6);   // Blu alone
      if (this.hemi) {
        this.hemi.color.setHex(0x7ABAFF);       // Blu cielo
        this.hemi.groundColor.setHex(0x0A1520); // Blu scuro terra
      }
    } else {
      // Ripristina colori originali
      this.lightCore.color.setHex(this.originalLightColors.core);
      this.lightColumn.color.setHex(this.originalLightColors.column);
      this.lightHalo.color.setHex(this.originalLightColors.halo);
      if (this.hemi) {
        this.hemi.color.setHex(0xFFB97A);       // Arancio caldo originale
        this.hemi.groundColor.setHex(0x150a05); // Marrone scuro originale
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

        life[i]  = 0.8 + Math.random() * 0.8;
        age[i]   = 0.0;
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
      this._lifeAttr.needsUpdate = true;
      this._startAttr.needsUpdate = true;
      this._velAttr.needsUpdate = true;
      this._sizeAttr.needsUpdate = true;
      this._tempAttr.needsUpdate = true;
      this._noiseAttr.needsUpdate = true;
    }
    // Age si aggiorna sempre
    this._ageAttr.needsUpdate = true;

    // === AGGIORNAMENTO TRANSIZIONE COLORE ===
    if (this.transitionProgress < 1.0) {
      this.transitionProgress += dt * this.transitionSpeed;
      this.transitionProgress = Math.min(1.0, this.transitionProgress);
      
      // Aggiorna il valore di blend
      const targetBlend = this.targetPalette === 'blue' ? 1.0 : 0.0;
      const currentBlend = this.currentPalette === 'blue' ? 1.0 : 0.0;
      this.paletteBlend = THREE.MathUtils.lerp(currentBlend, targetBlend, this.transitionProgress);
      
      this.uniforms.uPaletteBlend.value = this.paletteBlend;
      this.uniforms.uTransition.value = this.transitionProgress;
      
      // Aggiorna anche i colori delle luci gradualmente
      const isTransitioningToBlue = this.targetPalette === 'blue';
      this._updateLightColorsGradual(isTransitioningToBlue, this.transitionProgress);
      
      // Completa la transizione
      if (this.transitionProgress >= 1.0) {
        this.currentPalette = this.targetPalette;
      }
    }

    // Aggiorna uniforms temporali
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

    // ──────────────────────────────────
    // Aggiornamento rig luci (flicker e posizione)
    // ──────────────────────────────────

    // intensità base in funzione di piccole variazioni lente
    const base = 1.0 + Math.sin(t * 1.1) * 0.04;

    // flicker multi-banda coerente
    const f1 = 1.0 + Math.sin(t * 12.7) * 0.10;
    const f2 = 1.0 + Math.sin(t * 23.3 + 1.3) * 0.08;
    const f3 = 1.0 + Math.sin(t * 47.1 + 0.7) * 0.05;
    const flicker = base * f1 * f2 * f3;

    // Deriva di colore per realismo (solo se non in transizione)
    if (this.transitionProgress >= 1.0) {
      if (this.currentPalette === 'normal') {
        const coreHot = new THREE.Color(0xFFD9AA);
        const coreCool = new THREE.Color(0xFF8A3C);
        const mixCore = (Math.sin(t * 0.8) * 0.5 + 0.5) * 0.6; // 0..0.6
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
        // Variazioni blu
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

    // intensità aggiornate (proporzionali allo "strength" globale)
    const k = this._lightingStrength;
    this.lightCore.intensity   = 60 * k * flicker;
    this.lightColumn.intensity = 28 * k * (0.9 + (flicker - 1.0) * 0.6);
    this.lightHalo.intensity   = 14 * k * (0.85 + (flicker - 1.0) * 0.5);
    if (this.hemi) {
      this.hemi.intensity = 0.18 * k * (0.9 + (f1 - 1.0) * 0.4);
      this.hemi.position.set(this.origin.x, this.origin.y + 3.0, this.origin.z);
    }

    // leggere oscillazioni di posizione
    const j = this._shadowJitter; // 0..1
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

    // Aggiorna parametri camera
    this.uniforms.uFovY.value = THREE.MathUtils.degToRad(camera.fov);
  }

  /**
   * Aggiorna i colori delle luci gradualmente durante la transizione
   * @param {boolean} toBlue - true se transizione verso blu
   * @param {number} progress - progresso da 0 a 1
   */
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

  // Metodi per controllo dinamico
  setIntensity(intensity) {
    this.uniforms.uSize.value = 42.0 * intensity; // particelle
    this._lightingStrength = intensity;           // luci
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
    // Rimuovi da _fires array
    const index = _fires.indexOf(this);
    if (index > -1) {
      _fires.splice(index, 1);
    }
    
    scene.remove(this.points);
    scene.remove(this.lightCore, this.lightColumn, this.lightHalo);
    if (this.hemi) scene.remove(this.hemi);
    this.points.geometry.dispose();
    this.points.material.dispose();
    if (this.texture) this.texture.dispose();
  }
}

// Helpers
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

// === NUOVE FUNZIONI GLOBALI PER CONTROLLO COLORE ===

/**
 * Imposta la palette per tutti i fuochi
 * @param {string} palette - 'normal' o 'blue'
 */
export function setGlobalPalette(palette) {
  _fires.forEach(fire => {
    fire.setPalette(palette);
  });
}

/**
 * Anima la transizione di palette per tutti i fuochi
 * @param {string} palette - 'normal' o 'blue'
 * @param {number} duration - durata in secondi
 */
export function transitionGlobalPalette(palette, duration = 1.0) {
  _fires.forEach(fire => {
    fire.transitionPalette(palette, duration);
  });
}

// Event listener per il resize
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