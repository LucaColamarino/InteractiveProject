// campfire.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
export const campfires = [];
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

export class Campfire {
  /**
   * @param {THREE.Vector3} position
   */
  constructor(
    position = new THREE.Vector3(0, 0, 0)
  ) {
    this.position = position.clone();

    this.modelPath = '/models/props/campfire.fbx';
    this.scale =  0.01;
    this.materialIndices = { campfire: 1, rock: 0 };

    // PATH texture di default: rinominali se i tuoi file hanno nomi diversi
    const camp = {
      basecolor:  '/textures/campfire/campfire_basecolor.png',
      normal:     '/textures/campfire/campfire_normal.png',
      roughness:  '/textures/campfire/campfire_roughness.png',
      metallic:   '/textures/campfire/campfire_metallic.png',
    };
    const rock = 
    
{
      basecolor:  '/textures/campfire/rock_diffuse.png',
      normal:     '/textures/campfire/rock_normal.png',
      roughness:  '/textures/campfire/rock_roughness.png',
    };

    // Precarico i set PBR
    this.campfireMat = makePBR({
      basecolor:  loadTex(camp.basecolor,  { srgb: true }),
      normal:     loadTex(camp.normal),
      roughness:  loadTex(camp.roughness),
      metallic:   loadTex(camp.metallic),
      metalness:  camp.metallic ? 1.0 : 0.0,   // se c'è la mappa, abilita metalness
      roughnessVal: 1.0,
    });

    this.rockMat = makePBR({
      basecolor:  loadTex(rock.basecolor, { srgb: true }),
      normal:     loadTex(rock.normal),
      roughness:  loadTex(rock.roughness),
      metalness:  0.0,                       // rocce -> dielettrico
      roughnessVal: 1.0,
    });

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.isLoaded = false;
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

      // se multi-materiale -> array
      if (Array.isArray(child.material)) {
        const { campfire, rock } = this.materialIndices;

        // copia array per evitare side effects su materiali condivisi
        const mats = child.material.slice();

        if (mats[campfire]) mats[campfire] = this.campfireMat.clone();
        if (mats[rock])     mats[rock]     = this.rockMat.clone();

        child.material = mats;

      } else {
        // single material: fallback → applico il campfire PBR
        child.material = this.campfireMat.clone();
      }
    });

    // eventuali animazioni (se presenti nel FBX)
    if (base.animations && base.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model);
      const clip = base.animations[0];
      const action = this.mixer.clipAction(clip);
      action.play();
      this.actions.fire = action;
    }

    this.isLoaded = true;
    return this.model;
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }
}
export async function spawnCampfireAt(x, z) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const cf = new Campfire(pos);
  await cf.load();
  scene.add(cf.model);
  campfires.push(cf);
  return cf;
}


// Call da gameloop
export function updateCampfires(delta) {
  for (const cf of campfires) cf.update(delta);
}
