import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from './scene.js';
import { getTerrainHeightAt } from './map.js';
import { fixAnimationLoop } from './core/AnimationLoader.js';

const wyverns = [];
const walkers = [];
const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

export async function spawnFlyingWyvern(position) {
  const fbx = await loader.loadAsync('/models/Wyvern animated.fbx');

  const diffuse = textureLoader.load('/textures/diffuse.png');
  const normal = textureLoader.load('/textures/normal.png');
  const specular = textureLoader.load('/textures/diffuse.png');

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = new THREE.MeshPhongMaterial({
        map: diffuse,
        normalMap: normal,
        specularMap: specular,
        shininess: 30
      });
      child.castShadow = true;
      child.receiveShadow = true;
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
  for (const wyv of wyverns) {
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


export async function spawnWalkingNpc(position) {
  const fbx = await loader.loadAsync('/models/Ybot.fbx');

  const tex = textureLoader.load('/textures/diffuse.png');

  fbx.traverse(child => {
    if (child.isMesh || child.type === 'SkinnedMesh') {
      child.material = new THREE.MeshPhongMaterial({ map: tex });
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  fbx.scale.set(0.01, 0.01, 0.01);
  position.y = getTerrainHeightAt(position.x, position.z);
  fbx.position.copy(position);
  scene.add(fbx);

  walkers.push({ model: fbx, angle: Math.random() * Math.PI * 2 });
}

export function updateWalkingNpcs(delta) {
  for (const npc of walkers) {
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
