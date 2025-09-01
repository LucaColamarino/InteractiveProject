import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { interactionManager } from '../systems/interactionManager.js';
import { registerObstacle, unregisterObstacle } from '../systems/ObstacleSystem.js';

const _texCache = new Map();
function _loadTex(url, { srgb = false, repeat = 1 } = {}) {
  if (!url) return null;
  if (_texCache.has(url)) return _texCache.get(url);
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  _texCache.set(url, t);
  return t;
}

const GlowShader = {
  uniforms: {
    uColor:    { value: new THREE.Color(0x66ccff) },
    uStrength: { value: 0.0 },
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
function makeGlowMaterial(color) {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(GlowShader.uniforms),
    vertexShader: GlowShader.vertexShader,
    fragmentShader: GlowShader.fragmentShader,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  mat.uniforms.uColor.value = new THREE.Color(color);
  return mat;
}

function makeRunicPBR(basePath, uvTile = 1) {
  const map   = _loadTex(`${basePath}/diffuse.png`,   { srgb: true });
  const norm  = _loadTex(`${basePath}/normal.png`);
  const ao    = _loadTex(`${basePath}/ao.png`);
  const emis  = _loadTex(`${basePath}/emissive.png`,  { srgb: true });
  const rough = _loadTex(`${basePath}/roughness.png`);
  const metal = _loadTex(`${basePath}/metallic.png`);
  [map, norm, ao, emis, rough, metal].filter(Boolean).forEach(t => t.repeat.set(uvTile, uvTile));

  return new THREE.MeshStandardMaterial({
    map: map || null,
    normalMap: norm || null,
    aoMap: ao || null,
    emissiveMap: emis || null,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.2,
    roughnessMap: rough || null,
    metalnessMap: metal || null,
    roughness: 1.0,
    metalness: 0.0,
  });
}

const _stones = new Set();

export async function spawnRunicStone(opts) {
  const {
    id, x = 0, z = 0,
    modelUrl, texturesPath,
    glowColor = 0x66ccff,
    scale = 0.02, rotationY = 0, uvTile = 1,
    promptText = 'Activate',
    canActivate,
    onActivated,
    syncIsAlreadyActive,
    collider = {},
    shadows = {},
  } = opts;

  const pos = new THREE.Vector3(x, getTerrainHeightAt(x, z), z);
  const loader = new FBXLoader();
  const root = await loader.loadAsync(modelUrl);

  const pbr = makeRunicPBR(texturesPath, uvTile);

  const baseMeshesForGlow = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry;
    if (g && !g.attributes.uv2 && g.attributes.uv) {
      g.setAttribute('uv2', new THREE.BufferAttribute(g.attributes.uv.array, 2));
    }
    o.material = pbr;
    o.castShadow = shadows.cast ?? true;
    o.receiveShadow = shadows.receive ?? true;
    baseMeshesForGlow.push(o);
  });

  const glowMats = [];
  for (const base of baseMeshesForGlow) {
    const glow = makeGlowMaterial(glowColor);
    const shell = new THREE.Mesh(base.geometry, glow);
    shell.name = (base.name || 'glow') + '_shell';
    shell.renderOrder = 999;
    shell.frustumCulled = base.frustumCulled;
    shell.matrixAutoUpdate = false;
    shell.userData.isGlowShell = true;
    base.add(shell);
    shell.scale.setScalar(1.03);
    shell.updateMatrix();
    glowMats.push(glow);
  }

  root.scale.setScalar(scale);
  root.position.copy(pos);
  root.rotation.set(0, THREE.MathUtils.degToRad(rotationY), 0);

  const group = new THREE.Group();
  group.name = `RunicStone_${id}`;
  group.add(root);
  scene.add(group);

  const state = {
    id,
    group, root, glowMats,
    activated: false,
    glow: 0, glowTarget: 0, t: 0,
    colliderHandle: null,
    _registered: null,
  };

  const radius = collider.radius ?? 0.9;
  const halfH  = collider.halfHeight ?? 0.8;
  state.colliderHandle = registerObstacle({
    type: 'cylinder',
    positionRef: root.position,
    radius,
    halfHeight: halfH,
    userData: { kind: `runicStone:${id}`, stone: state },
  });

  state._registered = {
    getWorldPosition: (out = new THREE.Vector3()) => root.getWorldPosition(out),
    canInteract: () => !state.activated,
    getPrompt: () => ({ key: 'E', text: promptText }),
    onInteract: () => {
      if (state.activated) return;
      if (typeof canActivate === 'function' && !canActivate()) return;
      state.activated = true;
      state.glowTarget = 1.0;
      onActivated?.();
    },
  };
  interactionManager.register(state._registered);

  if (syncIsAlreadyActive?.()) {
    state.activated = true;
    state.glowTarget = 1.0;
  }

  _stones.add(state);
  return state;
}

export function updateRunicStones(dt) {
  if (!_stones.size) return;
  for (const s of _stones) {
    s.t += dt;
    const k = 1 - Math.pow(0.0001, dt);
    s.glow = THREE.MathUtils.lerp(s.glow, s.glowTarget, k);
    const pulse = 0.75 + 0.25 * Math.sin(s.t * 3.0);
    const strength = s.glow * (1.2 * pulse);
    for (const gm of s.glowMats) gm.uniforms.uStrength.value = strength;
  }
}

export function disposeRunicStone(state) {
  if (!state) return;
  if (state._registered) interactionManager.unregister?.(state._registered);
  if (state.colliderHandle) unregisterObstacle(state.colliderHandle);
  scene.remove(state.group);
  state.group.traverse(o => {
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
  for (const gm of state.glowMats) gm.dispose?.();
  _stones.delete(state);
}
