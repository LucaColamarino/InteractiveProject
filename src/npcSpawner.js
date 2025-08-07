import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './scene.js';
import { getTerrainHeightAt } from './map.js';
import { fixAnimationLoop, loadAnimations } from './core/AnimationLoader.js';
import { ENTITY_CONFIG } from './entities.js';

let playerRef = null;
export function setPlayerReference(player) {
  playerRef = player;
}

const wyverns = [];
const walkers = [];
const werewolves = [];

const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

const MAX_DISTANCE = 250;

// 🔁 Precarica materiali condivisi
const sharedMaterials = {
  wyvern: null,
  werewolf: null,
  human: null,
};

function getSharedMaterial(config) {
  if (!sharedMaterials[config.key]) {
    sharedMaterials[config.key] = new THREE.MeshPhongMaterial({
      map: textureLoader.load(config.textures.diffuse),
      normalMap: config.textures.normal ? textureLoader.load(config.textures.normal) : null,
      shininess: 30,
    });
  }
  return sharedMaterials[config.key];
}

export async function spawnFlyingWyvern(position) {
  const config = ENTITY_CONFIG.wyvern;
  const fbx = await loader.loadAsync(config.modelPath);
  const material = getSharedMaterial({ key: 'wyvern', textures: config.textures });

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  fbx.scale.copy(config.scale);
  fbx.position.copy(position);
  fbx.rotation.y = Math.random() * Math.PI * 2;
  scene.add(fbx);

  const mixer = new THREE.AnimationMixer(fbx);
  let clip = fbx.animations[0];
  clip = fixAnimationLoop(clip);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopRepeat, Infinity).play();

  wyverns.push({ model: fbx, mixer, angle: Math.random() * Math.PI * 2, radius: 50 + Math.random() * 30 });
}

export function updateWyverns(delta) {
  const speed = 0.2;
  const playerPos = playerRef?.model?.position ?? new THREE.Vector3();

  for (const wyv of wyverns) {
    const dist = wyv.model.position.distanceTo(playerPos);
    wyv.model.visible = dist < MAX_DISTANCE;
    if (!wyv.model.visible) continue;

    wyv.mixer?.update(Math.min(delta, 0.05));
    wyv.angle += delta * 0.2;
    const baseY = getTerrainHeightAt(wyv.model.position.x, wyv.model.position.z) + 20;
    wyv.model.position.x += Math.cos(wyv.angle) * speed;
    wyv.model.position.z += Math.sin(wyv.angle) * speed;
    wyv.model.position.y = baseY + Math.sin(wyv.angle * 2) * 4;

    const dir = new THREE.Vector3(Math.cos(wyv.angle), 0, Math.sin(wyv.angle));
    const target = wyv.model.position.clone().add(dir);
    wyv.model.lookAt(target);
  }
}

export async function spawnWalkingNpc(position) {
  const config = ENTITY_CONFIG.archer;
  const baseModel = await loader.loadAsync(config.modelPath);
  const fbx = SkeletonUtils.clone(baseModel);

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      const tex = config.textures?.diffuse ? textureLoader.load(config.textures.diffuse) : null;
      if (tex) child.material = new THREE.MeshPhongMaterial({ map: tex });
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  fbx.scale.copy(config.scale);
  position.y = getTerrainHeightAt(position.x, position.z);
  fbx.position.copy(position);
  scene.add(fbx);

  const { mixer, actions } = await loadAnimations(fbx, config.animations);
  if (actions.walk) actions.walk.play();

  walkers.push({ model: fbx, mixer, angle: Math.random() * Math.PI * 2 });
}

export function updateWalkingNpcs(delta) {
  return;
  const playerPos = playerRef?.model?.position ?? new THREE.Vector3();

  for (const npc of walkers) {
    const dist = npc.model.position.distanceTo(playerPos);
    npc.model.visible = dist < MAX_DISTANCE;
    if (!npc.model.visible) continue;

    npc.angle += delta * 0.2;
    const moveSpeed = 3.0;
    const dir = new THREE.Vector3(Math.cos(npc.angle), 0, Math.sin(npc.angle));
    npc.model.position.addScaledVector(dir, moveSpeed * delta);
    const x = npc.model.position.x;
    const z = npc.model.position.z;
    npc.model.position.y = getTerrainHeightAt(x, z);

    const target = npc.model.position.clone().add(dir);
    npc.model.lookAt(target);
    npc.mixer?.update(Math.min(delta, 0.05));
  }
}

export async function spawnWerewolfNpc(position) {
  const config = ENTITY_CONFIG.werewolf;
  const baseModel = await loader.loadAsync(config.modelPath);
  const fbx = SkeletonUtils.clone(baseModel);
  const material = getSharedMaterial({ key: 'werewolf', textures: config.textures });

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  fbx.scale.copy(config.scale);
  position.y = getTerrainHeightAt(position.x, position.z) + (config.yOffset ?? 0);
  fbx.position.copy(position);
  scene.add(fbx);

  const { mixer, actions } = await loadAnimations(fbx, config.animations);
  if (actions.walk) actions.walk.play();

  werewolves.push({ model: fbx, mixer, angle: Math.random() * Math.PI * 2 });
}

export function updateWerewolfNpcs(delta) {
  const playerPos = playerRef?.model?.position ?? new THREE.Vector3();

  for (const npc of werewolves) {
    const dist = npc.model.position.distanceTo(playerPos);
    npc.model.visible = dist < MAX_DISTANCE;
    if (!npc.model.visible) continue;

    npc.angle += delta * 0.3;
    const moveSpeed = 1.0;
    const dir = new THREE.Vector3(Math.cos(npc.angle), 0, Math.sin(npc.angle));
    npc.model.position.addScaledVector(dir, moveSpeed * delta);
    const x = npc.model.position.x;
    const z = npc.model.position.z;
    npc.model.position.y = getTerrainHeightAt(x, z);

    const target = npc.model.position.clone().add(dir);
    npc.model.lookAt(target);
    npc.mixer?.update(Math.min(delta, 0.05));
  }
}

export function spawnAreaEnemies() {
  for (let i = 0; i < 5; i++) {
    spawnWalkingNpc(new THREE.Vector3(
      Math.random() * 100 - 50, 0, Math.random() * 200 - 100
    ));
  }

  for (let i = 0; i < 5; i++) {
    spawnWerewolfNpc(new THREE.Vector3(
      -250 + Math.random() * 100, 0, Math.random() * 100 - 50
    ));
  }

  for (let i = 0; i < 3; i++) {
    spawnFlyingWyvern(new THREE.Vector3(
      250 + Math.random() * 100, 70, Math.random() * 100 - 50
    ));
  }

  window._walkers = walkers;
  window._werewolves = werewolves;
  window._wyverns = wyverns;

}
