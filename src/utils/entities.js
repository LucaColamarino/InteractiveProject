import * as THREE from 'three';

export const ENTITY_CONFIG = {
  human: {
    modelPath: '/models/knightwand.fbx',
    animations: {
      idle: '/models/animations/KnightIdle.fbx',
      walk: '/models/animations/KnightWalk.fbx',
      run: '/models/animations/KnightRun.fbx',
      jump: '/models/animations/KnightJump.fbx',
      die: '/models/animations/KnightDie.fbx',
      block: '/models/animations/KnightBlock.fbx',
      blockShield: '/models/animations/KnightBlockShield.fbx',
      sitIdle: '/models/animations/SittingIdle.fbx',
      standUp: '/models/animations/StandingUp.fbx',
      swordAttack: '/models/animations/KnightSwordAttack.fbx',
      wandCast: '/models/animations/KnightWandAttack.fbx',
      shockwave: '/models/animations/KnightShockwave.fbx'
    },
    textures: {
      armor: {
        diffuse:  '/textures/knight/body_diffuse.png',
        normal:   '/textures/knight/body_normal.png',
        metallic: '/textures/knight/body_metallic.png',
      },
      wand: {
        diffuse:   '/textures/knight/wand_diffuse.jpeg',
        normal:    '/textures/knight/wand_normal.png',
        metallic:  '/textures/knight/wand_metallic.jpeg',
        roughness: '/textures/knight/wand_roughness.jpeg'
      },
    },
    scale: new THREE.Vector3(0.01, 0.01, 0.01),
  },
  archer: {
    modelPath: '/models/archer.fbx',
    textures: {
      clothes: {
        diffuse: '/textures/archer/clothes_diffuse.png',
        normal: '/textures/archer/clothes_normal.png',
      },
      body: {
        diffuse: '/textures/archer/body_diffuse.png',
        normal: '/textures/archer/body_normal.png'
      },
      eye: {
        diffuse: '/textures/archer/body_diffuse.png',
        normal: '/textures/archer/body_normal.png'
      },
      lashes: {
        diffuse: '/textures/archer/body_diffuse.png',
        normal: '/textures/archer/body_normal.png',
        alphaMap: '/textures/archer/eyelash_alpha.png'
      },
      arrow: {
        diffuse: '/textures/archer/arrow_diffuse.png',
        normal: '/textures/archer/arrow_normal.jpg',
        alphaMap: '/textures/archer/arrow_alpha.png'
      },
      bow: {
        diffuse: '/textures/archer/bow_diffuse.jpg',
        normal: '/textures/archer/bow_normal.jpg'
      }
    },
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
