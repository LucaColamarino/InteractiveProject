import * as THREE from 'three';
import { preloadAssets, changeForm } from './player/formManager.js';
import { setupInput } from './systems/InputSystem.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane, createSky } from './map/map.js';
import { spawnAreaEnemies, setPlayerReference } from './spawners/npcSpawner.js';
import { populateVegetation } from './spawners/vegetationSpawner.js';
import { spawnCampfireAt } from './objects/campfire.js';
import { spawnChestAt } from './objects/chest.js';
import { spawntorchAt } from './objects/torch.js';
import { setFireShadowBudget } from './particles/FireParticleSystem.js';
import { InventorySystem } from './systems/inventorySystem.js';
import { MainMenu } from './ui/mainMenu.js';
import {gameManager } from './managers/gameManager.js';
import {updateLoadingProgress, hideLoadingScreen, showLoadingScreen,suspendLoadingScreen} from './loading.js';
import { PickableManager } from './managers/pickableManager.js';
import { scene } from './scene.js';
import './ui/mainMenu.css';
import { allItems } from './utils/items.js';



// Impostazioni condivise con il menu.
const settings = (window.__gameSettings = {
  quality: 'medium',
  shadows: true,
  resScale: 1.0,
  volume: 0.7,
});


// =====================
// Applicazione impostazioni del menu
// =====================
function applyMenuSettings(s) {
  Object.assign(settings, s);

  // Ombre fuoco: se disabiliti le ombre nelle impostazioni, azzeri il budget dinamico
  if (settings.shadows) {
    setFireShadowBudget(3);
  } else {
    setFireShadowBudget(0);
  }

  // Notifica altri moduli del cambiamento
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: { ...settings } }));
}

// =====================
// Inizializzazione del gioco con progress tracking
// =====================
async function init() {
  try {
    

    const inventory = new InventorySystem();
    window.inventory = inventory;
    gameManager.inventory = inventory;
    gameManager.pickableManager = new PickableManager({
      scene,
      inventory,                       // così i pickup finiscono in inventario
      onPickup: (payload) => {
        console.log('[Pickup]', payload);
        // es. UI: hudManager.showToast(`Hai raccolto: ${payload.name}`);
      },
      usePointLight: true,
      interactKey: 'KeyE',             // premi E per pickup manuale (se autoPickup=false)
    });
      gameManager.pickableManager.prewarm(allItems);
    console.log('[Main] Inizializzazione del gioco...');
    // Step 1: Impostazioni (5%)
    updateLoadingProgress(5, 'Configurazione impostazioni...');
    applyMenuSettings(settings);
    await new Promise(resolve => setTimeout(resolve, 200)); // Piccola pausa visiva

    // Step 2: Asset loading (15%)
    updateLoadingProgress(15, 'Caricamento asset e risorse...');
    await preloadAssets();
    
    // Step 3: Input setup (25%)
    updateLoadingProgress(25, 'Configurazione controlli...');
    setupInput();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 4: Terrain creation (45%)
    updateLoadingProgress(45, 'Generazione terreno...');
    await createHeightmapTerrain();
    
    // Step 5: Sky and water (55%)
    updateLoadingProgress(55, 'Creazione cielo e acqua...');
    createSky();
    addWaterPlane();
    await new Promise(resolve => setTimeout(resolve, 150));

    // Step 6: Vegetation (70%)
    updateLoadingProgress(70, 'Popolamento vegetazione...');
    await populateVegetation();
    
    // Step 7: NPCs (80%)
    updateLoadingProgress(80, 'Spawn nemici...');
    spawnAreaEnemies();
    await new Promise(resolve => setTimeout(resolve, 100));

    // Step 8: Objects (90%)
    updateLoadingProgress(90, 'Posizionamento oggetti...');
    spawnCampfireAt(0, 0);
    spawntorchAt(30, 15);
    spawntorchAt(17, 20);
    spawntorchAt(-20, -15);
    spawnChestAt(6, 6);    
    //spawnChestAt(6, -6);
    //spawnChestAt(-6, -6);
    //spawnChestAt(-6, 6);
    
    // spawnWaterAltar(); // se lo vuoi attivo

    // Step 9: Player creation (95%)
    updateLoadingProgress(95, 'Inizializzazione giocatore...');
    const result = await changeForm('human');
    console.log(result.player.model.equipmentMeshes);

    gameManager.player = result.player;
    gameManager.controller = result.controller;
    setPlayerReference(gameManager.player);
    gameManager.inventory.updateEquipmentVisibility();
    await new Promise(resolve => setTimeout(resolve, 200));

    // Step 10: Final setup (100%)
    updateLoadingProgress(100, 'Finalizzazione...');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Nascondi loading screen
    hideLoadingScreen();

    // Avvia loop
    gameManager.running = true;
    gameManager.paused = false;
    startLoop(gameManager.player, gameManager.controller);

    // Notifica che il gioco è pronto
    window.dispatchEvent(new Event('game:started'));
    console.log('[Main] Gioco inizializzato con successo!');
    
  } catch (err) {
    console.error('[Main] Errore durante inizializzazione:', err);
    
    // In caso di errore, nascondi comunque il loading screen
    hideLoadingScreen();
    
    // Mostra un messaggio di errore
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(255, 0, 0, 0.9);
      color: white;
      padding: 20px;
      border-radius: 10px;
      z-index: 99999;
      font-family: 'Orbitron', monospace;
      text-align: center;
    `;
    errorDiv.innerHTML = `
      <h3>Errore di inizializzazione</h3>
      <p>${err.message || 'Errore sconosciuto'}</p>
      <button onclick="location.reload()" style="
        margin-top: 10px;
        padding: 10px 20px;
        background: #64c8ff;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      ">Ricarica Pagina</button>
    `;
    document.body.appendChild(errorDiv);
  }
}

// =====================
// MENU: istanziazione
// =====================
gameManager.menu = new MainMenu({
  onPlay: () => {
    console.log('[Main] Avvio del gioco richiesto');
    updateLoadingProgress?.(0, 'Preparazione...');
    showLoadingScreen?.();
    if (!gameManager.running) {
      init();
    } else {
      gameManager.paused = false;
      window.dispatchEvent(new Event('game:resume'));
    }
  },
  onResume: () => {
    console.log('[Main] Resume del gioco');
    gameManager.paused = false;
    window.dispatchEvent(new Event('game:resume'));
  },
  onQuit: () => {
    console.log('[Main] Quit richiesto - ritorno al menu');
    gameManager.paused = false;
    gameManager.running = false;
    window.dispatchEvent(new Event('game:quit'));
  },
  getSettings: () => ({ ...settings }),
  applySettings: applyMenuSettings,
});
const menu = gameManager.menu;
suspendLoadingScreen?.();

// =====================
// Ridimensionamento
// =====================


// =====================
// Debug: esponi funzioni globali per il debugging
// =====================
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.__gameDebug = {
    forceHideLoading: hideLoadingScreen,
    showMenu: () => menu.show(true),
    hideMenu: () => menu.show(false),
    getSettings: () => ({ ...settings }),
    restartGame: () => {
      gameManager.running = false;
      paused = false;
      init();
    }
  };
  console.log('[Main] Debug functions available at window.__gameDebug');
}

// =====================
// Gestione errori globali
// =====================
window.addEventListener('error', (e) => {
  console.error('[Main] Global error:', e.error);
  // Se siamo ancora in loading, nascondilo in caso di errore critico
  if (document.getElementById('loading-screen')?.style.display !== 'none') {
    hideLoadingScreen();
  }
});


console.log('[Main] Sistema principale caricato, in attesa del menu...');