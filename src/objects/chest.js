import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js';
import { gameManager } from '../managers/gameManager.js';
import { getRandomItem } from '../utils/items.js';
import { registerObstacle, unregisterObstacle} from '../systems/ObstacleSystem.js';

const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
export const chests = [];
function loadTex(path, { srgb = false, repeat = 1 } = {}) {
  if (!path) return null;
  const t = texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
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
  if (mat.normalMap) mat.normalMapType = THREE.TangentSpaceNormalMap;
  return mat;
}
function spawnPuffFX(worldPos) {
  const tex = loadTex('/textures/fx/puff_soft.png', { srgb: false });
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.01);
  sprite.position.copy(worldPos);
  scene.add(sprite);
  let t = 0;
  const ttl = 0.35;
  sprite.userData._update = (dt) => {
    t += dt;
    const k = Math.min(t / ttl, 1);
    const s = THREE.MathUtils.lerp(0.2, 1.0, k);
    sprite.scale.set(s, s, s);
    sprite.material.opacity = 1.0 - k;
    if (k >= 1) {
      scene.remove(sprite);
      sprite.material.dispose();
      if (sprite.geometry) sprite.geometry.dispose?.();
      sprite.userData._dead = true;
    }
  };
  Chest._fx.push(sprite);
}
export class Chest {
  constructor(position = new THREE.Vector3(0, 0, 0)) {
    this.yoffset = 0.3;
    position.y += this.yoffset;
    this.position = position.clone();
    this.modelPath = '/models/props/chest.fbx';
    this.scale = 0.01;
    this.collider = null;
    this.colliderRadius = 0.55;
    this.colliderHalfH = 0.35;
    const camp = {
      basecolor: '/textures/chest/chest_basecolor.png',
      normal:    '/textures/chest/chest_normal.png',
      roughness: '/textures/chest/chest_roughness.png',
      specular:  '/textures/chest/chest_specular.png',
    };
    this.chestMat = makePBR({
      basecolor:  loadTex(camp.basecolor,  { srgb: true }),
      normal:     loadTex(camp.normal),
      roughness:  loadTex(camp.roughness),
      metallic:   loadTex(camp.specular),
      metalness:  0.15,
      roughnessVal: 0.9,
      envMapIntensity: 1.0,
    });
    this.isOpen = false;
    this.isOpening = false;
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.isLoaded = false;
    this.spawnProgress = 0.6;
    this._spawnAtTime = null;
    this._lootSpawned = false;
    this._spawnCallback = null;
    this.glowLight = null;
  }
  async load() {
    const base = await loader.loadAsync(this.modelPath);
    const fbx = SkeletonUtils.clone(base);
    this.model = fbx;
    this.model.scale.setScalar(this.scale);
    this.model.position.copy(this.position);
    this.model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = this.chestMat;
    });
    this.glowLight = new THREE.PointLight(0xffd080, 0, 1.2);
    this.glowLight.position.set(0, 0.15, 0);
    this.model.add(this.glowLight);
    if (base.animations && base.animations.length) {
      this.mixer = new THREE.AnimationMixer(this.model);
      const clip = base.animations[0];
      const action = this.mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.actions.open = action;

      this.mixer.addEventListener('finished', (e) => {
        if (e.action === this.actions.open) {
          this.isOpening = false;
          this._fadeGlowOut = true;
        }
      });
    }
    this.isLoaded = true;
    return this.model;
  }
  open(spawnCallback) {
    if (this.isOpen || this.isOpening) return;
    this.isOpen = true;
    this.isOpening = true;
    this._lootSpawned = false;
    this._spawnCallback = spawnCallback || null;
    if (this.actions.open) {
      const action = this.actions.open.reset();
      const duration = action.getClip().duration || 1.0;
      this._spawnAtTime = duration * this.spawnProgress;
      action.play();
    } else {
      this._spawnAtTime = 0;
    }
    this.glowLight.intensity = 0.0;
    this._glowUp = true;
    hudManager.showNotification?.('Chest Opening...');
  }
  update(delta) {
    if (this.mixer) this.mixer.update(delta);
    if (this._glowUp && this.glowLight) {
      this.glowLight.intensity = Math.min(this.glowLight.intensity + 4.0 * delta, 2.4);
    }
    if (this._fadeGlowOut && this.glowLight) {
      this.glowLight.intensity = Math.max(this.glowLight.intensity - 1.5 * delta, 0.0);
      if (this.glowLight.intensity === 0) this._fadeGlowOut = false;
    }
    if (this.isOpening && !this._lootSpawned && this._spawnAtTime != null) {
      const t = this.actions.open ? this.actions.open.time : this._spawnAtTime;
      if (t >= this._spawnAtTime) {
        this._lootSpawned = true;
        const spawnPos = new THREE.Vector3(0, 0.25, 0);
        this.model.localToWorld(spawnPos);
        spawnPuffFX(spawnPos);
        if (this._spawnCallback) this._spawnCallback(spawnPos);

        if (this.glowLight) {
          this.glowLight.intensity = Math.max(this.glowLight.intensity, 2.8);
          this._glowUp = false;
          this._fadeGlowOut = true;
        }
        hudManager.showNotification?.('You found something!');
      }
    }
    if (this.collider?._debugMesh?.userData?._tick) {
      this.collider._debugMesh.userData._tick();
    }
    if (Chest._fx.length) {
      for (let i = Chest._fx.length - 1; i >= 0; --i) {
        const fx = Chest._fx[i];
        if (fx.userData._dead) { Chest._fx.splice(i, 1); continue; }
        fx.userData._update?.(delta);
      }
    }
  }
  dispose() {
    if (this.collider) {
      unregisterObstacle(this.collider);
      this.collider = null;
    }
    if (this.model) {
      scene.remove(this.model);
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.geometry?.dispose();
        }
      });
      this.model = null;
    }
  }
}
Chest._fx = [];
export async function spawnChestAt(x, z, dropItem = null) {
  const terrainY = getTerrainHeightAt(x, z);
  const pos = new THREE.Vector3(x, terrainY, z);
  const chest = new Chest(pos);
  await chest.load();
  scene.add(chest.model);
  chests.push(chest);
  chest.collider = registerObstacle({
    type: 'cylinder',
    positionRef: chest.model.position,
    radius: chest.colliderRadius,
    halfHeight: chest.colliderHalfH,
    userData: { kind: 'chest', chest },
  });
  interactionManager.register({
    getWorldPosition: (out = new THREE.Vector3()) => {
      const p = chest.model?.position ?? chest.position;
      return out.copy(p);
    },
    canInteract: () => !chest.isOpen && !chest.isOpening,
    getPrompt: () => ({ key: 'E', text: chest.isOpening ? 'Opening...' : 'Open Chest' }),
    onInteract: () => {
      if (chest.isOpen || chest.isOpening) return;

      const spawnLoot = (spawnPos) => {
        const item = dropItem ?? getRandomItem();
        const groundY = getTerrainHeightAt(spawnPos.x, spawnPos.z);
        const dropPos = new THREE.Vector3(spawnPos.x, Math.max(spawnPos.y, groundY + 0.1), spawnPos.z);

        gameManager.pickableManager.spawnItem(
          item,
          dropPos,
          { autoPickup: false, pickupRadius: 1.5, enableRing: false, spawnImpulse: { up: 1.0 } }
        );
      };

      chest.open(spawnLoot);
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
