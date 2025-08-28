// archersStone.js — emissive always ON + interactionManager + GLOW rosso (semplice)
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { interactionManager } from '../systems/interactionManager.js';
import { archerObjective, gameManager } from '../managers/gameManager.js';
import { hudManager } from '../ui/hudManager.js';
import { createBridge } from './bridge.js';

// --- Cache semplice per le texture ---
const _texCache = new Map();
const objective = archerObjective;
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

/** Materiale runico: emissive sempre ON */
function makeRunicMaterial(basePath, uvTile = 1) {
  const tl = new THREE.TextureLoader();

  const map         = loadColorTex(tl,   `${basePath}/rune1_diffuse.png`);
  const normalMap   = loadLinearTex(tl,  `${basePath}/rune1_normal.png`);
  const aoMap       = loadLinearTex(tl,  `${basePath}/rune1_ao.png`);
  const emissiveMap = loadColorTex(tl,   `${basePath}/rune1_emissive.png`);
  const roughnessMap= loadLinearTex(tl,  `${basePath}/rune1_roughness.png`);
  const metalnessMap= loadLinearTex(tl,  `${basePath}/rune1_metallic.png`);

  [map, normalMap, aoMap, emissiveMap, roughnessMap, metalnessMap]
    .filter(Boolean).forEach(t => t.repeat.set(uvTile, uvTile));

  return {
    rock: new THREE.MeshStandardMaterial({
      name: 'runicRock',
      map, normalMap, aoMap, emissiveMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.2,     // <— SEMPRE ATTIVO
      roughnessMap, metalnessMap,
      roughness: 1.0, metalness: 0.0,
    })
  };
}

// ===== Glow shader (Fresnel shell) — ROSSO =====
const GlowShader = {
  uniforms: {
    uColor:    { value: new THREE.Color(0xff4444) }, // rosso
    uStrength: { value: 0.0 },  // animato in update
    uOpacity:  { value: 1.0 },
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
export let archersStone = null;
let _stoneMeshes = [];
let _glowMats = [];
let _registered = null;
let _time = 0;
const _state = { activated: false, glow: 0.0, glowTarget: 0.0 };

// ===== Spawn + interaction (forma semplice) =====
export async function spawnarchersStone({
  x = 0,
  z = 0,
  scale = 0.2,
  rotationY = 180,   // gradi
  uvTile = 1,
  castShadow = true,
  receiveShadow = true,
} = {}) {
  const position = new THREE.Vector3(x, getTerrainHeightAt(x, z), z);
  const loader = new FBXLoader();
  const root = await loader.loadAsync('/models/props/runicStone.fbx');
  const mats = makeRunicMaterial('/textures/runicStone', uvTile);

  _stoneMeshes = []; _glowMats = [];

  // Raccogli i mesh base
  const baseMeshesForGlow = [];
  root.traverse((o) => {
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

  // Crea gli shell Glow rossi (fuori dalla traverse!)
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
    glowMesh.scale.setScalar(1.03); // shell leggermente più grande
    glowMesh.updateMatrix();

    _glowMats.push(glowMat);
  }

  // Trasformazioni
  root.scale.setScalar(scale);
  root.position.copy(position);
  root.rotation.set(0, THREE.MathUtils.degToRad(rotationY), 0);

  // Group
  const group = new THREE.Group();
  group.name = 'archersStoneRoot';
  group.add(root);
  scene.add(group);
  archersStone = group;

  // Interaction (come da forma minimal) — usa WORLD POSITION
  _registered = {
    getWorldPosition: (out = new THREE.Vector3()) => root.getWorldPosition(out),
    canInteract: () => !_state.activated,
    getPrompt: () => ({ key: 'E', text: 'Activate archers stone' }),
    onInteract: () => {
      let left = objective -gameManager.archersKilled;
      if(left>0){hudManager.showNotification("You need to kill "+left+" more archers.");return;}
     _state.activated = true;
    _state.glowTarget = 1.0;
    gameManager.activatedStones+=1;
    if(gameManager.activatedStones>=2){
      hudManager.showNotification("Bridge activated.");
      createBridge({
          modelUrl: '/models/props/Bridge.fbx',
          texturesPath: '/textures/bridge',
          scale: 0.004,
          position: new THREE.Vector3(-135,getTerrainHeightAt(-135,115),115),
          rotationY: 10,
          uvTile: 2,  // aumenta/riduci tiling
        });}
        else{hudManager.showNotification("One stone left.");}
             },
  };
  interactionManager.register(_registered);

  return group;
}

// ===== Update (solo glow pulse) =====
export function updatearchersStone(dt) {
  if (!archersStone) return;
  _time += dt;
  const k = 1 - Math.pow(0.0001, dt);
  _state.glow = THREE.MathUtils.lerp(_state.glow, _state.glowTarget, k);
  const pulse = 0.75 + 0.25 * Math.sin(_time * 3.0);
  const strength = _state.glow * (1.2 * pulse); // intensità max ~1.2
  for (const mat of _glowMats) mat.uniforms.uStrength.value = strength;
}

// ===== Opzionali =====
export function activatearchersStone(on = true) {
  _state.activated = !!on;
  _state.glowTarget = on ? 1.0 : 0.0;
}
export function disposearchersStone() {
  if (!archersStone) return;
  if (_registered) interactionManager.unregister?.(_registered);
  scene.remove(archersStone);

  archersStone.traverse(o => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      const m = o.material;
      m?.map?.dispose?.();
      m?.normalMap?.dispose?.();
      m?.aoMap?.dispose?.();
      m?.emissiveMap?.dispose?.();
      m?.roughnessMap?.dispose?.();
      m?.metalnessMap?.dispose?.();
      m?.dispose?.();
    }
  });
  for (const gm of _glowMats) gm.dispose?.();

  archersStone = null;
  _stoneMeshes = [];
  _glowMats = [];
  _registered = null;
  _time = 0;
}
