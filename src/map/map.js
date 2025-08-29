// src/map/map.js
import * as THREE from 'three';
import { scene, camera } from '../scene.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { createTerrainMaterial } from '../graphics/terrainShader.js';
import { createSunLight, createMoonLight, sun, moon, fitSunShadowToCenter } from '../graphics/shadowManager.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let terrainMesh = null;
export let water = null;
export let terrainMaterial = null;
let sky = null;
let moonMesh = null;
const sunVector = new THREE.Vector3();
let sunAngle = 0.3 * Math.PI;

let heightData = null;
let terrainSize = 1000;
let terrainSegments = 256;
let terrainScale = 120;
let ambientLight = null;
let hemiLight = null;

// Nel tuo mondo "avanti" è +Z (come per il lock): lasciamo true
const WORLD_FORWARD_IS_POS_Z = true;

// Hook opzionale per settare l'exposure del renderer dall'esterno
let _setExposure = null;
export function setExposureSetter(fn) { _setExposure = fn; }

// ======= MATERIAL CALIBRATION (foliage/rock) =======
const _foliage = new Set();
const _rocks   = new Set();

export function markAsFoliage(root) {
  root.traverse((o)=>{
    if (o.isMesh) { o.userData.isFoliage = true; _foliage.add(o); }
  });
}
export function markAsRock(root) {
  root.traverse((o)=>{
    if (o.isMesh) { o.userData.isRock = true; _rocks.add(o); }
  });
}

function _autoHarvestSceneOnce() {
  let grabbed = 0;
  scene.traverse((o)=>{
    if (!o.isMesh) return;
    const n = (o.name||'').toLowerCase();
    if (o.userData.isFoliage || o.userData.isRock) return;
    if (n.includes('tree') || n.includes('leaf') || n.includes('bush') || n.includes('grass')) {
      _foliage.add(o); o.userData.isFoliage = true; grabbed++;
    }
  });
  if (grabbed>0) console.log(`[lighting] auto-harvested ${grabbed} foliage meshes`);
}
let _didHarvest = false;

function _tuneNightMaterials(daylight) {
  if (!_didHarvest) { _autoHarvestSceneOnce(); _didHarvest = true; }
  const night = 1.0 - daylight;
  if (night <= 0.01) return;

  const clampMat = (m) => {
    if (!m) return;
    if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.12);
    if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
    if ('envMapIntensity' in m) m.envMapIntensity = 0.25 * (1.0 - 0.6*daylight);
    if ('emissiveIntensity' in m) m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 0, 0.08);
    if ('toneMapped' in m && m.toneMapped === false) m.toneMapped = true;
  };

  _foliage.forEach(mesh => clampMat(mesh.material));
  _rocks.forEach(mesh => clampMat(mesh.material));
}

// ================================================

export function setTerrainMesh(mesh) { terrainMesh = mesh; }

export function getTerrainHeightAt(x, z) {
  if (!heightData) return 0;

  const half = terrainSize / 2;
  const gridX = ((x + half) / terrainSize) * terrainSegments;
  const gridZ = ((z + half) / terrainSize) * terrainSegments;

  const ix = Math.floor(gridX), iz = Math.floor(gridZ);
  const fx = gridX - ix, fz = gridZ - iz;

  if (ix < 0 || iz < 0 || ix >= terrainSegments || iz >= terrainSegments) return 0;

  const idx = (x, z) => z * (terrainSegments + 1) + x;
  const h00 = heightData[idx(ix, iz)];
  const h10 = heightData[idx(ix + 1, iz)];
  const h01 = heightData[idx(ix, iz + 1)];
  const h11 = heightData[idx(ix + 1, iz + 1)];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  return h0 * (1 - fz) + h1 * fz;
}

export function addWaterPlane(waterY) {
  const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
  const waterNormals = new THREE.TextureLoader().load('/textures/terrain/waternormals.jpg', t => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  });

  water = new Water(waterGeometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals,
    sunDirection: (sun?.position.clone().normalize()) ?? new THREE.Vector3(1, 1, 1),
    sunColor: 0xffffff,
    waterColor: 0x001a12,
    distortionScale: 5.0,
    fog: scene.fog !== undefined
  });

  water.rotation.x = -Math.PI / 2;
  water.position.y = waterY;
  scene.add(water);
}

export function updateWater(delta) {
  if (!water) return;
  const t = (water.material.uniforms.time.value += delta);
  if (terrainMaterial?.userData?.shaderRef) {
    terrainMaterial.userData.shaderRef.uniforms.time.value = t;
  }
}

export async function createHeightmapTerrain() {
  return new Promise((resolve, reject) => {
    const textureLoader = new THREE.TextureLoader();

    // Fondo & fog cupi per base; poi li moduliamo in updateSunPosition
    const FOG_COLOR = 0x0d0f14;
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.008);

    const heightMapImg = new Image();
    heightMapImg.src = '/textures/terrain/heightmap.png';
    heightMapImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = terrainSegments + 1;
      canvas.height = terrainSegments + 1;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(heightMapImg, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
      const vertices = geometry.attributes.position;
      heightData = new Float32Array((terrainSegments + 1) * (terrainSegments + 1));

      for (let i = 0; i < vertices.count; i++) {
        const x = i % (terrainSegments + 1);
        const y = Math.floor(i / (terrainSegments + 1));
        const idx = (y * canvas.width + x) * 4;
        const r = imgData[idx], g = imgData[idx + 1], b = imgData[idx + 2];
        let h = (r + g + b) / (3 * 255);
        h = Math.pow(h, 1.5);
        const finalH = h * terrainScale;
        vertices.setZ(i, finalH);
        heightData[y * (terrainSegments + 1) + x] = finalH;
      }

      geometry.computeVertexNormals();
      vertices.needsUpdate = true;

      // UV coerenti col plane prima della rotazione
      const uvAttr = [];
      for (let i = 0; i < vertices.count; i++) {
        const px = vertices.getX(i), py = vertices.getY(i);
        const u = (px + terrainSize / 2) / terrainSize;
        const v = (py + terrainSize / 2) / terrainSize;
        uvAttr.push(u, v);
      }
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvAttr, 2));

      terrainMaterial = createTerrainMaterial(textureLoader);
      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.rotation.x = -Math.PI / 2;

      terrain.receiveShadow = true; // riceve ombre
      terrain.castShadow = false;   // non proietta (meno acne)

      scene.add(terrain);
      setTerrainMesh(terrain);
      resolve();
    };

    heightMapImg.onerror = () => { console.error('Errore nel caricamento della heightmap.'); reject(); };

    createSunLight();
    createMoonLight();

    // Luci globali
    ambientLight = new THREE.AmbientLight(0x404850, 0.18);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0x8aaaff, 0x203040, 0.10);
    hemiLight.position.set(0, 1, 0);
    hemiLight.castShadow = false;
    scene.add(hemiLight);
  });
}

export function createSky() {
  sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  // Luna senza texture: sfera semplice con emissive
  // (la material viene modulata in updateSunPosition)
  const moonGeo = new THREE.SphereGeometry(1, 48, 48);
  const moonMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xe6eaff),   // base leggermente azzurra
    emissive: new THREE.Color(0x99aaff),
    emissiveIntensity: 1.0,             // verrà regolata dinamicamente
    roughness: 1,
    metalness: 0,
    toneMapped: false                   // la teniamo fuori dal tone mapping per un "glow" pulito
  });
  moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.scale.setScalar(300);
  moonMesh.castShadow = false;
  moonMesh.receiveShadow = false;
  scene.add(moonMesh);

  // Uniform iniziali "day-friendly" (poi dinamiche in update)
  const U = sky.material.uniforms;
  U['turbidity'].value = 6.0;
  U['rayleigh'].value = 2.5;
  U['mieCoefficient'].value = 0.004;
  U['mieDirectionalG'].value = 0.78;
}

const DAY_LENGTH_SEC = 600;
const ANGULAR_SPEED  = (Math.PI * 2) / DAY_LENGTH_SEC;

/** Aggiorna sole/luna, cielo, fog, acqua e fit del frustum d’ombra. */
export function updateSunPosition(delta) {
  sunAngle = (sunAngle + ANGULAR_SPEED * (delta || 0)) % (Math.PI * 2);

  // Sole: azimuth coerente con mondo avanti = +Z
  const sunElevation = 45 * Math.sin(sunAngle);
  const sunPhi = THREE.MathUtils.degToRad(90 - sunElevation);
  const theta = WORLD_FORWARD_IS_POS_Z ? THREE.MathUtils.degToRad(0) : THREE.MathUtils.degToRad(180);

  // sunVector = direzione dall'origine verso il SOLE
  sunVector.setFromSphericalCoords(1, sunPhi, theta);

  // Posizionamento (senza lookAt per frame)
  sun?.position.copy(sunVector.clone().multiplyScalar(400));

  // Luna opposta
  const moonVector = sunVector.clone().negate();
  moon?.position.copy(moonVector.clone().multiplyScalar(400));

  // Daylight [0..1]
  const daylightRaw = (Math.sin(sunAngle) + 1) * 0.5;
  const daylight = THREE.MathUtils.smoothstep(daylightRaw, 0.06, 0.94);

  // === SKY & FOG DAY/NIGHT ===
  // Modula cielo
  if (sky?.material?.uniforms) {
    const U = sky.material.uniforms;
    U['turbidity'].value       = THREE.MathUtils.lerp(12.0, 2.8, daylight);
    U['rayleigh'].value        = THREE.MathUtils.lerp(0.9, 3.2, daylight);
    U['mieCoefficient'].value  = THREE.MathUtils.lerp(0.0065, 0.0035, daylight);
    U['mieDirectionalG'].value = THREE.MathUtils.lerp(0.85, 0.78, daylight);
    U['sunPosition'].value.copy(sunVector);
  }

  // FogExp2 dinamico: colore più blu/chiaro di giorno, denso e scuro di notte
  if (scene.fog && scene.fog.isFogExp2) {
    const fogNight = new THREE.Color(0x0d0f14); // notte
    const fogDay   = new THREE.Color(0x8ea8d6); // giorno (blu-grigio chiaro)
    const fogCol   = new THREE.Color().lerpColors(fogNight, fogDay, daylight);

    scene.fog.color.copy(fogCol);
    scene.fog.density = THREE.MathUtils.lerp(0.012, 0.005, daylight);

    // Background coerente al fog (anche se c'è Sky mesh resta gradevole)
    scene.background = fogCol;
  }

  // === Luci ===
  sun.intensity  = THREE.MathUtils.lerp(0.0, 1.0, daylight);
  moon.intensity = THREE.MathUtils.lerp(0.18, 0.04, daylight);

  // Ambient/hemisphere
  ambientLight.intensity = THREE.MathUtils.lerp(0.14, 0.28, daylight);
  if (hemiLight) {
    hemiLight.intensity = THREE.MathUtils.lerp(0.06, 0.18, daylight);
    const skyCol    = new THREE.Color().setHSL(0.60, 0.25, THREE.MathUtils.lerp(0.30, 0.70, daylight));
    const groundCol = new THREE.Color().setHSL(0.58, 0.18, THREE.MathUtils.lerp(0.18, 0.42, daylight));
    hemiLight.color.copy(skyCol);
    hemiLight.groundColor.copy(groundCol);
  }

  // Uniform agli shader del terreno
  if (terrainMaterial?.userData?.shaderRef?.uniforms?.dayFactor) {
    terrainMaterial.userData.shaderRef.uniforms.dayFactor.value = daylight;
  }

  // Acqua
  if (water?.material?.uniforms?.waterColor) {
    const nightWater = new THREE.Color(0x0b141a);
    const dayWater   = new THREE.Color(0x0a2a1e);
    const mix = new THREE.Color().lerpColors(nightWater, dayWater, daylight);
    water.material.uniforms.waterColor.value = mix;
  }
  if (water?.material?.uniforms?.sunDirection) {
    const dir = (daylight > 0.12 ? sunVector : moonVector).clone().normalize();
    water.material.uniforms.sunDirection.value.copy(dir);
  }

  // Exposure: più alto di giorno, più basso di notte
  if (_setExposure) {
    const exp = THREE.MathUtils.lerp(0.92, 1.12, daylight); // 0.92 notte → 1.12 giorno
    _setExposure(exp);
  }

  // Luna mesh (senza texture): posizione + “glow” emissivo dinamico
  if (moonMesh) {
    moonMesh.position.copy(moonVector.clone().multiplyScalar(5000));
    moonMesh.scale.setScalar(300);
    moonMesh.lookAt(scene.position);

    // di notte un po' più evidente, di giorno quasi spenta
    const e = THREE.MathUtils.lerp(1.6, 0.15, daylight); // notte 1.6 → giorno 0.15
    moonMesh.material.emissiveIntensity = e;
    moonMesh.material.needsUpdate = true;
  }

  // === Frustum ombre centrato sul terreno davanti alla camera ===
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);

  const focusDist = 55;
  const ahead = camera.position.clone().add(camDir.multiplyScalar(focusDist));
  const groundY = getTerrainHeightAt(ahead.x, ahead.z);
  const center = new THREE.Vector3(ahead.x, groundY + 25, ahead.z);

  const camHeight = Math.max(0, camera.position.y - groundY);
  const boxHalf = THREE.MathUtils.clamp(80 + camHeight * 0.6, 90, 150);

  // Direzione da cui arriva la luce (SOLE -> SCENA) = -sunVector
  const lightDirTowardScene = sunVector.clone().negate();
  fitSunShadowToCenter(center, lightDirTowardScene, boxHalf, 280);

  // Material tuning notturno
  _tuneNightMaterials(daylight);
}
