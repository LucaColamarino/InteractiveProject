// 🔧 Updated formManager.js: stable shadows, fixed wyvern artifact, clean switching
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene } from './scene.js';
import { offset } from './cameraFollow.js';
import { Player } from './core/Player.js';
import { PlayerController } from './core/playerController.js';
import { loadAnimations, fixAnimationLoop } from './core/AnimationLoader.js';
const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();
const modelCache = {};
const textureCache = {};

export const abilitiesByForm = {
  human: {
    modelPath: '/models/player.fbx',
    animationPaths: {
      idle: '/models/animations/YbotIdle.fbx',
      walk: '/models/animations/YbotWalking.fbx',
      run:  '/models/animations/YbotRunning.fbx',
      jump: '/models/animations/YbotJumping.fbx',
    },
    canFly: false,
    canJump: true,
    speed: 5,
    jumpForce: 12,
    gravity: -30,
    cameraOffset: new THREE.Vector3(0, 2.5, -1.5),
    rotationOffset: 0,
    yOffset: 0.0
  },
  bird: {
    modelPath: '/models/Wyvern animated.fbx',
    animationIndices: {
      idle: 2,
      fly: 0,
      jump: 1,
      walk: 1,
    },
    canFly: true,
    canJump: false,
    flyspeed: 50,
    speed: 15,
    jumpForce: 10,
    gravity: -5,
    cameraOffset: new THREE.Vector3(0, 15, -20),
    rotationOffset: 0,
    yOffset: 5.2
  }
};

export async function preloadAssets() {
  for (const formName in abilitiesByForm) {
    const form = abilitiesByForm[formName];

    if (!modelCache[formName]) {
      const fbx = await loader.loadAsync(form.modelPath);
      modelCache[formName] = fbx;
    }

    if (formName === 'bird') {
      if (!textureCache.diffuse)
        textureCache.diffuse = textureLoader.load('/textures/diffuse.png');
      if (!textureCache.normal)
        textureCache.normal = textureLoader.load('/textures/normal.png');
      if (!textureCache.specular)
        textureCache.specular = textureLoader.load('/textures/diffuse.png');
    }
  }
}

export async function changeForm(formName) {
  const abilities = abilitiesByForm[formName];
  if (!abilities) throw new Error(`Forma non trovata: ${formName}`);

  offset.copy(abilities.cameraOffset);

  const original = modelCache[formName];
  const fbx = SkeletonUtils.clone(original);
  fbx.animations = original.animations;

  fbx.castShadow = false;
  fbx.receiveShadow = false;

  fbx.traverse(child => {
    if (child.isMesh && child.geometry) {
      if (formName === 'bird') {
        child.material = new THREE.MeshPhongMaterial({
          map: textureCache.diffuse,
          normalMap: textureCache.normal,
          specularMap: textureCache.specular,
          shininess: 30
        });
      }
      child.castShadow = true;
      child.receiveShadow = true;
      console.log(child.name, 'castShadow:', child.castShadow);
    }
  });

  fbx.scale.set(0.01, 0.01, 0.01);
  fbx.rotation.set(0, abilities.rotationOffset || 0, 0);

  const group = new THREE.Group();
  fbx.position.y += abilities.yOffset || 0;
  group.add(fbx);

  for (let i = scene.children.length - 1; i >= 0; i--) {
    const obj = scene.children[i];
    if (obj.userData && obj.userData.playerModel) {
      scene.remove(obj);
    }
  }

  group.userData.playerModel = true;
  scene.add(group);

  let mixer, actions;
  if (formName === 'bird') {
    mixer = new THREE.AnimationMixer(fbx);
    actions = {};
    const indexMap = abilities.animationIndices;
    for (const [key, index] of Object.entries(indexMap)) {
      let clip = fbx.animations[index];
      clip = fixAnimationLoop(clip);
      if (clip) {
        actions[key] = mixer.clipAction(clip);
      }
    }
  } else {
    const result = await loadAnimations(fbx, abilities.animationPaths);
    mixer = result.mixer;
    actions = result.actions;
  }

  const player = new Player(group, mixer, actions);
  const controller = new PlayerController(player, abilities);
  player.playAnimation('idle');
  return { player, controller };
}
