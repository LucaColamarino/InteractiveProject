
import * as THREE from 'three';
export let gameManager = null;
export const archerArea = { x: -25, z: 190, width: 150, depth: 150 }; 
export const wolfArea = { x: -95, z: -60, width: 150, depth: 150 };
export const spawnPoint = {x:-57,z:62};
//(-60, 65);
 class GameManager {
   controller = null;
   running = false; 
   paused = false;
   animSys=null;
   scene = null;
   camera = null;
   sun=null;
   moon=null;
   menu = null;
   inventory = null;
   pickableManager = null;
   wolvesKilled = 0;
   archersKilled =0;
  }
export function createGameManager() {
  
  if (!gameManager) {
    console.log('[GameManager] Creazione nuova istanza di GameManager');
    gameManager = new GameManager();
  }
  return gameManager;
}