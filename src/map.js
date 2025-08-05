import * as THREE from 'three';
import { scene } from './scene.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { createTerrainMaterial } from './terrainShader.js';
import { createSunLight } from './shadowManager.js';
import { sun } from './shadowManager.js';

let terrainMesh = null;
export let water = null;
export let terrainMaterial = null;

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

export function setTerrainMesh(mesh) {
  terrainMesh = mesh;
}

export function getTerrainHeightAt(x, z) {
  if (!terrainMesh) return 0;
  raycaster.set(new THREE.Vector3(x, 200, z), down);
  const intersects = raycaster.intersectObject(terrainMesh);
  return intersects.length > 0 ? intersects[0].point.y : 0;
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
  water.position.y = 5;
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
  const textureLoader = new THREE.TextureLoader();

  scene.background = new THREE.Color(0x1a1e2a); // blu scuro/grigio
  scene.fog = new THREE.Fog(0x1a1e2a, 60, 250);


  const heightMapImg = new Image();
  heightMapImg.src = '/textures/terrain/heightmap.png';

  heightMapImg.onload = () => {
    const segments = 256;
    const scale = 60; // ⬆️ Aumentato per avere maggiore dislivello

    const canvas = document.createElement('canvas');
    canvas.width = segments + 1;
    canvas.height = segments + 1;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(heightMapImg, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    const geometry = new THREE.PlaneGeometry(1000, 1000, segments, segments);
    const vertices = geometry.attributes.position;

    let maxH = -Infinity;
    let minH = Infinity;

    for (let i = 0; i < vertices.count; i++) {
      const x = i % (segments + 1);
      const y = Math.floor(i / (segments + 1));
      const idx = (y * canvas.width + x) * 4;

      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];
      let height = (r + g + b) / (3 * 255);

      // 🔄 Stretch range: elevate mountains, lower valleys
      height = Math.pow(height, 1.5); // accentua la differenza
      vertices.setZ(i, height * scale);

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
  };

  heightMapImg.onerror = () => {
    console.error("Errore nel caricamento della heightmap.");
  };

  createSunLight();

  const ambientLight = new THREE.AmbientLight(0x445566, 0.4); // tono più freddo e debole

  scene.add(ambientLight);
}
