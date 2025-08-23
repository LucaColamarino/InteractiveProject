// src/utils/EntityFactory.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadAnimations, fixAnimationLoop } from './AnimationLoader.js';
import { ENTITY_CONFIG } from './entities.js';
import { scene, camera, renderer } from '../scene.js';

// ---------------- Singletons & caches ----------------
const fbxLoader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

const baseModelCache = new Map();   // key -> FBX (base)
const cloneWarmCache = new Map();   // key -> FBX (materializzato pre-clone, opzionale)

// --------------- Texture & material helpers ---------------
function loadTex(path, { srgb = false } = {}) {
  if (!path) return null;
  const t = textureLoader.load(path);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildStandardMaterialFromMaps(tex, { skinning = false, nameHint = '' } = {}) {
  const hasAlpha = !!tex?.alphaMap;
  const mat = new THREE.MeshStandardMaterial({
    map: loadTex(tex?.diffuse, { srgb: true }),
    normalMap: loadTex(tex?.normal),
    alphaMap: loadTex(tex?.alphaMap),
    metalness: 0.1,
    roughness: 0.9,
    alphaTest: hasAlpha ? 0.5 : 0.0,
    transparent: hasAlpha,
    depthWrite: hasAlpha ? false : true,
    skinning
  });
  mat.name = nameHint || mat.name || 'EntityMat';
  return mat;
}

function isSimpleTexRoot(root) {
  if (!root || typeof root !== 'object') return false;
  return ('diffuse' in root) || ('normal' in root) || ('alphaMap' in root) || ('specular' in root);
}

function resolveTexForNames(matName, meshName, root) {
  if (!root) return null;
  if (isSimpleTexRoot(root)) return { matchedKey: '(single)', texConfig: root };
  const m = (matName || '').toLowerCase();
  const n = (meshName || '').toLowerCase();
  const keys = Object.keys(root).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const k = key.toLowerCase();
    if (m.includes(k) || n.includes(k)) return { matchedKey: key, texConfig: root[key] };
  }
  return null;
}

export function applyExternalMaterials(root, config) {
  const rootTex = config?.textures;
  if (!rootTex) return;

  root.traverse(child => {
    const isMesh = !!child.isMesh;
    const isSkinned = !!child.isSkinnedMesh;
    if (!(isMesh || isSkinned)) return;

    if (Array.isArray(child.material)) {
      const oldArr = child.material;
      const newArr = oldArr.map((oldMat, i) => {
        const res = resolveTexForNames(oldMat?.name, child.name, rootTex);
        if (res?.texConfig) {
          const mat = buildStandardMaterialFromMaps(res.texConfig, { skinning: isSkinned, nameHint: res.matchedKey });
          if (oldMat?.transparent) { mat.transparent = true; mat.alphaTest = Math.max(mat.alphaTest, oldMat.alphaTest || 0); }
          return mat;
        }
        const fallback = oldMat?.clone ? oldMat.clone() : new THREE.MeshStandardMaterial();
        if (isSkinned) fallback.skinning = true;
        if (!fallback.name || fallback.name === '') fallback.name = oldMat?.name || `mat#${i}`;
        return fallback;
      });
      if (child.geometry?.groups && child.geometry.groups.length > newArr.length) {
        while (child.geometry.groups.length > newArr.length) newArr.push(newArr[newArr.length - 1]);
      }
      child.material = newArr;
    } else {
      const res = resolveTexForNames(child.material?.name, child.name, rootTex);
      if (res?.texConfig) {
        child.material = buildStandardMaterialFromMaps(res.texConfig, { skinning: isSkinned, nameHint: res.matchedKey });
      } else if (isSkinned && child.material && !child.material.skinning) {
        child.material = child.material.clone();
        child.material.skinning = true;
      }
    }

    if (isSkinned && child.material && !child.material.skinning) child.material.skinning = true;
    if (isSkinned) child.frustumCulled = false;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

// --------------- Preload & cloning ---------------
export async function preloadEntity(key) {
  if (baseModelCache.has(key)) return baseModelCache.get(key);
  const cfg = ENTITY_CONFIG[key];
  if (!cfg) throw new Error(`ENTITY_CONFIG mancante per "${key}"`);

  const base = await fbxLoader.loadAsync(cfg.modelPath);
  baseModelCache.set(key, base);

  // Prepara una versione materializzata (facoltativa) per warm-up
  const cloned = SkeletonUtils.clone(base);
  applyExternalMaterials(cloned, cfg);
  cloneWarmCache.set(key, cloned);

  // Warm-up GPU shader compilation (opzionale ma utile)
  const dummy = SkeletonUtils.clone(cloned);
  dummy.visible = false;
  if (cfg.scale) dummy.scale.copy(cfg.scale);
  scene.add(dummy);
  renderer.render(scene, camera);
  scene.remove(dummy);

  return base;
}

export async function preloadAllEntities(keys = Object.keys(ENTITY_CONFIG)) {
  for (const k of keys) {
    try { await preloadEntity(k); } catch (e) { console.warn('[EntityFactory] preload fallito:', k, e); }
  }
  renderer.compile(scene, camera);
}

export function instantiateEntity(key) {
  // Usa la versione warm/materializzata se presente, altrimenti clona il base
  let source = cloneWarmCache.get(key) || baseModelCache.get(key);
  if (!source) throw new Error(`Entity "${key}" non pre-caricata: chiama preloadEntity/preloadAllEntities prima.`);

  const cfg = ENTITY_CONFIG[key];
  const fbx = SkeletonUtils.clone(source);
  fbx.animations = source.animations || fbx.animations;
  if (cfg?.scale) fbx.scale.copy(cfg.scale);

  // Safety: se abbiamo clonato il "base" non materializzato, applica ora i materiali
  if (!cloneWarmCache.has(key)) applyExternalMaterials(fbx, cfg);

  // flag comuni
  fbx.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      if (c.isSkinnedMesh) c.frustumCulled = false;
    }
  });

  return fbx;
}

// --------------- Animations (uniform API) ---------------
export function buildMixerAndActions(targetFBX, cfg) {
  // Se hai indices, usali, altrimenti usa loadAnimations(paths)
  if (cfg?.animationIndices) {
    const mixer = new THREE.AnimationMixer(targetFBX);
    const actions = {};
    for (const [key, idx] of Object.entries(cfg.animationIndices)) {
      const clip = fixAnimationLoop(targetFBX.animations[idx]);
      if (clip) actions[key] = mixer.clipAction(clip);
    }
    return { mixer, actions };
  }
  if (cfg?.animations) {
    return loadAnimations(targetFBX, cfg.animations); // { mixer, actions }
  }
  return { mixer: null, actions: {} };
}
