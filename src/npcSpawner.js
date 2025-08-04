import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from './scene.js';
import { getTerrainHeightAt } from './map.js';
import { fixAnimationLoop } from './core/AnimationLoader.js';

let playerRef = null;
export function setPlayerReference(player) {
  playerRef = player;
}

const wyverns = [];
const walkers = [];
const werewolves = [];

const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

const MAX_DISTANCE = 150;

export async function spawnFlyingWyvern(position) {
  const fbx = await loader.loadAsync('/models/wyvern.fbx');

  const diffuse = textureLoader.load('/textures/wyvern/wyvern_diffuse.png');
  const normal = textureLoader.load('/textures/wyvern/wyvern_normal.png');

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = new THREE.MeshPhongMaterial({
        map: diffuse,
        normalMap: normal,
        shininess: 30
      });
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  fbx.scale.set(0.01, 0.01, 0.01);
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
  const playerPos = playerRef?.model?.position ?? new THREE.Vector3();

  for (const wyv of wyverns) {
    const dist = wyv.model.position.distanceTo(playerPos);
    wyv.model.visible = dist < MAX_DISTANCE;
    if (dist < MAX_DISTANCE) {
      wyv.mixer.update(delta);
      wyv.angle += delta * 0.2;
      const baseY = getTerrainHeightAt(wyv.model.position.x, wyv.model.position.z) + 20;
      wyv.model.position.x += Math.cos(wyv.angle) * 0.3;
      wyv.model.position.z += Math.sin(wyv.angle) * 0.3;
      wyv.model.position.y = baseY + Math.sin(wyv.angle * 2) * 2;

      const dir = new THREE.Vector3(Math.cos(wyv.angle), 0, Math.sin(wyv.angle));
      const target = wyv.model.position.clone().add(dir);
      wyv.model.lookAt(target);
    }
  }
}

export async function spawnWalkingNpc(position) {
  const fbx = await loader.loadAsync('/models/werewolf.fbx');

  const tex = textureLoader.load('/textures/werewolf/werewolf_diffuse.jpg');

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = new THREE.MeshPhongMaterial({ map: tex });
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  fbx.scale.set(0.01, 0.01, 0.01);
  position.y = getTerrainHeightAt(position.x, position.z);
  fbx.position.copy(position);
  scene.add(fbx);

  walkers.push({ model: fbx, angle: Math.random() * Math.PI * 2 });
}

export function updateWalkingNpcs(delta) {
  const playerPos = playerRef?.model?.position ?? new THREE.Vector3();

  for (const npc of walkers) {
    const dist = npc.model.position.distanceTo(playerPos);
    npc.model.visible = dist < MAX_DISTANCE;
    if (dist < MAX_DISTANCE) {
      npc.angle += delta * 0.2;
      const moveSpeed = 0.5;
      const dir = new THREE.Vector3(Math.cos(npc.angle), 0, Math.sin(npc.angle));
      npc.model.position.addScaledVector(dir, moveSpeed * delta);
      const x = npc.model.position.x;
      const z = npc.model.position.z;
      const terrainY = getTerrainHeightAt(x, z);
      npc.model.position.y = terrainY;
      const target = npc.model.position.clone().add(dir);
      npc.model.lookAt(target);
    }
  }
}

export async function spawnWerewolfNpc(position) {
  const fbx = await loader.loadAsync('/models/werewolf.fbx');

  const tex = textureLoader.load('/textures/werewolf/werewolf_color.jpg');

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = new THREE.MeshPhongMaterial({ map: tex });
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });

  fbx.scale.set(0.01, 0.01, 0.01);
  position.y = getTerrainHeightAt(position.x, position.z);
  fbx.position.copy(position);
  scene.add(fbx);

  werewolves.push({ model: fbx, angle: Math.random() * Math.PI * 2 });
}

export function updateWerewolfNpcs(delta) {
  const playerPos = playerRef?.model?.position ?? new THREE.Vector3();

  for (const npc of werewolves) {
    const dist = npc.model.position.distanceTo(playerPos);
    npc.model.visible = dist < MAX_DISTANCE;
    if (dist < MAX_DISTANCE) {
      npc.angle += delta * 0.3;
      const moveSpeed = 1.0;
      const dir = new THREE.Vector3(Math.cos(npc.angle), 0, Math.sin(npc.angle));
      npc.model.position.addScaledVector(dir, moveSpeed * delta);
      const x = npc.model.position.x;
      const z = npc.model.position.z;
      const terrainY = getTerrainHeightAt(x, z);
      npc.model.position.y = terrainY;
      const target = npc.model.position.clone().add(dir);
      npc.model.lookAt(target);
    }
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
}
