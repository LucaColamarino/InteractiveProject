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
function loadTex(path, { srgb = false, repeat = 1 } = {}) {
  if (!path) return null;
  const t = textureLoader.load(path);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

/**
 * Crea un MeshStandardMaterial a partire da:
 *   { diffuse, normal, metallic, roughness, ao, opacity|alphaMap, emissive }
 *
 * Note:
 * - niente specular / reflection legacy
 * - niente heuristics basate sul nome del materiale/mesh
 * - se mancano le mappe metallic/roughness usiamo valori di fallback
 */
function buildStandardMaterialFromMaps(
  tex,
  { skinning = false, nameHint = '' } = {}
) {
  const hasAlpha = !!(tex?.opacity || tex?.alphaMap);

  // mappe
  const map          = loadTex(tex?.diffuse, { srgb: true });
  const normalMap    = loadTex(tex?.normal);
  const metalnessMap = loadTex(tex?.metallic);
  const roughnessMap = loadTex(tex?.roughness);
  const aoMap        = loadTex(tex?.ao);
  const alphaMap     = loadTex(tex?.opacity || tex?.alphaMap);
  const emissiveMap  = loadTex(tex?.emissive); // tipicamente grayscale; tienila Linear

  const metalness = tex?.metalnessValue ?? (metalnessMap ? 1.0 : 0.0);
  const roughness = tex?.roughnessValue ?? (roughnessMap ? 0.7 : 0.45);

  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    metalnessMap,
    roughnessMap,
    aoMap,
    alphaMap,
    metalness,
    roughness,
    emissiveMap,
    emissive: emissiveMap ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
    emissiveIntensity: emissiveMap ? 1.0 : 0.0,
    alphaTest: hasAlpha ? 0.5 : 0.0,
    transparent: !!hasAlpha,
    depthWrite: hasAlpha ? false : true,
  });
  if (skinning) mat.skinning = true;
  mat.name = nameHint || mat.name || 'EntityMat';
  if (normalMap) mat.normalMapType = THREE.TangentSpaceNormalMap;

  return mat;
}

function isSimpleTexRoot(root) {
  if (!root || typeof root !== 'object') return false;
  // riconosci un root "semplice" (un solo set di mappe)
  return (
    'diffuse'   in root || 'normal'   in root ||
    'metallic'  in root || 'roughness' in root ||
    'ao'        in root ||
    'opacity'   in root || 'alphaMap' in root ||
    'emissive'  in root
  );
}

/**
 * Matcha la voce di textures in base al nome materiale/mesh.
 * Supporta chiavi combinate tipo "armor,helmet|shield".
 */
function resolveTexForNames(matName, meshName, root) {
  if (!root) return null;
  if (isSimpleTexRoot(root)) return { matchedKey: '(single)', texConfig: root };

  const m = (matName || '').toLowerCase();
  const n = (meshName || '').toLowerCase();
  const keys = Object.keys(root).sort((a, b) => b.length - a.length); // match più specifici prima
  for (const key of keys) {
    const tokens = key.toLowerCase().split(/[,|]/).map(s => s.trim()).filter(Boolean);
    if (tokens.some(tok => m.includes(tok) || n.includes(tok))) {
      return { matchedKey: key, texConfig: root[key] };
    }
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
      // materiali multipli
      const oldArr = child.material;
      const newArr = oldArr.map((oldMat, i) => {
        const res = resolveTexForNames(oldMat?.name, child.name, rootTex);
        if (res?.texConfig) {
          const mat = buildStandardMaterialFromMaps(res.texConfig, { skinning: isSkinned, nameHint: res.matchedKey });
          if (oldMat?.transparent) {
            mat.transparent = true;
            mat.alphaTest = Math.max(mat.alphaTest, oldMat.alphaTest || 0);
          }
          return mat;
        }
        const fallback = oldMat?.clone ? oldMat.clone() : new THREE.MeshStandardMaterial();
        if (isSkinned) fallback.skinning = true;
        if (!fallback.name) fallback.name = oldMat?.name || `mat#${i}`;
        return fallback;
      });
      if (child.geometry?.groups && child.geometry.groups.length > newArr.length) {
        while (child.geometry.groups.length > newArr.length) newArr.push(newArr[newArr.length - 1]);
      }
      child.material = newArr;
    } else {
      // singolo materiale
      const res = resolveTexForNames(child.material?.name, child.name, rootTex);
      if (res?.texConfig) {
        child.material = buildStandardMaterialFromMaps(res.texConfig, {
          skinning: isSkinned, nameHint: res.matchedKey
        });
      } else if (isSkinned && child.material && !child.material.skinning) {
        child.material = child.material.clone();
        child.material.skinning = true;
      }
    }

    // flag comuni
    if (isSkinned && child.material && !child.material.skinning) child.material.skinning = true;
    if (isSkinned) child.frustumCulled = false;

    // se c'è aoMap ma manca uv2, riusa uv1 (fallback veloce)
    if ((child.isMesh || child.isSkinnedMesh) && child.material?.aoMap && !child.geometry.attributes.uv2) {
      child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
    }

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

  // Prepara una versione materializzata (opzionale) per warm-up
  const cloned = SkeletonUtils.clone(base);
  applyExternalMaterials(cloned, cfg);
  cloneWarmCache.set(key, cloned);

  // Warm-up GPU (facoltativo)
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
  const source = cloneWarmCache.get(key) || baseModelCache.get(key);
  if (!source) throw new Error(`Entity "${key}" non pre-caricata: chiama preloadEntity/preloadAllEntities prima.`);

  const cfg = ENTITY_CONFIG[key];
  const fbx = SkeletonUtils.clone(source);
  fbx.animations = source.animations || fbx.animations;
  if (cfg?.scale) fbx.scale.copy(cfg.scale);

  if (!cloneWarmCache.has(key)) applyExternalMaterials(fbx, cfg);

  fbx.traverse(c => {
    if (c.isMesh || c.isSkinnedMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
      if (c.isSkinnedMesh) c.frustumCulled = false;
      if (c.material?.aoMap && !c.geometry.attributes.uv2) {
        c.geometry.setAttribute('uv2', c.geometry.attributes.uv);
      }
    }
  });

  return fbx;
}

// --------------- Animations (uniform API) ---------------
export function buildMixerAndActions(targetFBX, cfg) {
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
