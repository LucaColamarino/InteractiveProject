import * as THREE from 'three';
import { spawnRunicStone } from './runicStones.js';
import { getTerrainHeightAt } from '../map/map.js';
import { gameManager, archerObjective } from '../managers/gameManager.js';
import { hudManager } from '../ui/hudManager.js';
import { createBridge } from './bridge.js';
export let archersStone = null;
export async function spawnarchersStone({
  x = 0, z = 0, scale = 0.2, rotationY = 180, uvTile = 1
} = {}) {
  archersStone = await spawnRunicStone({
    id: 'archer',
    x, z,
    modelUrl: '/models/props/runicStone.fbx',
    texturesPath: '/textures/runicStone',
    glowColor: 0xff4444,
    scale, rotationY, uvTile,
    promptText: 'Activate archers stone',
    collider: { radius: 1.1, halfHeight: 0.9 },
    canActivate: () => {
      const left = archerObjective - gameManager.archersKilled;
      if (left > 0) {
        hudManager.showNotification?.(`You need to kill ${left} more archers.`);
        return false;
      }
      return true;
    },
    onActivated: () => {
      gameManager.activatedStones.archer = true;
      if (gameManager.activatedStones.wolf) {
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
    syncIsAlreadyActive: () => !!gameManager.activatedStones.archer,
  });

  return archersStone;
}

