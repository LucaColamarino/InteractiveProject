import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene, camera, renderer } from '../scene.js';
import { offset } from './cameraFollow.js';
import { Player } from './Player.js';
import {HumanFormController} from '../controllers/forms/HumanFormController.js';
import { loadAnimations, fixAnimationLoop } from '../utils/AnimationLoader.js';
import { ENTITY_CONFIG } from '../utils/entities.js';
import { setPlayerReference} from '../spawners/npcSpawner.js';
const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

const modelCache = {};
const cloneCache = {};

function createAbilities(formName, overrides = {}) {
  const config = ENTITY_CONFIG[formName];
  return {
    modelPath: config.modelPath,
    animationPaths: config.animations,
    animationIndices: config.animationIndices,
    cameraOffset: overrides.cameraOffset || config.cameraOffset || new THREE.Vector3(0, 2.5, -1.5),
    rotationOffset: overrides.rotationOffset || 0,
    yOffset: overrides.yOffset ?? config.yOffset ?? 0.0,
    canFly: overrides.canFly || false,
    canJump: overrides.canJump || false,
    speed: overrides.speed || 5,
    jumpForce: overrides.jumpForce || 10,
    gravity: overrides.gravity || -30,
    flyspeed: overrides.flyspeed || 10,
    formName,
  };
}

export const abilitiesByForm = {
  human: createAbilities('human', {
    canFly: false,
    canJump: true,
    speed: 8,
    jumpForce: 12,
    gravity: -30,
  }),
  
  werewolf: createAbilities('werewolf', {
    canFly: false,
    canJump: true,
    speed: 10,
    jumpForce: 12,
    gravity: -30,
  }),

  wyvern: createAbilities('wyvern', {
    canFly: true,
    canJump: false,
    flyspeed: 30,
    speed: 8,
    jumpForce: 10,
    gravity: -5,
    cameraOffset: new THREE.Vector3(0, 15, -20),
    yOffset: 5.2,
  })
};

export async function preloadAssets() {
  for (const formName in abilitiesByForm) {
    const form = abilitiesByForm[formName];
    const config = ENTITY_CONFIG[formName];
    console.log(config.modelPath);
    const baseModel = await loader.loadAsync(config.modelPath);
    modelCache[formName] = baseModel;

    const clone = SkeletonUtils.clone(baseModel);
    clone.animations = baseModel.animations;

    clone.traverse(child => {
      if (child.isMesh || child.type === 'SkinnedMesh') {
        if (formName !== 'human') {
          const { diffuse, normal } = config.textures;
          const material = new THREE.MeshStandardMaterial({
            map: textureLoader.load(diffuse),
            normalMap: textureLoader.load(normal)
          });
          child.material = material;
        }
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });


    cloneCache[formName] = clone;

    const dummy = SkeletonUtils.clone(clone);
    dummy.visible = false;
    dummy.scale.copy(config.scale);
    scene.add(dummy);
    renderer.render(scene, camera);
    scene.remove(dummy);
  }

  renderer.compile(scene, camera);
}

export async function changeForm(formName) {
  const abilities = abilitiesByForm[formName];
  if (!abilities) throw new Error(`Forma non trovata: ${formName}`);
  offset.copy(abilities.cameraOffset);

  const fbx = SkeletonUtils.clone(cloneCache[formName]);
  fbx.animations = cloneCache[formName].animations;
  fbx.scale.copy(ENTITY_CONFIG[formName].scale);
  fbx.rotation.set(0, abilities.rotationOffset, 0);

  const group = new THREE.Group();
  const prevPlayer = scene.children.find(obj => obj.userData?.playerModel);
  const prevPosition = prevPlayer?.position?.clone() ?? new THREE.Vector3(5, 15, 5);

  group.position.copy(prevPosition);
  fbx.position.y += abilities.yOffset;
  group.add(fbx);

  scene.children
    .filter(obj => obj.userData?.playerModel)
    .forEach(obj => scene.remove(obj));

  group.userData.playerModel = true;
  scene.add(group);

  let mixer, actions;
  if (abilities.animationIndices) {
    mixer = new THREE.AnimationMixer(fbx);
    actions = {};
    for (const [key, index] of Object.entries(abilities.animationIndices)) {
      const clip = fixAnimationLoop(fbx.animations[index]);
      if (clip) actions[key] = mixer.clipAction(clip);
    }
  } else {
    const result = await loadAnimations(fbx, abilities.animationPaths);
    mixer = result.mixer;
    actions = result.actions;
  }

 const player = new Player(group, mixer, actions);
 const controller = new HumanFormController(player, abilities);
 player.anim.play('idle');

  addTransformationEffect(group.position);
  setPlayerReference(player);
  return { player, controller };
}

export function addTransformationEffect(position) {
  const geometry = new THREE.RingGeometry(0.5, 2.5, 64);
  const material = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
    depthWrite: false
  });

  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, position.y + 0.1, position.z);
  scene.add(ring);

  let scale = 1;
  const fadeSpeed = 1.5;

  function animateRing() {
    scale += 0.05;
    ring.scale.set(scale, scale, scale);
    material.opacity -= 0.02 * fadeSpeed;
    if (material.opacity <= 0) {
      scene.remove(ring);
      return;
    }
    requestAnimationFrame(animateRing);
  }

  animateRing();
}
