// npcSpawner.js (aggiornato per delegare gestione a npcController.js)

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './scene.js';
import { getTerrainHeightAt } from './map.js';
import { loadAnimations } from './core/AnimationLoader.js';
import { ENTITY_CONFIG } from './entities.js';
import { registerEnemy } from './npcController.js';

let playerRef = null;
export function setPlayerReference(player) {
  playerRef = player;
}

const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

function applySharedMaterial(child, config) {
  if (child.isMesh || child.type === 'SkinnedMesh') {
    if (config.textures?.diffuse) {
      const mat = new THREE.MeshPhongMaterial({
        map: textureLoader.load(config.textures.diffuse),
        normalMap: config.textures.normal ? textureLoader.load(config.textures.normal) : null,
        shininess: 30,
      });
      child.material = mat;
    }
    child.castShadow = true;
    child.receiveShadow = true;
    child.frustumCulled = true;
  }
}

async function spawnEnemy(configKey, position, type) {
  const config = ENTITY_CONFIG[configKey];
  const baseModel = await loader.loadAsync(config.modelPath);
  const fbx = SkeletonUtils.clone(baseModel);

  fbx.traverse(child => applySharedMaterial(child, config));
  fbx.scale.copy(config.scale);
  position.y = getTerrainHeightAt(position.x, position.z) + (config.yOffset ?? 0);
  fbx.position.copy(position);
  scene.add(fbx);
  let mixer = null;
let actions = {};

if (config.animations) {
  const result = await loadAnimations(fbx, config.animations);
  mixer = result.mixer;
  actions = result.actions;
} else if (config.animationIndices) {
  mixer = new THREE.AnimationMixer(fbx);
  actions = {};
  for (const [name, index] of Object.entries(config.animationIndices)) {
    const clip = fbx.animations[index];
    if (!clip) {
      console.warn(`⚠️ Missing animation index ${index} for ${name}`);
      continue;
    }
    const action = mixer.clipAction(clip);
    if (name === 'die') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    actions[name] = action;
  }
}

  if (actions.walk) actions.walk.play();

  registerEnemy({
    type,
    model: fbx,
    mixer,
    actions,
    angle: Math.random() * Math.PI * 2,
    speed: type === 'werewolf' ? 1.0 : 3.0,
    alive: true,
  });
}

export function spawnWalkingNpc(pos) {
  spawnEnemy('archer', pos, 'walker');
}

export function spawnWerewolfNpc(pos) {
  spawnEnemy('werewolf', pos, 'werewolf');
}

export function spawnFlyingWyvern(pos) {
  spawnEnemy('wyvern', pos, 'wyvern');
}

export function spawnAreaEnemies() {
  for (let i = 0; i < 5; i++) {
    spawnWalkingNpc(new THREE.Vector3(Math.random() * 100 - 50, 0, Math.random() * 200 - 100));
  }
  for (let i = 0; i < 5; i++) {
    spawnWerewolfNpc(new THREE.Vector3(-250 + Math.random() * 100, 0, Math.random() * 100 - 50));
  }
  for (let i = 0; i < 3; i++) {
    spawnFlyingWyvern(new THREE.Vector3(250 + Math.random() * 100, 70, Math.random() * 100 - 50));
  }
}
