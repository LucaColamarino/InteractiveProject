import * as THREE from 'three';
import { scene } from './scene.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { createTerrainMaterial } from './terrainShader.js';
import { createSunLight } from './shadowManager.js';
import { sun } from './shadowManager.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

let terrainMesh = null;
export let water = null;
export let terrainMaterial = null;
let sky = null;
const sunVector = new THREE.Vector3();
let sunAngle = 0.3 * Math.PI;

let heightData = null;
let terrainSize = 1000;
let terrainSegments = 256;
let terrainScale = 120;

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
  if (terrainMaterial?.uniforms?.time) {
    terrainMaterial.uniforms.time.value = t;
  }
}

export function updateShadowUniforms() {
  if (!terrainMaterial || !sun || !sun.shadow || !sun.shadow.map || !sun.shadow.map.texture) return;

  const shadowMatrix = new THREE.Matrix4();
  shadowMatrix.set(
    0.5, 0.0, 0.0, 0.5,
    0.0, 0.5, 0.0, 0.5,
    0.0, 0.0, 0.5, 0.5,
    0.0, 0.0, 0.0, 1.0
  );
  shadowMatrix.multiply(sun.shadow.camera.projectionMatrix);
  shadowMatrix.multiply(sun.shadow.camera.matrixWorldInverse);

  terrainMaterial.uniforms.shadowMatrix.value.copy(shadowMatrix);
  terrainMaterial.uniforms.shadowMap.value = sun.shadow.map.texture;
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
      terrainMaterial = createTerrainMaterial(textureLoader);
      const terrain = new THREE.Mesh(geometry, terrainMaterial);
      terrain.rotation.x = -Math.PI / 2;
      terrain.receiveShadow = true;
      scene.add(terrain);
      updateShadowUniforms();
      setTerrainMesh(terrain);
      console.log(`Terrain deformato correttamente. Altezza normalizzata: min ${minH.toFixed(2)}, max ${maxH.toFixed(2)}`);
      resolve();
    };

    heightMapImg.onerror = () => {
      console.error('Errore nel caricamento della heightmap.');
      reject();
    };

    createSunLight();
    const ambientLight = new THREE.AmbientLight(0x445566, 0.4);
    scene.add(ambientLight);
  });
}

export function createSky() {
  sky = new Sky();
  sky.scale.setScalar(10000);
  scene.add(sky);

  const skyUniforms = sky.material.uniforms;
  skyUniforms['turbidity'].value = 10;
  skyUniforms['rayleigh'].value = 2;
  skyUniforms['mieCoefficient'].value = 0.005;
  skyUniforms['mieDirectionalG'].value = 0.8;
}

export function updateSunPosition() {
  sunAngle += 0.001;
  const phi = THREE.MathUtils.degToRad(90 - 45 * Math.sin(sunAngle));
  const theta = THREE.MathUtils.degToRad(180);
  sunVector.setFromSphericalCoords(1, phi, theta);
  sky.material.uniforms['sunPosition'].value.copy(sunVector);

  if (sun) {
    sun.position.copy(sunVector.clone().multiplyScalar(400));
    sun.lookAt(0, 0, 0);
  }
}
