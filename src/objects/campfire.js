// src/props/campfire.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { spawnFire } from '../particles/FireParticleSystem.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js';

const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();

export const campfires = [];

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

// ---------------
// Campfire class
// ---------------
export class Campfire {
  /**
   * @param {THREE.Vector3} position world position (y già calcolata esternamente)
   * @param {object} opts opzioni per materiali e fuoco
   */
  constructor(position = new THREE.Vector3(), opts = {}) {
    this.yoffset = opts.yOffset ?? 0.05;
    this.position = position.clone().add(new THREE.Vector3(0, this.yoffset ?? 0, 0)); // yOffset per allineare al terreno
    this.modelPath = opts.modelPath ?? '/models/props/campfire1.fbx';
    this.scale = opts.scale ?? 0.01;
     // per allineare al terreno

    // se il tuo FBX ha più materiali su singoli mesh, puoi usare indici
    this.materialIndices = opts.materialIndices ?? { campfire: 0, rock: 1 };

    // Texture (rinomina se i file hanno nomi diversi)
    const camp = {
      basecolor:  '/textures/campfire/campfire_basecolor.png',
      normal:     '/textures/campfire/campfire_normal.png',
      roughness:  '/textures/campfire/campfire_roughness.png',
      metallic:   '/textures/campfire/campfire_metallic.png',
    };
    const rock = {
      basecolor:  '/textures/campfire/rock_diffuse.png',
      normal:     '/textures/campfire/rock_normal.png',
      roughness:  '/textures/campfire/rock_roughness.png',
    };

    this.campfireMat = makePBR({
      basecolor:  loadTex(camp.basecolor,  { srgb: true }),
      normal:     loadTex(camp.normal),
      roughness:  loadTex(camp.roughness),
      metallic:   loadTex(camp.metallic),
      metalness:  camp.metallic ? 1.0 : 0.0,
      roughnessVal: 1.0,
      envMapIntensity: 0.9,
    });

    this.rockMat = makePBR({
      basecolor:  loadTex(rock.basecolor, { srgb: true }),
      normal:     loadTex(rock.normal),
      roughness:  loadTex(rock.roughness),
      metalness:  0.0,
      roughnessVal: 1.0,
      envMapIntensity: 0.7,
    });

    this.model = null;
    this.isLoaded = false;

    // Handle del sistema fuoco (creato con spawnFire)
    this.fireSystem = null;

    // Opzioni fuoco pensate per un falò (più esteso della torcia)
    this.fireOptions = {
      count: opts.count ?? 360,
      radius: opts.radius ?? 0.34,
      size: opts.size ?? 42.0,
      lifeMin: opts.lifeMin ?? 0.75,
      lifeMax: opts.lifeMax ?? 1.45,
      upMin: opts.upMin ?? 0.85,
      upMax: opts.upMax ?? 1.35,
      side: opts.side ?? 0.16,
      windStrength: opts.windStrength ?? 0.07,
      turbulence: opts.turbulence ?? 0.06,
      // luci integrate del FireParticleSystem
      lightingStrength: opts.lightingStrength ?? 1.2, // più “glow” in area
      lightingRange: opts.lightingRange ?? 10.0,
      enableShadows: opts.enableShadows ?? true,
      shadowJitter: 0.2,
      shadowBias: -0.00006,
      shadowNormalBias: 0.008
    };

    // Posizione della fiamma rispetto al centro del modello
    this.fireOffset = new THREE.Vector3(
      opts.fireOffsetX ?? 0,
      opts.fireOffsetY ?? 0.35,
      opts.fireOffsetZ ?? 0
    );
  }

  async load() {
    const base = await loader.loadAsync(this.modelPath);

    // il Group del FBX spesso contiene mesh figlie
    this.model = base.clone(true);
    this.model.scale.setScalar(this.scale);
    this.model.position.copy(this.position);

    // Applica materiali/ombre
    this.model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      if (Array.isArray(child.material)) {
        const mats = child.material.slice();
        const { campfire, rock } = this.materialIndices;
        if (mats[campfire]) mats[campfire] = this.campfireMat;
        if (mats[rock])     mats[rock]     = this.rockMat;
        child.material = mats;
      } else {
        // fallback: campfireMat
        child.material = this.campfireMat;
      }
    });

    scene.add(this.model);
    this.isLoaded = true;

    // Spawna il sistema di fuoco (luci incluse)
    const firePos = this.model.position.clone().add(this.fireOffset);
    this.fireSystem = spawnFire(firePos, this.fireOptions);

    return this.model;
  }

  update(delta) {
    // Il particellare viene aggiornato globalmente da updateFires(dt).
    // Qui puoi modulare lentamente vento/intensità per varietà locale.
    if (this.fireSystem) {
      const t = performance.now() * 0.001;
      const windAngle = t * 0.18;
      const windDir = new THREE.Vector3(
        Math.sin(windAngle) * 0.35,
        0.12,
        Math.cos(windAngle) * 0.28
      ).normalize();
      const windStrength = this.fireOptions.windStrength * (0.9 + 0.2 * Math.sin(t * 0.7));
      this.fireSystem.setWindDirection(windDir);
      this.fireSystem.setWindStrength(windStrength);
    }
  }

  // Controlli runtime
  setFireIntensity(intensity) {
    if (this.fireSystem?.setIntensity) this.fireSystem.setIntensity(intensity);
  }

  setWindEffect(direction, strength) {
    if (this.fireSystem) {
      this.fireSystem.setWindDirection(direction);
      this.fireSystem.setWindStrength(strength);
    }
  }

  dispose() {
    if (this.fireSystem) {
      this.fireSystem.dispose(); // rimuove particelle + rig luci
      this.fireSystem = null;
    }
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
export async function spawnCampfireAt(x, z, opts = {}) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const cf = new Campfire(pos, opts);
  await cf.load();

  // === INTERACTION: registra falò ===
  interactionManager.register({
    getWorldPosition: (out = new THREE.Vector3()) => {
      const p = cf.model?.position ?? cf.position;
      if (!p) return null;
      return out.copy(p);
    },
    canInteract: (_player) => true,
    getPrompt: (player) => {
      const sitting = player?.isSitting?.();
      return { key: 'E', text: sitting ? 'Stand up' : 'Sit by the fire' };
    },
    onInteract: (player) => {
      if (!player) return;
      if (player.isSitting?.()) {
        player.standUpFromSit?.();
        hudManager.showNotification?.('You stand up.');
      } else {
        player.sitDownThenIdle?.();
        hudManager.showNotification?.('You sit by the fire.');
      }
    }
  });

  campfires.push(cf);
  return cf;
}

// Call da gameloop
export function updateCampfires(delta) {
  for (const cf of campfires) cf.update(delta);
}

// Controlli globali per tutti i campfire
export function setAllCampfiresIntensity(intensity) {
  campfires.forEach(cf => cf.setFireIntensity(intensity));
}

export function setAllCampfiresWind(direction, strength) {
  campfires.forEach(cf => cf.setWindEffect(direction, strength));
}

// Cleanup quando necessario
export function disposeAllCampfires() {
  while (campfires.length) {
    const cf = campfires.pop();
    cf.dispose();
  }
}

// Utility
export function getNearestCampfire(pos, radius = 2.0) {
  let best = null, bestD2 = radius * radius;
  for (const cf of campfires) {
    const d2 = cf.position.distanceToSquared(pos);
    if (d2 <= bestD2) { best = cf; bestD2 = d2; }
  }
  return best;
}
