// BridgeSimple.js (ottimizzato)
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene';

// --- Cache semplice per le texture ---
const _texCache = new Map();
function loadColorTex(tl, url) {
  if (_texCache.has(url)) return _texCache.get(url);
  const t = tl.load(url);
  if ('SRGBColorSpace' in THREE) t.colorSpace = THREE.SRGBColorSpace;
  else if ('sRGBEncoding' in THREE) t.encoding = THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _texCache.set(url, t);
  return t;
}
function loadLinearTex(tl, url) {
  if (_texCache.has(url)) return _texCache.get(url);
  const t = tl.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _texCache.set(url, t);
  return t;
}

/** Crea i materiali specifici per il tuo bridge */
function makeBridgeMaterials(basePath) {
  const tl = new THREE.TextureLoader();

  const wood = new THREE.MeshStandardMaterial({
    name: 'wood_mat',
    map:        loadColorTex(tl, `${basePath}/wood_diffuse.png`),
    normalMap:  loadLinearTex(tl, `${basePath}/wood_normal.png`),
    roughness:  1.0,
    metalness:  0.0,
  });

  const steel = new THREE.MeshStandardMaterial({
    name: 'steel_mat',
    map:           loadColorTex(tl, `${basePath}/steel_diffuse.png`),
    normalMap:     loadLinearTex(tl, `${basePath}/steel_normal.png`),
    roughnessMap:  loadLinearTex(tl, `${basePath}/steel_roughness.png`),
    metalnessMap:  loadLinearTex(tl, `${basePath}/steel_metallic.png`),
    roughness:     0.5,
    metalness:     1.0,
  });

  const rock = new THREE.MeshStandardMaterial({
    name: 'rock_mat',
    map:        loadColorTex(tl, `${basePath}/rock_diffuse.png`),
    normalMap:  loadLinearTex(tl, `${basePath}/rock_normal.png`),
    roughness:  1.0,
    metalness:  0.0,
  });

  const cobble = new THREE.MeshStandardMaterial({
    name: 'cobblestone_mat',
    map:           loadColorTex(tl, `${basePath}/cobblestone_diffuse.jpg`),
    normalMap:     loadLinearTex(tl, `${basePath}/cobblestone_normal.jpg`),
    roughnessMap:  loadLinearTex(tl, `${basePath}/cobblestone_roughness.jpg`),
    roughness:     1.0,
    metalness:     0.0,
  });

  const rock1 = rock; // alias

  return { wood, steel, rock, rock1, cobblestone: cobble };
}

/** Seleziona il materiale giusto in base al nome originale */
function pickMatByName(name, mats) {
  const n = (name || '').toLowerCase();
  if (n.includes('cobblestone')) return mats.cobblestone;
  if (n.includes('rock1'))       return mats.rock1;
  if (n.includes('rock'))        return mats.rock;
  if (n.includes('steel'))       return mats.steel;
  if (n.includes('wood'))        return mats.wood;
  return mats.wood;
}

export async function createBridge({
  scale = 0.01,
  position = new THREE.Vector3(0, 0, 0),
  rotationY = 0,
  uvTile = 1,
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const modelUrl = '/models/props/Bridge.fbx';
  const texturesPath = '/textures/bridge';
  const loader = new FBXLoader();
  const root = await loader.loadAsync(modelUrl);

  const mats = makeBridgeMaterials(texturesPath);

  // tiling UV (applica a tutte le mappe esistenti)
  const tile = (uvTile instanceof THREE.Vector2) ? uvTile : new THREE.Vector2(uvTile, uvTile);
  Object.values(mats).forEach((mat) => {
    [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap, mat.aoMap].forEach((t) => {
      if (t) t.repeat.copy(tile);
    });
  });

  root.traverse((o) => {
    if (!o.isMesh) return;

    o.castShadow = castShadow;
    o.receiveShadow = receiveShadow;

    if (Array.isArray(o.material)) {
      const original = o.material;
      o.material = original.map((m) => {
        const chosen = pickMatByName(m?.name, mats);
        chosen.needsUpdate = true;
        return chosen;
      });

      // ❌ Fallback gruppi rimosso: se non ci sono groups, non forziamo niente.
    } else {
      const chosen = pickMatByName(o.material?.name || o.name, mats);
      chosen.needsUpdate = true;
      o.material = chosen;
    }
  });

  // trasformazioni e culling
  root.scale.setScalar(scale);
  root.position.copy(position);
  root.rotation.set(0, rotationY, 0);
  root.traverse((o) => {
    if (o.isMesh && o.geometry) {
      // BoundingSphere usata dal frustum culling
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      // La boundingBox non è necessaria per il culling; puoi commentarla:
      // if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      o.frustumCulled = true;
    }
  });

  const group = new THREE.Group();
  group.name = 'BridgeRoot';
  group.add(root);
  scene.add(group);
  return group;
}
