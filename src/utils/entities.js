import * as THREE from 'three';

export const ENTITY_CONFIG = {
  human: {
    modelPath: '/models/knight.fbx',
    animations: {
      idle: '/models/animations/KnightIdle.fbx',
      walk: '/models/animations/KnightWalk.fbx',
      run: '/models/animations/KnightRun.fbx',
      jump: '/models/animations/KnightJump.fbx',
      attack: '/models/animations/KnightAttack.fbx',
      die: '/models/animations/KnightDie.fbx',
      block: '/models/animations/KnightBlock.fbx'
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
  },
    archer: {
    modelPath: '/models/archer.fbx',
    animations: {
      idle: '/models/animations/ArcherIdle.fbx',
      walk: '/models/animations/ArcherWalk.fbx',
      run: '/models/animations/ArcherRun.fbx',
      jump: '/models/animations/ArcherJump.fbx',
      die: '/models/animations/ArcherDie.fbx',
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
      run: '/models/animations/WerewolfRun.fbx',
      jump: '/models/animations/WerewolfJump.fbx',
      die: '/models/animations/WerewolfDie.fbx',
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
    yOffset: 0,
  },
  wyvern: {
    modelPath: '/models/knight.fbx',
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
