// src/props/campfire.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { spawnFire } from '../particles/FireParticleSystem.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js';
import { gameManager } from '../managers/gameManager.js';
import { setCameraFocus, clearCameraFocus } from '../player/cameraFollow.js';
import { showCampfireMenu, hideCampfireMenu } from '../ui/hudCampfireMenu.js';

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

function makeRunestoneMaterial() {
  const base = texLoader.load('/textures/runestone/runestone_basecolor.jpg');
  base.colorSpace = THREE.SRGBColorSpace;
  const normal = texLoader.load('/textures/runestone/runestone_normal.jpg');
  const rough = texLoader.load('/textures/runestone/runestone_roughness.jpg');
  const metal = texLoader.load('/textures/runestone/runestone_metallic.jpg');
  const emissive = texLoader.load('/textures/runestone/runestone_emissive.jpg');

  const mat = new THREE.MeshStandardMaterial({
    map: base,
    normalMap: normal,
    roughnessMap: rough,
    metalnessMap: metal,
    emissiveMap: emissive,
    emissive: new THREE.Color(0x000000), // spento di default
    emissiveIntensity: 0.0,
    metalness: 1.0,
    roughness: 1.0
  });
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
    this.position = position.clone().add(new THREE.Vector3(0, this.yoffset ?? 0, 0));
    this.modelPath = opts.modelPath ?? '/models/props/campfire1.fbx';
    this.scale = opts.scale ?? 0.01;
    this.runestone = null;
    this.runestoneMat = makeRunestoneMaterial();
    this._floatTime = 0;

    this.materialIndices = opts.materialIndices ?? { campfire: 0, rock: 1 };

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

    // Opzioni fuoco
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
      lightingStrength: opts.lightingStrength ?? 1.2,
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

    // === RUNESTONE ===
    const runeObj = await loader.loadAsync('/models/props/runestone.fbx');
    this.runestone = runeObj;
    this.runestone.scale.setScalar(0.01);
    this.runestone.position.copy(this.model.position).add(new THREE.Vector3(0, 2.5, 0)); // sospesa sopra
    this.runestone.traverse((c) => {
      if (c.isMesh) {
        c.material = this.runestoneMat;
        c.castShadow = false;
        c.receiveShadow = true;
      }
    });
    scene.add(this.runestone);

    return this.model;
  }

  update(delta) {
    // Il particellare viene aggiornato globalmente da updateFires(dt).
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
    if (this.runestone) {
      this._floatTime += delta;
      const bob = Math.sin(this._floatTime * 2.0) * 0.01;
      this.runestone.position.y += bob;
      this.runestone.rotation.y += delta * 0.2; // rotazione lenta
    }

    // Player "brucia" se troppo vicino
    const dist = this.model.position.distanceTo(gameManager?.controller?.player?.model.position);
    if (dist < 0.95) gameManager?.controller.startBurning?.();
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

  setFlameBlue(on, smooth = true) {
    if (!this.fireSystem) return;
    if (smooth && typeof this.fireSystem.transitionPalette === 'function') {
      this.fireSystem.transitionPalette(on ? 'blue' : 'normal', 0.35);
    } else if (typeof this.fireSystem.setPalette === 'function') {
      this.fireSystem.setPalette(on ? 'blue' : 'normal');
    }

    // === RUNESTONE illumina ===
    if (this.runestoneMat) {
      this.runestoneMat.emissive.setHex(on ? 0x2C74FF : 0x000000);
      this.runestoneMat.emissiveIntensity = on ? 1.2 : 0.0;
      this.runestoneMat.needsUpdate = true;
    }
  }

  setRimEmissiveBlue(on) {
    if (this.campfireMat && 'emissive' in this.campfireMat) {
      this.campfireMat.emissive.setHex(on ? 0x2C74FF : 0x000000);
      this.campfireMat.emissiveIntensity = on ? 0.15 : 0.0;
      this.campfireMat.needsUpdate = true;
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

function computeSitPosition(campfirePos, playerPos, radius = 1.2) {
  const dir = new THREE.Vector3().subVectors(playerPos, campfirePos);
  if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
  dir.normalize();

  const target = new THREE.Vector3().copy(campfirePos).add(dir.multiplyScalar(radius));
  target.y = getTerrainHeightAt(target.x, target.z);
  target.y += 0.02;
  return target;
}

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
    getPrompt: (controller) => {
      const sitting = controller.isSitting;
      return { key: 'E', text: sitting ? 'Stand up' : 'Sit by the fire' };
    },
    onInteract: (controller) => {
      const player = controller.player;
      if (!player) return;

      const campfirePos = cf.model?.position ?? cf.position;

      if (controller.isSitting) {
        // --- TI ALZI ---
        gameManager.controller?.sitToggle();
        hudManager.showNotification?.('You stand up.');
        clearCameraFocus();

        // palette normale
        cf.setFlameBlue(false, true);
        cf.setRimEmissiveBlue(false);

        // chiudi menu
        hideCampfireMenu();

        // (opzionale) riattiva input gioco, se gestisci uno stato UI
        gameManager?.setUIMode?.(false);

      } else {
        // --- TI SIEDI ---
        gameManager.controller?.sitToggle();
        hudManager.showNotification?.('You sit by the fire.');

        // 1) posiziona player
        const safeRadius = 2.0;
        const targetPos = computeSitPosition(campfirePos, player.model.position, safeRadius);
        player.model.position.copy(targetPos);

        // 2) ruota verso il falò
        const dir = new THREE.Vector3().subVectors(campfirePos, player.model.position);
        const yaw = Math.atan2(dir.x, dir.z);
        player.model.rotation.y = yaw;

        // 3) focus camera
        setCameraFocus(campfirePos, { height: 0.8, stiffness: 8 });

        // palette blu
        cf.setFlameBlue(true, true);
        cf.setRimEmissiveBlue(true);

        // apri menu: passa lo StatsSystem del player
        showCampfireMenu(controller.stats, {
          onClose: () => {
            // se chiudi con ESC mentre sei seduto, resta seduto ma UI libera
            gameManager?.setUIMode?.(false);
          }
        });

        // (opzionale) metti il gioco in "UI mode" (niente input movimento)
        gameManager?.setUIMode?.(true);
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
