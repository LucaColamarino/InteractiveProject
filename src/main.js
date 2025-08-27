// main.js
import { setupInput } from './systems/InputSystem.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane, createSky, getTerrainHeightAt } from './map/map.js';
import { spawnEnemies } from './spawners/npcSpawner.js';
import { populateVegetation } from './spawners/vegetationSpawner.js';
import { spawnCampfireAt } from './objects/campfire.js';
import { spawnChestAt } from './objects/chest.js';
import { spawntorchAt } from './objects/torch.js';
import { setFireShadowBudget } from './particles/FireParticleSystem.js';
import { InventorySystem } from './systems/inventorySystem.js';
import { MainMenu } from './ui/mainMenu.js';
import { StartMenu } from './ui/startMenu.js';
import { gameManager } from './managers/gameManager.js';
import { updateLoadingProgress, hideLoadingScreen, showLoadingScreen, suspendLoadingScreen } from './loading.js';
import { PickableManager } from './managers/pickableManager.js';
import { scene } from './scene.js';
import { allItems } from './utils/items.js';
import { preloadAllEntities } from './utils/entityFactory.js';
import { abilitiesByForm, spawnPlayer } from './player/Player.js';
import { loadHudVitals,loadHudMap, loadHudPills } from "./ui/hudManager.js";
import { ironShield, ironSword,magicWand,ironHelmet } from './utils/items.js';
import { updateVitalsHUD } from './ui/hudVitals.js';
import { createBridge } from './objects/bridge.js';
import * as THREE from 'three';
import { setNoGoLevel } from './systems/GroundSystem.js';
// =====================
// SETTINGS
// =====================
const settings = (window.__gameSettings = {
  quality: 'medium',
  shadows: true,
  resScale: 1.0,
  volume: 0.7,
});

let _initializing = false;

// =====================
// APPLY SETTINGS
// =====================
function applyMenuSettings(s) {
  Object.assign(settings, s);
  setFireShadowBudget(settings.shadows ? 3 : 0);
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: { ...settings } }));
}
window.addEventListener("DOMContentLoaded", () => {
  loadHudVitals();
  loadHudMap();
  loadHudPills();
});
// =====================
// INIT GAME
// =====================
async function init() {
  if (_initializing) return;
  _initializing = true;
  try {
    const inventory = new InventorySystem();
    window.inventory = inventory;
    gameManager.inventory = inventory;

    gameManager.pickableManager = new PickableManager({
      scene,
      inventory,
      onPickup: (p) => console.log('[Pickup]', p),
      usePointLight: true,
      interactKey: 'KeyE',
    });
    gameManager.pickableManager.prewarm(allItems);

    console.log('[Main] Inizializzazione del gioco...');
    updateLoadingProgress(5, 'Settings configuration...');
    applyMenuSettings(settings);
    await wait(80);

    updateLoadingProgress(15, 'Loading assets and resources...');
    await preloadAllEntities(Object.keys(abilitiesByForm));

    updateLoadingProgress(25, 'Controls configuration...');
    setupInput();
    await wait(80);

    updateLoadingProgress(45, 'Terrain Generation...');
    await createHeightmapTerrain();

    updateLoadingProgress(55, 'Creating sky and water...');
    createSky();
    const waterY = 8;
    addWaterPlane(waterY);
    setNoGoLevel(waterY, 0.06); // 6 cm di margine sopra
    await wait(120);

    updateLoadingProgress(70, 'Populate vegetation...');
    await populateVegetation();

    updateLoadingProgress(80, 'Spawn enemies...');
    spawnEnemies();
    await wait(80);

    updateLoadingProgress(90, 'Placing objects...');
    spawnCampfireAt(0, 0);
    spawntorchAt(30, 15);
    spawntorchAt(17, 20);
    spawntorchAt(-20, -15);
    spawnChestAt(6, 6,ironSword);

    spawnChestAt(-6, -6, magicWand);
    await createBridge({
      modelUrl: '/models/props/Bridge.fbx',
      texturesPath: '/textures/bridge',
      scale: 0.004,
      position: new THREE.Vector3(-135,getTerrainHeightAt(-135,115),115),
      rotationY: 10,
      uvTile: 2,  // aumenta/riduci tiling
    });
    updateLoadingProgress(95, 'Player initialization...');
    gameManager.controller = await spawnPlayer();
    updateVitalsHUD(gameManager.controller.stats);
    gameManager.inventory.updateEquipmentVisibility();
    gameManager.controller.syncWeaponFromInventory(gameManager.inventory);
    gameManager.inventory.onChange(() => {
      gameManager.controller.syncWeaponFromInventory(gameManager.inventory);
    });
    await wait(80);

    updateLoadingProgress(100, 'Finalizing...');
    await wait(60);

    hideLoadingScreen();

    // Stato gioco
    gameManager.running = true;
    gameManager.paused  = false;
    startLoop(gameManager.controller);

    // Crea il PAUSE MENU se manca
    if (!gameManager.menu) {
      gameManager.menu = new MainMenu({
        mode: 'pause',
        onResume: () => {
          gameManager.paused = false;
          window.dispatchEvent(new Event('game:resume'));
        },
        onQuit: () => {
          gameManager.paused = false;
          gameManager.running = false;
          window.dispatchEvent(new Event('game:quit'));
          ui.showStartMenu();
        },
        getSettings: () => ({ ...settings }),
        applySettings: applyMenuSettings,
      });
      gameManager.menu.show(false);
    }

    window.dispatchEvent(new Event('game:started'));
    console.log('[Main] Gioco inizializzato con successo!');
  } catch (err) {
    console.error('[Main] Errore durante inizializzazione:', err);
    hideLoadingScreen();
    showFatal(err?.message || 'Errore sconosciuto');
  } finally {
    _initializing = false;
  }
}

// Helpers
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function showFatal(msg) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    background: rgba(255, 0, 0, 0.9); color: white; padding: 20px; border-radius: 10px;
    z-index: 99999; font-family: 'Orbitron', monospace; text-align: center;`;
  errorDiv.innerHTML = `
    <h3>Errore di inizializzazione</h3>
    <p>${msg}</p>
    <button onclick="location.reload()" style="
      margin-top: 10px; padding: 10px 20px; background: #64c8ff; color: white; border: none; border-radius: 5px; cursor: pointer;">
      Ricarica Pagina
    </button>`;
  document.body.appendChild(errorDiv);
}

// =====================
// UI CONTROLLER
// =====================
const ui = {
  startMenu: null,
  ensureStartMenu() {
    if (!this.startMenu) {
      this.startMenu = new StartMenu({
        onStart: () => {
          console.log('[UI] StartGame dal menu iniziale');
          showLoadingScreen?.();
          updateLoadingProgress?.(0, 'Preparazione...');
          if (!gameManager.running) init();
        },
        onQuit: () => {
          console.log('[UI] Quit dal menu iniziale');
          location.reload();
        }
      });
    }
  },
  showStartMenu() {
    this.ensureStartMenu();
    this.startMenu.show(true);
    gameManager.menu?.show(false);
  },
  hideStartMenu() { this.startMenu?.show(false); },
};

// Avvio: mostra SOLO lo start menu
ui.showStartMenu();
suspendLoadingScreen?.();

// Torna allo start menu quando ricevi 'game:quit'
window.addEventListener('game:quit', () => {
  gameManager.running = false;
  gameManager.paused = false;
  ui.showStartMenu();
});

// Debug
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  window.__gameDebug = {
    showStartMenu: () => ui.showStartMenu(),
    hideStartMenu: () => ui.hideStartMenu(),
    showPauseMenu: () => gameManager.menu?.openPause(),
    hidePauseMenu: () => gameManager.menu?.show(false),
    getSettings: () => ({ ...settings }),
    restartGame: () => { gameManager.running = false; gameManager.paused = false; init(); }
  };
  console.log('[Main] Debug functions available at window.__gameDebug');
}

// Errori globali
window.addEventListener('error', (e) => { console.error('[Main] Global error:', e.error); hideLoadingScreen(); });

console.log('[Main] Sistema principale caricato, StartMenu pronto…');
