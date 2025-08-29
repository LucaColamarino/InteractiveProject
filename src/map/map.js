// src/map/map.js
import * as THREE from 'three';
import { scene, camera } from '../scene.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { createTerrainMaterial } from '../graphics/terrainShader.js';
import { createSunLight, createMoonLight, sun, moon } from '../graphics/shadowManager.js';
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

// (Opz.) Hook per exposure renderer
let _setExposure = null;
export function setExposureSetter(fn) { _setExposure = fn; }

// ======= MATERIAL CALIBRATION (foliage/rock) =======
const _foliage = new Set();
const _rocks   = new Set();

/** Chiama questa sui root dei tuoi alberi/cespugli:
 *  markAsFoliage(treeRoot)
 *  markAsRock(rockRoot)
 *  Verranno modulati di notte per non “sparare”.
 */
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

// Fallback: prova a riconoscere automaticamente qualche mesh “verde”
function _autoHarvestSceneOnce() {
  let grabbed = 0;
  scene.traverse((o)=>{
    if (!o.isMesh) return;
    const n = (o.name||'').toLowerCase();
    if (o.userData.isFoliage || o.userData.isRock) return;
    if (n.includes('tree') || n.includes('leaf') || n.includes('bush') || n.includes('grass')) {
      _foliage.add(o);
      o.userData.isFoliage = true;
      grabbed++;
    }
  });
  if (grabbed>0) console.log(`[lighting] auto-harvested ${grabbed} foliage meshes`);
}
let _didHarvest = false;

function _tuneNightMaterials(daylight) {
  // daylight: 1 giorno pieno, 0 notte piena
  if (!_didHarvest) { _autoHarvestSceneOnce(); _didHarvest = true; }

  const night = 1.0 - daylight;
  if (night <= 0.01) return; // di giorno non toccare

  const applyClamp = (m) => {
    if (!m) return;
    // clamp PBR per evitare “plasticoso” e highlight irreali
    if ('metalness' in m) m.metalness = Math.min(m.metalness ?? 0, 0.12);
    if ('roughness' in m) m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
    if ('envMapIntensity' in m) m.envMapIntensity = 0.25 * (1.0 - 0.6*daylight); // max 0.25 a notte
    if ('emissiveIntensity' in m) m.emissiveIntensity = Math.min(m.emissiveIntensity ?? 0, 0.08);
    if ('toneMapped' in m && m.toneMapped === false) m.toneMapped = true; // evita bypass del tonemapping
  };

  _foliage.forEach(mesh => applyClamp(mesh.material));
  _rocks.forEach(mesh => applyClamp(mesh.material));
}

// ================================================

export function setTerrainMesh(mesh) {
  terrainMesh = mesh;
}

export function getTerrainHeightAt(x, z) {
  if (!heightData) return 0;

  const halfSize = terrainSize / 2;
  const gridX = ((x + halfSize) / terrainSize) * terrainSegments;
  const gridZ = ((z + halfSize) / terrainSize) * terrainSegments;

  const ix = Math.floor(gridX);
  const iz = Math.floor(gridZ);
  const fx = gridX - ix;
  const fz = gridZ - iz;

  if (ix < 0 || iz < 0 || ix >= terrainSegments || iz >= terrainSegments) return 0;

  const idx = (x, z) => z * (terrainSegments + 1) + x;
  const h00 = heightData[idx(ix, iz)];
  const h10 = heightData[idx(ix + 1, iz)];
  const h01 = heightData[idx(ix, iz + 1)];
  const h11 = heightData[idx(ix + 1, iz + 1)];

  const h0 = h00 * (1 - fx) + h10 * fx;
  const h1 = h01 * (1 - fx) + h11 * fx;
  const finalHeight = h0 * (1 - fz) + h1 * fz;

  return finalHeight;
}

export function addWaterPlane(waterY) {
  const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
  const waterNormals = new THREE.TextureLoader().load('/textures/terrain/waternormals.jpg', texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });

  water = new Water(waterGeometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    waterNormals: waterNormals,
    sunDirection: (sun?.position.clone().normalize()) ?? new THREE.Vector3(1, 1, 1),
    sunColor: 0xffffff,
    waterColor: 0x001a12,  // appena più scura
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

    // Fondo & Fog in stile Souls: scuro + fog esponenziale
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

      let maxH = -Infinity;
      let minH = Infinity;
      for (let i = 0; i < vertices.count; i++) {
        const x = i % (terrainSegments + 1);
        const y = Math.floor(i / (terrainSegments + 1));
        const idx = (y * canvas.width + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        let height = (r + g + b) / (3 * 255);
        height = Math.pow(height, 1.5);
        const finalHeight = height * terrainScale;
        vertices.setZ(i, finalHeight);
        heightData[y * (terrainSegments + 1) + x] = finalHeight;

        maxH = Math.max(maxH, height);
        minH = Math.min(minH, height);
      }

      geometry.computeVertexNormals();
      vertices.needsUpdate = true;

      // UV coerenti col piano prima della rotazione (x,y del plane)
      const uvAttr = [];
      for (let i = 0; i < vertices.count; i++) {
        const px = vertices.getX(i);
        const py = vertices.getY(i);
        const u = (px + terrainSize / 2) / terrainSize;
        const v = (py + terrainSize / 2) / terrainSize;
        uvAttr.push(u, v);
      }
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvAttr, 2));

      terrainMaterial = createTerrainMaterial(textureLoader);
      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.rotation.x = -Math.PI / 2;

      // FIX: il terreno non deve proiettare ombre (riduce acne/artefatti)
      terrain.receiveShadow = true;
      terrain.castShadow = false;

      scene.add(terrain);
      setTerrainMesh(terrain);
      console.log(`Terrain deformato correttamente.`);
      resolve();
    };

    heightMapImg.onerror = () => {
      console.error('Errore nel caricamento della heightmap.');
      reject();
    };

    createSunLight();
    createMoonLight();

    // Ambient più basso (contrasto alto) ma non nero
    ambientLight = new THREE.AmbientLight(0x404850, 0.18);
    scene.add(ambientLight);

    // Hemisphere tenue (quasi nulla di notte)
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

  const moonTex = new THREE.TextureLoader().load('/textures/moon.jpg');
  moonTex.wrapS = moonTex.wrapT = THREE.ClampToEdgeWrapping;
  moonTex.anisotropy = 16;
  const moonGeo = new THREE.SphereGeometry(1, 64, 64);
  const moonMat = new THREE.MeshStandardMaterial({
    map: moonTex,
    emissive: new THREE.Color(0xccccff),
    emissiveIntensity: 1.4, // meno glow
    roughness: 1,
    metalness: 0,
    toneMapped: false
  });

  moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.scale.setScalar(300);
  moonMesh.castShadow = false;
  moonMesh.receiveShadow = false;
  scene.add(moonMesh);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;
}

const DAY_LENGTH_SEC = 600; // ~5 minuti ciclo completo
const ANGULAR_SPEED  = (Math.PI * 2) / DAY_LENGTH_SEC; // rad/sec

export function updateSunPosition(delta) {
  sunAngle = (sunAngle + ANGULAR_SPEED * (delta || 0)) % (Math.PI * 2);
  const sunElevation = 45 * Math.sin(sunAngle);
  const sunPhi = THREE.MathUtils.degToRad(90 - sunElevation);
  const theta = THREE.MathUtils.degToRad(180);

  // Direzioni sole/luna
  sunVector.setFromSphericalCoords(1, sunPhi, theta);
  if (sky?.material?.uniforms?.sunPosition) {
    sky.material.uniforms.sunPosition.value.copy(sunVector);
  }

  sun?.position.copy(sunVector.clone().multiplyScalar(400));
  //sun?.lookAt(sun.target?.position);

  const moonVector = sunVector.clone().negate();
  moon?.position.copy(moonVector.clone().multiplyScalar(400));

  // Daylight [0..1]
  const daylightRaw = (Math.sin(sunAngle) + 1) * 0.5;
  const daylight = THREE.MathUtils.smoothstep(daylightRaw, 0.06, 0.94);

  // === Luci ===
  // Sole più forte di giorno, luna appena accennata di notte
  sun.intensity  = THREE.MathUtils.lerp(0.0, 1.0, daylight);
  moon.intensity = THREE.MathUtils.lerp(0.18, 0.04, daylight);

  // Ambient basso (contrasto alto)
  ambientLight.intensity = THREE.MathUtils.lerp(0.14, 0.24, daylight);

  // Hemisphere: quasi zero di notte
  if (hemiLight) {
    hemiLight.intensity = THREE.MathUtils.lerp(0.06, 0.12, daylight);
    const skyCol    = new THREE.Color().setHSL(0.60, 0.22, THREE.MathUtils.lerp(0.30, 0.60, daylight));
    const groundCol = new THREE.Color().setHSL(0.58, 0.18, THREE.MathUtils.lerp(0.18, 0.35, daylight));
    hemiLight.color.copy(skyCol);
    hemiLight.groundColor.copy(groundCol);
  }

  // === Fog esponenziale: densità più alta di notte
  if (scene.fog && scene.fog.isFogExp2) {
    // notte più “stretta”
    const densityNight = 0.012;
    const densityDay   = 0.006;
    scene.fog.density = THREE.MathUtils.lerp(densityNight, densityDay, daylight);
  }

  // Passa dayFactor agli shader del terreno
  if (terrainMaterial?.userData?.shaderRef?.uniforms?.dayFactor) {
    terrainMaterial.userData.shaderRef.uniforms.dayFactor.value = daylight;
  }

  // Acqua più scura di notte
  if (water?.material?.uniforms?.waterColor) {
    const nightWater = new THREE.Color(0x0b141a);
    const dayWater   = new THREE.Color(0x001a12);
    const mix = new THREE.Color().lerpColors(nightWater, dayWater, daylight);
    water.material.uniforms.waterColor.value = mix;
  }
  if (water?.material?.uniforms?.sunDirection) {
    const dir = (daylight > 0.12 ? sunVector : moonVector).clone().normalize();
    water.material.uniforms.sunDirection.value.copy(dir);
  }

  // Exposure FISSA (leggermente sotto 1) per evitare scene “bruciate”
  if (_setExposure) {
    _setExposure(0.95);
  }

  // Luna mesh
  if (moonMesh) {
    moonMesh.position.copy(moonVector.clone().multiplyScalar(5000));
    moonMesh.scale.setScalar(300);
    moonMesh.lookAt(scene.position);
  }

  // Modula materiali a notte fonda (evita foliage troppo luminosi)
  _tuneNightMaterials(daylight);
}
