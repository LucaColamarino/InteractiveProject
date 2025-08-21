// src/props/torch.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { spawnFire } from '../particles/FireParticleSystem.js';

const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

// Mantengo "torchs" per retro-compatibilità, ma esporto anche "torches".
export const torchs = [];
export const torches = torchs;

// ---------------------
// Utility texture / PBR
// ---------------------
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

// -------------
// Torch class
// -------------
export class Torch {
  /**
   * @param {THREE.Vector3} position base (x,z usati; y calcolato fuori)
   * @param {object} opts opzioni torch e fuoco
   */
  constructor(position = new THREE.Vector3(), opts = {}) {
    // Torch props
    this.modelPath = opts.modelPath ?? '/models/props/torch.fbx';
    this.scale = opts.scale ?? 1.0;
    this.yoffset = opts.yoffset ?? 0.3; // alza leggermente la torcia dal terreno

    // Materiale PBR
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

    // Stato
    this.position = position.clone();
    this.model = null;
    this.isLoaded = false;
    this.lit = false;

    // Fire handle
    this.fireSystem = null;

    // Opzioni fuoco pensate per torcia
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
      enableShadows: opts.enableShadows ?? true, // il budget deciderà chi tiene l’ombra
      shadowJitter: 0.0,             // niente “slittamento” ombra
      shadowBias: -0.00005,
      shadowNormalBias: 0.006,
      useHemiBounce: false
    };

    // Dove nasce la fiamma rispetto al modello della torcia
    this.fireOffset = new THREE.Vector3(0, opts.fireYOffset ?? 1.2, 0);
  }

  async load() {
    const base = await loader.loadAsync(this.modelPath);

    // FBXLoader ritorna un Group; cloniamo “profondo” per sicurezza
    this.model = base.clone(true);
    this.model.scale.setScalar(this.scale);
    this.model.position.copy(this.position);
    this.model.position.y += this.yoffset;

    // Applica materiale e ombre
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

  // Accende la torcia (crea il sistema particelle + rig luci già integrato)
  ignite() {
    if (!this.isLoaded || this.fireSystem) return;
    const firePos = this.model.position.clone().add(this.fireOffset);
    this.fireSystem = spawnFire(firePos, this.fireOptions);
    this.lit = true;
  }

  // Spegne la torcia (dispose del sistema fuoco)
  extinguish() {
    if (this.fireSystem) {
      this.fireSystem.dispose(); // rimuove particelle + luci
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

  update(_delta) {
    // niente animazioni: il fuoco è aggiornato dal tuo updateFires(dt) globale
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

// -----------------------------------------
// Helper: spawn / update / dispose in batch
// -----------------------------------------
export async function spawntorchAt(x, z, opts = {}) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const torch = new Torch(pos, opts);
  await torch.load();

  // di default accendi
  if (opts.lit !== false) torch.ignite();

  torchs.push(torch);
  return torch;
}

// Call da game loop
export function updatetorchs(delta) {
  for (const t of torchs) t.update(delta);
}

// Cleanup
export function disposeAlltorchs() {
  while (torchs.length) {
    const t = torchs.pop();
    t.dispose();
  }
}
