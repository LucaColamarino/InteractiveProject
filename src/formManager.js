import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { scene, camera, renderer } from './scene.js';
import { offset } from './cameraFollow.js';
import { Player } from './core/Player.js';
import { PlayerController } from './core/playerController.js';
import { loadAnimations, fixAnimationLoop } from './core/AnimationLoader.js';

const loader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();

const modelCache = {};
const cloneCache = {};
const textureDiffuse = textureLoader.load('/textures/wyvern/wyvern_diffuse.png');
const textureNormal = textureLoader.load('/textures/wyvern/wyvern_normal.png');
const textureWerewolfDiffuse = textureLoader.load('/textures/werewolf/werewolf_diffuse.jpg');
const textureWerewolfNormal = textureLoader.load('/textures/werewolf/werewolf_normal.jpg');

function createAbilities(formName, config) {
  return {
    ...config,
    cameraOffset: config.cameraOffset || new THREE.Vector3(0, 2.5, -1.5),
    rotationOffset: config.rotationOffset || 0,
    yOffset: config.yOffset || 0.0,
    formName,
  };
}

export const abilitiesByForm = {
  human: createAbilities('human', {
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
  }),

  werewolf: createAbilities('werewolf', {
    modelPath: '/models/werewolf.fbx',
    animationPaths: {
      idle: '/models/animations/WerewolfIdle.fbx',
      walk: '/models/animations/WerewolfWalk.fbx',
      run:  '/models/animations/YbotRunning.fbx',
      jump: '/models/animations/YbotJumping.fbx',
    },
    canFly: false,
    canJump: true,
    speed: 10,
    jumpForce: 12,
    gravity: -30,
  }),

  wyvern: createAbilities('wyvern', {
    modelPath: '/models/wyvern.fbx',
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
    yOffset: 5.2,
  })
};

export async function preloadAssets() {
  for (const formName in abilitiesByForm) {
    const form = abilitiesByForm[formName];

    const baseModel = await loader.loadAsync(form.modelPath);
    modelCache[formName] = baseModel;

    const clone = SkeletonUtils.clone(baseModel);
    clone.animations = baseModel.animations;

    clone.traverse(child => {
      if (child.isMesh || child.type === 'SkinnedMesh') {
        let material;
        if (formName === 'wyvern') {
          material = new THREE.MeshStandardMaterial({
            map: textureDiffuse,
            normalMap: textureNormal
          });
        } else if (formName === 'werewolf') {
          material = new THREE.MeshStandardMaterial({
            map: textureWerewolfDiffuse,
            normalMap: textureWerewolfNormal
          });
        }
        if (material) child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    cloneCache[formName] = clone;

    const dummy = SkeletonUtils.clone(clone);
    dummy.visible = false;
    dummy.scale.set(0.01, 0.01, 0.01);
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
  fbx.scale.set(0.01, 0.01, 0.01);
  fbx.rotation.set(0, abilities.rotationOffset, 0);

  const group = new THREE.Group();
  const prevPlayer = scene.children.find(obj => obj.userData?.playerModel);
  const prevPosition = prevPlayer?.position?.clone() ?? new THREE.Vector3(0, 0, 0);

  group.position.copy(prevPosition);  // 🔧 Mantieni la posizione!
  fbx.position.y += abilities.yOffset;
  group.add(fbx);

  // Rimuove il precedente modello
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
  const controller = new PlayerController(player, abilities);
  player.playAnimation('idle');

  addTransformationEffect(group.position);
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
