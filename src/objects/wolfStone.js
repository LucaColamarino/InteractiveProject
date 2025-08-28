
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { interactionManager } from '../systems/interactionManager.js';

// ===== Texture cache =====
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

// ===== Materiale runico (emissive sempre ON) =====
function makeRunicMaterial(basePath, uvTile = 1) {
  const tl = new THREE.TextureLoader();

  const map          = loadColorTex(tl,   `${basePath}/diffuse.png`);
  const normalMap    = loadLinearTex(tl,  `${basePath}/normal.png`);
  const aoMap        = loadLinearTex(tl,  `${basePath}/ao.png`);
  const emissiveMap  = loadColorTex(tl,   `${basePath}/emissive.png`);
  const roughnessMap = loadLinearTex(tl,  `${basePath}/roughness.png`);
  const metalnessMap = loadLinearTex(tl,  `${basePath}/metallic.png`);

  [map, normalMap, aoMap, emissiveMap, roughnessMap, metalnessMap]
    .filter(Boolean).forEach(t => t.repeat.set(uvTile, uvTile));

  return {
    rock: new THREE.MeshStandardMaterial({
      name: 'runicRock',
      map, normalMap, aoMap, emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.2, // <— SEMPRE ATTIVO
      roughnessMap, metalnessMap,
      roughness: 1.0, metalness: 0.0,
    })
  };
}

// ===== Glow shader (Fresnel shell) =====
const GlowShader = {
  uniforms: {
    uColor:     { value: new THREE.Color(0x66ccff) },
    uStrength:  { value: 0.0 }, // animato da update
    uOpacity:   { value: 1.0 },
  },
  vertexShader: `
    varying float vI;
    void main() {
      vec3 N = normalize(normalMatrix * normal);
      vec3 V = normalize((modelViewMatrix * vec4(position,1.0)).xyz);
      float f = 1.0 - max(dot(N, -V), 0.0);
      vI = pow(f, 2.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3  uColor;
    uniform float uStrength;
    uniform float uOpacity;
    varying float vI;
    void main() {
      float glow = vI * uStrength;
      gl_FragColor = vec4(uColor, glow * uOpacity);
    }
  `,
};
function makeGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(GlowShader.uniforms),
    vertexShader: GlowShader.vertexShader,
    fragmentShader: GlowShader.fragmentShader,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
}

// ===== Stato / refs (solo glow) =====
export let wolvesStone = null;
let _stoneMeshes = [];
let _glowMats = [];
let _registered = null;
let _time = 0;
const _state = { activated: false, glow: 0.0, glowTarget: 0.0 };

// ===== Spawn + register (forma richiesta, anti-recursion) =====
export async function spawnWolfStone({
  x = 0, z = 0, scale = 0.02, rotationY = 280, uvTile = 1,
  castShadow = true, receiveShadow = true,
} = {}) {
  const position = new THREE.Vector3(x, getTerrainHeightAt(x, z), z);
  const loader = new FBXLoader();
  const root = await loader.loadAsync('/models/props/fantasyStone.fbx');
  const mats = makeRunicMaterial('/textures/fantasyStone', uvTile);

  _stoneMeshes = []; _glowMats = [];

  const baseMeshesForGlow = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.isGlowShell) return;
    const g = o.geometry;
    if (g && !g.attributes.uv2 && g.attributes.uv) {
      g.setAttribute('uv2', new THREE.BufferAttribute(g.attributes.uv.array, 2));
    }
    o.material = mats.rock;
    o.castShadow = castShadow;
    o.receiveShadow = receiveShadow;
    _stoneMeshes.push(o);
    baseMeshesForGlow.push(o);
  });

  // Shell glow (creato fuori dalla traverse)
  for (const base of baseMeshesForGlow) {
    if (base.userData.__hasGlowShell) continue;
    const glowMat = makeGlowMaterial();
    const glowMesh = new THREE.Mesh(base.geometry, glowMat);
    glowMesh.name = (base.name || 'glow') + '_shell';
    glowMesh.renderOrder = 999;
    glowMesh.frustumCulled = base.frustumCulled;
    glowMesh.matrixAutoUpdate = false;
    glowMesh.userData.isGlowShell = true;
    base.userData.__hasGlowShell = true;

    base.add(glowMesh);
    glowMesh.scale.setScalar(1.03);
    glowMesh.updateMatrix();

    _glowMats.push(glowMat);
  }

  // trasformazioni
  root.scale.setScalar(scale);
  root.position.copy(position);
  root.rotation.set(0, THREE.MathUtils.degToRad(rotationY), 0);

  const group = new THREE.Group();
  group.name = 'RunicStoneRoot';
  group.add(root);
  scene.add(group);
  wolvesStone = group;

  // Interaction (come da tua forma) — world position fix
  _registered = {
    getWorldPosition: (out = new THREE.Vector3()) => root.getWorldPosition(out),
    canInteract: () => !_state.activated,
    getPrompt: () => ({ key: 'E', text: _state.activated ? 'Attivata' : 'Attiva la pietra' }),
    onInteract: () => { _state.activated = true; _state.glowTarget = 1.0; },
  };
  interactionManager.register(_registered);

  return group;
}

// ===== Update (solo glow pulse) =====
export function updateWolfStone(dt) {
  if (!wolvesStone) return;
  _time += dt;
  const k = 1 - Math.pow(0.0001, dt);
  _state.glow = THREE.MathUtils.lerp(_state.glow, _state.glowTarget, k);
  const pulse = 0.75 + 0.25 * Math.sin(_time * 3.0);
  const strength = _state.glow * (1.2 * pulse);
  for (const mat of _glowMats) mat.uniforms.uStrength.value = strength;
}

// ===== Opzionali =====
export function activateStone(on = true) {
  _state.activated = !!on;
  _state.glowTarget = on ? 1.0 : 0.0;
}
export function disposeWolfStone() {
  if (!wolvesStone) return;
  if (_registered) interactionManager.unregister?.(_registered);
  scene.remove(wolvesStone);
  wolvesStone.traverse(o => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      o.material?.map?.dispose?.();
      o.material?.normalMap?.dispose?.();
      o.material?.aoMap?.dispose?.();
      o.material?.emissiveMap?.dispose?.();
      o.material?.roughnessMap?.dispose?.();
      o.material?.metalnessMap?.dispose?.();
      o.material?.dispose?.();
    }
  });
  for (const gm of _glowMats) gm.dispose?.();
  wolvesStone = null; _stoneMeshes = []; _glowMats = []; _registered = null; _time = 0;
}
