import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { spawnFire } from '../particles/FireParticleSystem.js';
const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
export const torchs = [];
export const torches = torchs;

function loadTex(path, { srgb = false, repeat = 1 } = {}) {
  if (!path) return null;
  const t = texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePBR({
  basecolor, normal, roughness, metallic,
  metalness = 0.0, roughnessVal = 1.0, envMapIntensity = 1.0,
}) {
  const mat = new THREE.MeshStandardMaterial({
    map: basecolor || null,
    normalMap: normal || null,
    roughnessMap: roughness || null,
    metalnessMap: metallic || null,
    metalness,
    roughness: roughnessVal,
    envMapIntensity,
  });
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  if (mat.normalMap) mat.normalMapType = THREE.TangentSpaceNormalMap;
  return mat;
}

export class Torch {
  constructor(position = new THREE.Vector3(), opts = {}) {
    this.modelPath = opts.modelPath ?? '/models/props/torch.fbx';
    this.scale = opts.scale ?? 1.0;
    this.yoffset = opts.yoffset ?? 0.3; 
    const torchTex = {
      basecolor:  '/textures/torch/torch_basecolor.png',
      normal:     '/textures/torch/torch_normal.png',
      roughness:  '/textures/torch/torch_roughness.png',
      metallic:   '/textures/torch/torch_metallic.png',
    };
    this.torchMat = makePBR({
      basecolor:  loadTex(torchTex.basecolor,  { srgb: true }),
      normal:     loadTex(torchTex.normal),
      roughness:  loadTex(torchTex.roughness),
      metallic:   loadTex(torchTex.metallic),
      roughnessVal: 0.9,
      envMapIntensity: 0.8,
    });

    this.position = position.clone();
    this.model = null;
    this.isLoaded = false;
    this.lit = false;

    this.fireSystem = null;
    this.fireOptions = {
      count: opts.count ?? 260,
      radius: opts.radius ?? 0.22,
      size: opts.size ?? 36.0,
      lifeMin: opts.lifeMin ?? 0.65,
      lifeMax: opts.lifeMax ?? 1.2,
      upMin: opts.upMin ?? 0.8,
      upMax: opts.upMax ?? 1.25,
      side: opts.side ?? 0.12,
      windStrength: opts.windStrength ?? 0.05,
      turbulence: opts.turbulence ?? 0.05,
      lightingStrength: opts.lightingStrength ?? 1.0,
      lightingRange: opts.lightingRange ?? 7.5,
      enableShadows: opts.enableShadows ?? true,
      shadowJitter: 0.0,
      shadowBias: -0.00005,
      shadowNormalBias: 0.006,
      useHemiBounce: false
    };

    this.fireOffset = new THREE.Vector3(0, opts.fireYOffset ?? 1.2, 0);
  }

  async load() {
    const base = await loader.loadAsync(this.modelPath);
    this.model = base.clone(true);
    this.model.scale.setScalar(this.scale);
    this.model.position.copy(this.position);
    this.model.position.y += this.yoffset;
    this.model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = this.torchMat;
    });

    scene.add(this.model);
    this.isLoaded = true;
    return this.model;
  }
  ignite() {
    if (!this.isLoaded || this.fireSystem) return;
    const firePos = this.model.position.clone().add(this.fireOffset);
    this.fireSystem = spawnFire(firePos, this.fireOptions);
    this.lit = true;
  }
  extinguish() {
    if (this.fireSystem) {
      this.fireSystem.dispose();
      this.fireSystem = null;
    }
    this.lit = false;
  }
  setIntensity(k = 1.0) {
    if (this.fireSystem?.setIntensity) this.fireSystem.setIntensity(k);
  }
  setPosition(x, y, z) {
    if (!this.model) return;
    this.model.position.set(x, y + this.yoffset, z);
    if (this.fireSystem?.setPosition) {
      const firePos = this.model.position.clone().add(this.fireOffset);
      this.fireSystem.setPosition(firePos);
    }
  }
  dispose() {
    this.extinguish();
    if (this.model) {
      scene.remove(this.model);
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) child.material.forEach(m => m?.dispose());
          else child.material?.dispose();
        }
      });
      this.model = null;
    }
  }
}
export async function spawntorchAt(x, z, opts = {}) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const torch = new Torch(pos, opts);
  await torch.load();
  if (opts.lit !== false) torch.ignite();

  torchs.push(torch);
  return torch;
}
export function updatetorchs(delta) {
  for (const t of torchs) t.update(delta);
}
export function disposeAlltorchs() {
  while (torchs.length) {
    const t = torchs.pop();
    t.dispose();
  }
}