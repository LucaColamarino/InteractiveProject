
export var gameManager = null;
export const archerArea = { x: -25, z: 190, width: 150, depth: 150 }; 
export const wolfArea = { x: -95, z: -60, width: 150, depth: 150 };
export const spawnPoint = {x:-57,z:62};
export const archerObjective=0;
export const wolfObjective=0;
 class GameManager {
   savedPos =null;
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
   activatedStones={archer: false,wolf: false};
   campfiremenu=false;
   effects = null;
   isPaused = false;
   bridgeCreated = false;
  }
export function createGameManager() {
  
  if (!gameManager) {
    console.log('[GameManager] Creazione nuova istanza di GameManager');
    gameManager = new GameManager();
  }
  return gameManager;
}