import * as THREE from 'three';
import { preloadAssets, changeForm } from './player/formManager.js';
import { setupInput } from './systems/InputSystem.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane, createSky } from './map/map.js';
import { spawnWaterAltar } from './objects/altar.js';
import { spawnAreaEnemies, setPlayerReference } from './spawners/npcSpawner.js';
import { populateVegetation } from './spawners/vegetationSpawner.js';
import { spawnCampfireAt } from './objects/campfire.js';
import { spawnChestAt } from './objects/chest.js';
import { spawntorchAt } from './objects/torch.js';
import { setFireShadowBudget } from './particles/FireParticleSystem.js';

// === MENU ===
import { MainMenu } from './ui/mainMenu.js';
import './ui/mainMenu.css';

// =====================
// Stato globale semplice
// =====================
let player = null;
let controller = null;
let running = false; // gioco partito
let paused = false;  // in pausa?

// Impostazioni condivise con il menu.
const settings = (window.__gameSettings = {
  quality: 'medium',
  shadows: true,
  resScale: 1.0,
  volume: 0.7,
});

// =====================
// UI Loading - USA IL SISTEMA GIÀ PRESENTE IN INDEX.HTML
// =====================
function updateLoadingProgress(percent, message = '') {
  // Usa le funzioni globali esposte da index.html
  if (window.gameUI && typeof window.gameUI.updateLoadingProgress === 'function') {
    window.gameUI.updateLoadingProgress(percent,message);
  }
  
  // Aggiorna anche il messaggio se presente
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen && message) {
    let messageEl = loadingScreen.querySelector('.loading-message');
    if (!messageEl) {
      messageEl = document.createElement('p');
      messageEl.className = 'loading-message';
      messageEl.style.cssText = 'color: #64c8ff; margin-top: 1rem; font-family: "Orbitron", monospace;';
      loadingScreen.appendChild(messageEl);
    }
    messageEl.textContent = message;
  }
}

function hideLoadingScreen() {
  // Usa la funzione globale esposta da index.html
  if (window.gameUI && typeof window.gameUI.hideLoadingScreen === 'function') {
    window.gameUI.hideLoadingScreen();
    return;
  }
  
  // Fallback se le funzioni globali non sono disponibili
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 500);
  }
}

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
    spawntorchAt(17, -20);
    spawntorchAt(-20, -15);
    spawntorchAt(3, 13);
    spawntorchAt(5, 2);
    spawnChestAt(6, 6);
    // spawnWaterAltar(); // se lo vuoi attivo

    // Step 9: Player creation (95%)
    updateLoadingProgress(95, 'Inizializzazione giocatore...');
    const result = await changeForm('human');
    player = result.player;
    controller = result.controller;
    setPlayerReference(player);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Step 10: Final setup (100%)
    updateLoadingProgress(100, 'Finalizzazione...');
    await new Promise(resolve => setTimeout(resolve, 300));

    // Nascondi loading screen
    hideLoadingScreen();

    // Avvia loop
    running = true;
    paused = false;
    startLoop(player, controller);

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
const menu = new MainMenu({
  onPlay: () => {
    console.log('[Main] Avvio del gioco richiesto');
    window.gameUI?.updateLoadingProgress?.(0, 'Preparazione...');
    window.gameUI?.showLoadingScreen?.();
    if (!running) {
      init();
    } else {
      paused = false;
      window.dispatchEvent(new Event('game:resume'));
    }
  },
  onResume: () => {
    console.log('[Main] Resume del gioco');
    paused = false;
    window.dispatchEvent(new Event('game:resume'));
  },
  onQuit: () => {
    console.log('[Main] Quit richiesto - ritorno al menu');
    paused = false;
    running = false;
    window.dispatchEvent(new Event('game:quit'));
  },
  getSettings: () => ({ ...settings }),
  applySettings: applyMenuSettings,
});
window.gameUI?.suspendLoadingScreen?.();
// =====================
// ESC per Pausa/Resume
// =====================
window.addEventListener('keydown', (e) => {
  const isLoadingHidden = document.getElementById('loading-screen')?.style.display === 'none';
if (e.code === 'Escape' && running && isLoadingHidden) {
  // ...


    paused = !paused;
    if (paused) {
      menu.openPause();
      document.exitPointerLock?.();
      window.dispatchEvent(new Event('game:pause'));
    } else {
      menu.show(false);
      document.querySelector('canvas')?.requestPointerLock?.();
      window.dispatchEvent(new Event('game:resume'));
    }
  }
});

// =====================
// Ridimensionamento
// =====================
window.addEventListener('resize', () => {
  window.dispatchEvent(new Event('game:resize'));
});

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
      running = false;
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

window.addEventListener('unhandledrejection', (e) => {
  console.error('[Main] Unhandled promise rejection:', e.reason);
  // Se siamo ancora in loading, nascondilo in caso di errore critico
  if (document.getElementById('loading-screen')?.style.display !== 'none') {
    hideLoadingScreen();
  }
});

console.log('[Main] Sistema principale caricato, in attesa del menu...');