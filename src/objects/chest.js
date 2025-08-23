// src/objects/chest.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js';

const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
export const chests = [];

/** Carica una texture con settaggi consigliati */
function loadTex(path, { srgb = false, repeat = 1 } = {}) {
  if (!path) return null;
  const t = texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  // sRGB solo per albedo/basecolor; PBR maps restano linear
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  return t;
}

/** Crea un MeshStandardMaterial PBR dalle mappe disponibili */
function makePBR({
  basecolor, normal, roughness, metallic,
  metalness = 0.0, roughnessVal = 1.0, envMapIntensity = 1.0,
}) {
  const mat = new THREE.MeshStandardMaterial({
    map: basecolor || null,
    normalMap: normal || null,
    roughnessMap: roughness || null,
    metalnessMap: metallic || null, // <- usa la "specular" come metalnessMap (fallback PBR)
    metalness,
    roughness: roughnessVal,
    envMapIntensity,
  });
  if (mat.normalMap) mat.normalMapType = THREE.TangentSpaceNormalMap;
  return mat;
}

export class Chest {
  /** @param {THREE.Vector3} position */
  constructor(position = new THREE.Vector3(0, 0, 0)) {
    this.yoffset = 0.3;
    position.y += this.yoffset;
    this.position = position.clone();

    this.modelPath = '/models/props/chest.fbx';
    this.scale = 0.01;

    // set di mappe
    const camp = {
      basecolor: '/textures/chest/chest_basecolor.png',
      normal:    '/textures/chest/chest_normal.png',
      roughness: '/textures/chest/chest_roughness.png',
      specular:  '/textures/chest/chest_specular.png', // verrà usata come metalnessMap
    };

    this.chestMat = makePBR({
      basecolor:  loadTex(camp.basecolor,  { srgb: true }),
      normal:     loadTex(camp.normal),
      roughness:  loadTex(camp.roughness),
      metallic:   loadTex(camp.specular), // <- FIX: era "specular:", ora "metallic:"
      metalness:  0.15,                   // base metalness (il map farà il resto)
      roughnessVal: 0.9,
      envMapIntensity: 1.0,
    });

    this.isOpen = false;
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.isLoaded = false;
    this._tmpPos = new THREE.Vector3();
  }

  async load() {
    const base = await loader.loadAsync(this.modelPath);
    const fbx = SkeletonUtils.clone(base);

    this.model = fbx;
    this.model.scale.setScalar(this.scale);
    this.model.position.copy(this.position);

    // Applica PBR a tutte le mesh del forziere
    this.model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = this.chestMat; // stesso materiale (niente clone per istanza singola)
    });

    // Anima apertura se il file ha una clip
    if (base.animations && base.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model);
      const clip = base.animations[0];
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.open = action;
    }

    this.isLoaded = true;
    return this.model;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    if (this.actions.open) {
      this.actions.open.reset().play();
    }
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }

  dispose() {
    if (this.model) {
      scene.remove(this.model);
      this.model.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          // il materiale è condiviso: non dispose qui, lascialo vivere o gestisci un pool
        }
      });
      this.model = null;
    }
  }
}

export async function spawnChestAt(x, z) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const chest = new Chest(pos);
  await chest.load();
  scene.add(chest.model);
  chests.push(chest);

  // ==== Interaction ====
  interactionManager.register({
    getWorldPosition: (out = new THREE.Vector3()) => {
      const p = chest.model?.position ?? chest.position;
      return out.copy(p);
    },
    canInteract: () => !chest.isOpen,
    getPrompt: () => ({ key: 'E', text: 'Open Chest' }),
    onInteract: () => {
      if (chest.isOpen) return;
      chest.open();
      hudManager.showNotification?.('Chest Opened.');
    }
  });

  return chest;
}

export function updateChests(delta) {
  for (const c of chests) c.update(delta);
}

export function disposeAllChests() {
  while (chests.length) {
    const c = chests.pop();
    c.dispose();
  }
}

export function getNearestChest(pos, radius = 2.0) {
  let best = null, bestD2 = radius * radius;
  for (const c of chests) {
    const d2 = c.position.distanceToSquared(pos);
    if (d2 <= bestD2) { best = c; bestD2 = d2; }
  }
  return best;
}
