import * as THREE from 'three';
import { scene, camera } from '../scene.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { createTerrainMaterial } from '../graphics/terrainShader.js';
import { createSunLight, createMoonLight,sun,moon } from '../graphics/shadowManager.js';
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

  if (
    ix < 0 || iz < 0 ||
    ix >= terrainSegments || iz >= terrainSegments
  ) return 0;

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

export function addWaterPlane() {
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
    waterColor: 0x001e0f,
    distortionScale: 5.0,
    fog: scene.fog !== undefined
  });

  water.rotation.x = -Math.PI / 2;
  water.position.y = 10;
  scene.add(water);
}

export function updateWater(delta) {
  const t = (water.material.uniforms.time.value += delta);
if (terrainMaterial?.userData?.shaderRef) {
  terrainMaterial.userData.shaderRef.uniforms.time.value = t;
}

}


export async function createHeightmapTerrain() {
  return new Promise((resolve, reject) => {
    const textureLoader = new THREE.TextureLoader();
    scene.background = new THREE.Color(0x1a1e2a);
    scene.fog = new THREE.Fog(0x1a1e2a, 60, 250);

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

      // ✅ Calcola UV correttamente per la mesh
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox;
      const size = new THREE.Vector3();
      bbox.getSize(size);

      const uvAttr = [];
      for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i);
      const z = vertices.getY(i);
      const u = (x + terrainSize / 2) / terrainSize;
      const v = (z + terrainSize / 2) / terrainSize;

      uvAttr.push(u, v);

      }
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvAttr, 2));

      terrainMaterial = createTerrainMaterial(textureLoader);
      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.rotation.x = -Math.PI / 2;
      terrain.receiveShadow = true;
      terrain.castShadow = true;
      scene.add(terrain);
      setTerrainMesh(terrain);
      console.log(`Terrain deformato correttamente. Altezza normalizzata: min ${minH.toFixed(2)}, max ${maxH.toFixed(2)}`);
      resolve();
    };

    heightMapImg.onerror = () => {
      console.error('Errore nel caricamento della heightmap.');
      reject();
    };

    createSunLight();
    createMoonLight();
     ambientLight = new THREE.AmbientLight(0x445566, 0.4);
    scene.add(ambientLight);
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
  emissiveIntensity: 2.5,
  roughness: 1,
  metalness: 0,
  toneMapped: false
});

  moonMesh = new THREE.Mesh(moonGeo, moonMat);
  moonMesh.scale.setScalar(300); // molto più grande per essere visibile
  moonMesh.castShadow = false;
  moonMesh.receiveShadow = false;

  scene.add(moonMesh);





  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;
}

export function updateSunPosition() {
  sunAngle += 0.001;
  const sunElevation = 45 * Math.sin(sunAngle);
  const sunPhi = THREE.MathUtils.degToRad(90 - sunElevation);
  const theta = THREE.MathUtils.degToRad(180);

  // Posizione Sole
  sunVector.setFromSphericalCoords(1, sunPhi, theta);
  if (sky?.material?.uniforms?.sunPosition) {
    sky.material.uniforms['sunPosition'].value.copy(sunVector);
  }

  sun?.position.copy(sunVector.clone().multiplyScalar(400));
  sun?.lookAt(sun.target?.position);

  // Posizione Luna (opposta al sole)
  const moonVector = sunVector.clone().negate();
  moon?.position.copy(moonVector.clone().multiplyScalar(400));

  // Intensità giorno/notte
  const dayFactor = Math.max(0.25, Math.sin(sunAngle));
  sun.intensity = THREE.MathUtils.lerp(0.05, 1.0, dayFactor);
  moon.intensity = THREE.MathUtils.lerp(0.2, 0.01, dayFactor);
  ambientLight.intensity = THREE.MathUtils.lerp(0.1, 0.6, dayFactor);
  // Ambient light opzionale
  scene.fog.color.setHSL(0.6, 0.6, THREE.MathUtils.lerp(0.05, 0.6, dayFactor));
  scene.background.setHSL(0.6, 0.6, THREE.MathUtils.lerp(0.05, 0.6, dayFactor));
  if (terrainMaterial?.userData?.shaderRef?.uniforms?.dayFactor) {
    terrainMaterial.userData.shaderRef.uniforms.dayFactor.value = dayFactor;
  }
  // Luna visiva (mesh sfera)
  if (moonMesh) {
    moonMesh.position.copy(moonVector.clone().multiplyScalar(5000)); // molto più lontano
    moonMesh.scale.setScalar(300); // visibile ma irraggiungibile

    moonMesh.lookAt(scene.position);
  }
}
