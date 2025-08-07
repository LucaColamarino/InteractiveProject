import * as THREE from 'three';

export const ENTITY_CONFIG = {
  human: {
    modelPath: '/models/knight.fbx',
    animations: {
      idle: '/models/animations/YbotIdle.fbx',
      walk: '/models/animations/YbotWalking.fbx',
      run: '/models/animations/YbotRunning.fbx',
      jump: '/models/animations/YbotJumping.fbx',
      attack: '/models/animations/swordJumpAttack.fbx',
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
  },
    archer: {
    modelPath: '/models/archer.fbx',
    animations: {
      idle: '/models/animations/YbotIdle.fbx',
      walk: '/models/animations/YbotWalking.fbx',
      run: '/models/animations/YbotRunning.fbx',
      jump: '/models/animations/YbotJumping.fbx',
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
  },
  werewolf: {
    modelPath: '/models/werewolf.fbx',
    textures: {
      diffuse: '/textures/werewolf/werewolf_diffuse.jpg',
      normal: '/textures/werewolf/werewolf_normal.jpg'
    },
    animations: {
      idle: '/models/animations/WerewolfIdle.fbx',
      walk: '/models/animations/WerewolfWalk.fbx',
      run: '/models/animations/WerewolfWalk.fbx',
      jump: '/models/animations/YbotJumping.fbx',
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
    yOffset: 0,
  },
  wyvern: {
    modelPath: '/models/wyvern.fbx',
    textures: {
      diffuse: '/textures/wyvern/wyvern_diffuse.png',
      normal: '/textures/wyvern/wyvern_normal.png'
    },
    animationIndices: {
      idle: 2,
      fly: 0,
      jump: 1,
      walk: 1,
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
    yOffset: 5.2,
  }
};
