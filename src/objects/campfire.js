// campfire.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { FireParticleSystem } from '../particles/FireParticleSystem.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js'; 

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
    this.scale = 0.01;
    this.materialIndices = { campfire: 1, rock: 0 };

    // PATH texture di default: rinominali se i tuoi file hanno nomi diversi
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
    this._tmpPos = new THREE.Vector3();
    // Sistema di particelle migliorato
    this.fireSystem = null;
    this.smokeSystem = null;
    this._rand = Math.random() * 100.0;
    this._windPhase = Math.random() * Math.PI * 2;
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

    // 🔥 Sistema di fiamme principale con il nuovo FireParticleSystem
    const firePos = this.position.clone().add(new THREE.Vector3(0, 0.45, 0));
    this.fireSystem = new FireParticleSystem(firePos, {
      count: 280,
      radius: 0.24,
      size: 38.0,
      lifeMin: 0.7,
      lifeMax: 1.3,
      upMin: 0.8,
      upMax: 1.3,
      side: 0.14,
      windStrength: 0.06,
      turbulence: 0.05
    });

    // 🌫️ Sistema di fumo secondario (più semplice)
    const smokePos = this.position.clone().add(new THREE.Vector3(0, 0.6, 0));
    this.smokeSystem = new FireParticleSystem(smokePos, {
      count: 120,
      radius: 0.32,
      size: 45.0,
      lifeMin: 1.8,
      lifeMax: 2.8,
      upMin: 0.4,
      upMax: 0.8,
      side: 0.25,
      windStrength: 0.12,
      turbulence: 0.08
    });

    // Rimuovo le luci del fireSystem per evitare duplicati
    if (this.fireSystem.mainLight) {
      scene.remove(this.fireSystem.mainLight);
      scene.remove(this.fireSystem.ambientGlow);
    }
    if (this.smokeSystem.mainLight) {
      scene.remove(this.smokeSystem.mainLight);
      scene.remove(this.smokeSystem.ambientGlow);
    }

    // 🔥 Luce principale del campfire con ombre
    this.light = new THREE.PointLight(0xffa040, 1.8, 12, 1.8);
    this.light.position.copy(this.position).add(new THREE.Vector3(0, 1.2, 0));
    this.light.castShadow = true;
    
    // Configurazione ombre ottimizzata
    this.light.shadow.mapSize.width = 2048;
    this.light.shadow.mapSize.height = 2048;
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = 15;
    this.light.shadow.bias = -0.0002;
    this.light.shadow.normalBias = 0.02;
    
    scene.add(this.light);

    // Luce secondaria per riempimento (senza ombre)
    this.ambientLight = new THREE.PointLight(0xff6030, 0.8, 6, 2.2);
    this.ambientLight.position.copy(this.position).add(new THREE.Vector3(0, 0.8, 0));
    this.ambientLight.castShadow = false;
    scene.add(this.ambientLight);

    this.isLoaded = true;
    return this.model;
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);

    // 🔥 Aggiorna sistemi di particelle
    if (this.fireSystem) {
      this.fireSystem.update(delta);
      
      // Vento dinamico per le fiamme
      const t = performance.now() * 0.001 + this._rand;
      const windAngle = t * 0.2 + this._windPhase;
      const windDir = new THREE.Vector3(
        Math.sin(windAngle) * 0.4,
        0.1,
        Math.cos(windAngle) * 0.3
      ).normalize();
      
      const windStrength = 0.06 + Math.sin(t * 0.8) * 0.03;
      this.fireSystem.setWindDirection(windDir);
      this.fireSystem.setWindStrength(windStrength);
    }

    if (this.smokeSystem) {
      this.smokeSystem.update(delta);
      
      // Vento più forte per il fumo
      const t = performance.now() * 0.001 + this._rand;
      const smokeWindAngle = t * 0.15 + this._windPhase + 0.5;
      const smokeWindDir = new THREE.Vector3(
        Math.sin(smokeWindAngle) * 0.6,
        0.2,
        Math.cos(smokeWindAngle) * 0.4
      ).normalize();
      
      const smokeWindStrength = 0.12 + Math.sin(t * 0.6) * 0.06;
      this.smokeSystem.setWindDirection(smokeWindDir);
      this.smokeSystem.setWindStrength(smokeWindStrength);
    }

    // 🔥 Flicker luci più naturale e complesso
    if (this.light) {
      const t = performance.now() * 0.001 + this._rand;
      
      // Flicker multi-frequenza per naturalezza
      const flicker1 = Math.sin(t * 12.3) * 0.08;
      const flicker2 = Math.sin(t * 23.7) * 0.06;
      const flicker3 = Math.sin(t * 41.1) * 0.04;
      const randomFlicker = (Math.random() - 0.5) * 0.02;
      
      const intensity = 1.6 + flicker1 + flicker2 + flicker3 + randomFlicker;
      this.light.intensity = Math.max(0.8, intensity);
      
      // Variazione colore sottile
      const hue = 0.08 + Math.sin(t * 0.9) * 0.015;
      const saturation = 0.95 + Math.sin(t * 1.3) * 0.05;
      this.light.color.setHSL(hue, saturation, 0.65);
      
      // Movimento sottile della luce
      this.light.position.set(
        this.position.x + Math.sin(t * 1.8) * 0.04,
        this.position.y + 1.2 + Math.sin(t * 2.5) * 0.03,
        this.position.z + Math.cos(t * 2.1) * 0.04
      );
    }

    if (this.ambientLight) {
      const t = performance.now() * 0.001 + this._rand;
      const ambientFlicker = 0.7 + Math.sin(t * 8.9 + 1.5) * 0.08;
      this.ambientLight.intensity = ambientFlicker;
      
      this.ambientLight.position.set(
        this.position.x + Math.sin(t * 1.2 + 2.0) * 0.02,
        this.position.y + 0.8 + Math.sin(t * 2.8 + 1.0) * 0.02,
        this.position.z + Math.cos(t * 1.5 + 1.5) * 0.02
      );
    }
  }

  // Metodi per controllo dinamico del fuoco
  setFireIntensity(intensity) {
    if (this.fireSystem) {
      this.fireSystem.setIntensity(intensity);
    }
    if (this.light) {
      this.light.intensity = 1.6 * intensity;
    }
  }

  setWindEffect(direction, strength) {
    if (this.fireSystem) {
      this.fireSystem.setWindDirection(direction);
      this.fireSystem.setWindStrength(strength);
    }
    if (this.smokeSystem) {
      const smokeDir = direction.clone().multiplyScalar(1.5); // Fumo più influenzato
      this.smokeSystem.setWindDirection(smokeDir);
      this.smokeSystem.setWindStrength(strength * 1.8);
    }
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

export async function spawnCampfireAt(x, z) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);

  const cf = new Campfire(pos);
  await cf.load();
  scene.add(cf.model);
  campfires.push(cf);
  // === INTERACTION: registra falò ===
  interactionManager.register({
    getWorldPosition: (out = new THREE.Vector3()) => {
      const p = cf.model?.position ?? cf.position;
      if (!p) return null;
      return out.copy(p);
    },
    canInteract: (player) => {
      // puoi filtrare per forma/condizioni; per ora sempre true
      return true;
   },
    getPrompt: (player) => {
      // Testo dinamico in base allo stato del player
      const sitting = player?.isSitting;
     return { key: 'E', text: sitting ? 'Stand up' : 'Sit by the fire' };
    },
    onInteract: (player) => {
      // ⚠️ Logica provvisoria: la vera animazione la collegheremo al Player
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

// vicino agli export esistenti
export function getNearestCampfire(pos, radius = 2.0) {
  let best = null, bestD2 = radius * radius;
  for (const cf of campfires) {
    const d2 = cf.position.distanceToSquared(pos);
    if (d2 <= bestD2) { best = cf; bestD2 = d2; }
  }
  return best;
}
