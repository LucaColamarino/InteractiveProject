// chest.js
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

// util: carica texture con settaggi raccomandati
function loadTex(path, { srgb = false, repeat = 1 } = {}) {
  if (!path) return null;
  const t = texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// crea un MeshStandardMaterial PBR da un set di mappe
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

export class Chest {
  /**
   * @param {THREE.Vector3} position
   */
  constructor(
    position = new THREE.Vector3(0, 0, 0)
  ) {
    this.yoffset=0.3;
    position.y+=this.yoffset;
    this.position = position.clone();
    this.modelPath = '/models/props/chest.fbx';
    this.scale = 0.01;
    

    const camp = {
      basecolor:  '/textures/chest/chest_basecolor.png',
      normal:     '/textures/chest/chest_normal.png',
      roughness:  '/textures/chest/chest_roughness.png',
      specular:   '/textures/chest/chest_specular.png',
    };
    this.chestMat = makePBR({
      basecolor:  loadTex(camp.basecolor,  { srgb: true }),
      normal:     loadTex(camp.normal),
      roughness:  loadTex(camp.roughness),
      specular:   loadTex(camp.specular), 
      roughnessVal: 1.0,
    });
    this.isOpen = false; 
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.isLoaded = false;
    this._tmpPos = new THREE.Vector3();
  }

  async load() {
    // carico e clono per sicurezza
    const base = await loader.loadAsync(this.modelPath);
    const fbx = SkeletonUtils.clone(base);

    this.model = fbx;
    this.model.scale.setScalar(this.scale);
    this.model.position.copy(this.position);

    // assegna materiali per indice se possibile
    this.model.traverse((child) => {
      if (!child.isMesh) return;

      child.castShadow = true;
      child.receiveShadow = true;
      child.material = this.chestMat.clone();
      
    });
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
    if (this.isOpen) return;            // 🔒 già aperto → ignora
    this.isOpen = true;                 // segna subito come aperto
    if (this.actions.open) {
      this.actions.open.reset().play(); // avvia animazione
    }
  }


  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }

  dispose() {
    if (this.fireSystem) {
      this.fireSystem.dispose();
    }
    if (this.smokeSystem) {
      this.smokeSystem.dispose();
    }
    if (this.light) {
      scene.remove(this.light);
    }
    if (this.ambientLight) {
      scene.remove(this.ambientLight);
    }
    if (this.model) {
      scene.remove(this.model);
      // Dispose geometry e materials
      this.model.traverse((child) => {
        if (child.isMesh) {
          if (child.geometry) child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat?.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
    }
  }
}

export async function spawnChestAt(x, z) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const cf = new Chest(pos);
  await cf.load();
  scene.add(cf.model);
  chests.push(cf);
  // === INTERACTION: registra falò ===
interactionManager.register({
  getWorldPosition: (out = new THREE.Vector3()) => {
    const p = cf.model?.position ?? cf.position;
    if (!p) return null;
    return out.copy(p);
  },
  canInteract: () => !cf.isOpen,  // ✅ solo se non è stato aperto
  getPrompt: () => ({ key: 'E', text: 'Open Chest.' }),
  onInteract: (player) => {
    if (!player || cf.isOpen) return; // doppia sicurezza
    cf.open();
    hudManager.showNotification?.('Chest Opened.');
  }
});


   return cf;
}

// Call da gameloop
export function updateChests(delta) {
  for (const cf of chests) cf.update(delta);
}

// Cleanup quando necessario
export function disposeAllChests() {
  while (chests.length) {
    const cf = chests.pop();
    cf.dispose();
  }
}

// vicino agli export esistenti
export function getNearestChest(pos, radius = 2.0) {
  let best = null, bestD2 = radius * radius;
  for (const cf of chests) {
    const d2 = cf.position.distanceToSquared(pos);
    if (d2 <= bestD2) { best = cf; bestD2 = d2; }
  }
  return best;
}
