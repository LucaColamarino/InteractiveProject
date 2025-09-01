import * as THREE from 'three';
import { spawnRunicStone } from './runicStones.js';
import { getTerrainHeightAt } from '../map/map.js';
import { gameManager, wolfObjective } from '../managers/gameManager.js';
import { hudManager } from '../ui/hudManager.js';
import { createBridge } from './bridge.js';
export let wolvesStone = null;
export async function spawnWolfStone({
  x = 0, z = 0, scale = 0.02, rotationY = 280, uvTile = 1
} = {}) {
  wolvesStone = await spawnRunicStone({
    id: 'wolf',
    x, z,
    modelUrl: '/models/props/fantasyStone.fbx',
    texturesPath: '/textures/fantasyStone',
    glowColor: 0x66ccff,
    scale, rotationY, uvTile,
    promptText: 'Activate wolves stone',
    collider: { radius: 1.5, halfHeight: 0.9 },
    canActivate: () => {
      const left = wolfObjective - gameManager.wolvesKilled;
      if (left > 0) {
        hudManager.showNotification?.(`You need to kill ${left} more wolves.`);
        return false;
      }
      return true;
    },
    onActivated: () => {
      gameManager.activatedStones.wolf = true;
      if (gameManager.activatedStones.archer) {
        hudManager.showNotification?.('Bridge activated.');
        createBridge({
          modelUrl: '/models/props/Bridge.fbx',
          texturesPath: '/textures/bridge',
          scale: 0.004,
          position: new THREE.Vector3(-135, getTerrainHeightAt(-135,115), 115),
          rotationY: 10,
          uvTile: 2,
        });
      } else {
        hudManager.showNotification?.('One stone left.');
      }
    },
    syncIsAlreadyActive: () => !!gameManager.activatedStones.wolf,
  });
  return wolvesStone;
}