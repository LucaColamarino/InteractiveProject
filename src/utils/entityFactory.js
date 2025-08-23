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
  // maps di colore (albedo/diffuse) in sRGB, PBR maps (metalness/roughness/normal) in Linear
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

// euristiche per classificare il tipo di superficie a partire da nome materiale/mesh
function classifySurface(matName = '', meshName = '') {
  const m = matName.toLowerCase();
  const n = meshName.toLowerCase();
  const s = `${m} ${n}`;
  if (/\b(armor|armour|helmet|helm|shield|sword|axe|mace|dagger|metal|plate|mail|gauntlet)\b/.test(s)) return 'metal';
  if (/\b(skin|body|face|hand|head|arm|leg)\b/.test(s)) return 'skin';
  if (/\b(cloth|fabric|shirt|pants|robe|cape|leather)\b/.test(s)) return 'cloth';
  return 'generic';
}

/**
 * Costruisce un MeshStandardMaterial a partire da un set di mappe "diffuse/normal/alpha/specular".
 * - Non usiamo più 'skinning' nel costruttore: lo settiamo dopo (fix warning).
 * - Se presente 'specular', la usiamo come metalnessMap (euristica), con default diversi per metal/cloth/skin.
 */
function buildStandardMaterialFromMaps(tex, { skinning = false, nameHint = '', matName = '', meshName = '' } = {}) {
  const hasAlpha = !!tex?.alphaMap;

  // base maps
  const map         = loadTex(tex?.diffuse, { srgb: true });
  const normalMap   = loadTex(tex?.normal);                 // Linear
  const alphaMap    = loadTex(tex?.alphaMap);               // Linear
  const specularTex = loadTex(tex?.specular);               // trattata come metalnessMap euristica (Linear)

  // euristica per defaults
  const surface = classifySurface(matName, meshName);
  let metalness = 0.0;
  let roughness = 0.7;

  if (surface === 'metal') { metalness = 0.6; roughness = 0.35; }
  else if (surface === 'cloth') { metalness = 0.0; roughness = 0.8; }
  else if (surface === 'skin')  { metalness = 0.0; roughness = 0.55; }
  // 'generic' lascia i default

  // se abbiamo una "specular" dipinta nell'asset, riusiamola come metalnessMap (approssimazione)
  const metalnessMap = specularTex || null;
  if (metalnessMap) {
    // abbassa un po’ il metalness base: la mappa farà il grosso del lavoro
    if (surface === 'metal') metalness = Math.max(0.35, metalness * 0.8);
    else metalness = Math.max(0.05, metalness * 0.5);
  }

  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    alphaMap,
    metalness,
    roughness,
    metalnessMap,
    alphaTest: hasAlpha ? 0.5 : 0.0,
    transparent: hasAlpha,
    depthWrite: hasAlpha ? false : true,
  });
  if (skinning) mat.skinning = true; // <-- impostato DOPO (fix warning)
  mat.name = nameHint || mat.name || 'EntityMat';

  // piccolo accent per metallo (opzionale)
  if (surface === 'metal') {
    mat.envMapIntensity = 1.0;
  }
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

    // multilayer materials
    if (Array.isArray(child.material)) {
      const oldArr = child.material;
      const newArr = oldArr.map((oldMat, i) => {
        const res = resolveTexForNames(oldMat?.name, child.name, rootTex);
        if (res?.texConfig) {
          const mat = buildStandardMaterialFromMaps(
            res.texConfig,
            { skinning: isSkinned, nameHint: res.matchedKey, matName: oldMat?.name, meshName: child.name }
          );
          if (oldMat?.transparent) {
            mat.transparent = true;
            mat.alphaTest = Math.max(mat.alphaTest, oldMat.alphaTest || 0);
          }
          return mat;
        }
        // fallback: riusa o clona mantenendo skinning se serve
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
        child.material = buildStandardMaterialFromMaps(
          res.texConfig,
          { skinning: isSkinned, nameHint: res.matchedKey, matName: child.material?.name, meshName: child.name }
        );
      } else if (isSkinned && child.material && !child.material.skinning) {
        // imposta skinning senza warning (clona solo se necessario)
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
