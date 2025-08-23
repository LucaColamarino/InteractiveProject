export let gameManager = null;
 class GameManager {
   player = null;
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
  }
export function createGameManager() {
  
  if (!gameManager) {
    console.log('[GameManager] Creazione nuova istanza di GameManager');
    gameManager = new GameManager();
  }
  return gameManager;
}