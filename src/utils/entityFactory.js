import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadAnimations, fixAnimationLoop } from './AnimationLoader.js';
import { ENTITY_CONFIG } from './entities.js';
import { scene, camera, renderer } from '../scene.js';

const fbxLoader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();
const baseModelCache = new Map();
const cloneWarmCache = new Map();
function loadTex(path, { srgb = false, repeat = 1 } = {}) {
  if (!path) return null;
  const t = textureLoader.load(path);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
function buildStandardMaterialFromMaps(tex, { skinning = false, nameHint = '' } = {}) {
  const hasAlpha = !!(tex?.opacity || tex?.alphaMap);
  const map          = loadTex(tex?.diffuse, { srgb: true });
  const normalMap    = loadTex(tex?.normal);
  const metalnessMap = loadTex(tex?.metallic);
  const roughnessMap = loadTex(tex?.roughness);
  const aoMap        = loadTex(tex?.ao);
  const alphaMap     = loadTex(tex?.opacity || tex?.alphaMap);
  const emissiveMap  = loadTex(tex?.emissive);
  const metalness = tex?.metalnessValue ?? (metalnessMap ? 1.0 : 0.0);
  const roughness = tex?.roughnessValue ?? (roughnessMap ? 0.7 : 0.65);
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
  return (
    'diffuse' in root || 'normal' in root ||
    'metallic' in root || 'roughness' in root ||
    'ao' in root || 'opacity' in root || 'alphaMap' in root || 'emissive' in root
  );
}
function resolveTexForNames(matName, meshName, root) {
  if (!root) return null;
  if (isSimpleTexRoot(root)) return { matchedKey: '(single)', texConfig: root };
  const m = (matName || '').toLowerCase();
  const n = (meshName || '').toLowerCase();
  const keys = Object.keys(root).sort((a, b) => b.length - a.length);
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

    if (isSkinned && child.material && !child.material.skinning) child.material.skinning = true;
    if (isSkinned) child.frustumCulled = false;

    if ((child.isMesh || child.isSkinnedMesh) && child.material?.aoMap && !child.geometry.attributes.uv2) {
      child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
    }

    child.castShadow = true;
    child.receiveShadow = true;
  });
}
export function findChildByNameCI(root, search) {
  const s = (search || '').toLowerCase();
  let found = null;
  root.traverse(c => {
    if (found) return;
    const n = (c.name || '').toLowerCase();
    if (n.includes(s)) found = c;
  });
  return found;
}
export async function preloadEntity(key) {
  if (baseModelCache.has(key)) return baseModelCache.get(key);
  const cfg = ENTITY_CONFIG[key];
  if (!cfg) throw new Error(`ENTITY_CONFIG mancante per "${key}"`);
  const base = await fbxLoader.loadAsync(cfg.modelPath);
  baseModelCache.set(key, base);
  const cloned = SkeletonUtils.clone(base);
  applyExternalMaterials(cloned, cfg);
  cloneWarmCache.set(key, cloned);
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
  // --- Attachments specifici per tipo ---
  fbx.userData.attachments = fbx.userData.attachments || {};
  if (key === 'archer') {
    // prova a rilevare la mesh "arrow" (mesh o skinnedMesh)
    const arrowMesh = findChildByNameCI(fbx, 'arrow');
    if (arrowMesh && (arrowMesh.isMesh || arrowMesh.isSkinnedMesh)) {
      if (arrowMesh.material) {
        const m = arrowMesh.material;
        m.transparent = true;
        m.alphaTest = Math.max(m.alphaTest ?? 0.0, 0.5);
        m.depthWrite = false;
        arrowMesh.renderOrder = 2;
        if (m.aoMap && !arrowMesh.geometry.attributes.uv2) {
          arrowMesh.geometry.setAttribute('uv2', arrowMesh.geometry.attributes.uv);
        }
      }
      arrowMesh.visible = true;
      fbx.userData.attachments.arrow = arrowMesh;
    }
  }
  return fbx;
}
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
    return loadAnimations(targetFBX, cfg.animations);
  }
  return { mixer: null, actions: {} };
}