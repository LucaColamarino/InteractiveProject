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
// Se altri moduli vogliono leggerle, possono usare window.__gameSettings
const settings = (window.__gameSettings = {
  quality: 'medium',
  shadows: true,
  resScale: 1.0,
  volume: 0.7,
});

// =====================
// UI Loading
// =====================
function showLoadingScreen() {
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-screen';
  loadingDiv.innerText = 'Loading...';
  Object.assign(loadingDiv.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    color: 'white',
    fontSize: '2em',
    fontFamily: 'sans-serif',
    background: 'rgba(0, 0, 0, 0.7)',
    padding: '20px',
    borderRadius: '10px',
    zIndex: 9999,
  });
  document.body.appendChild(loadingDiv);
}

function hideLoadingScreen() {
  const loadingDiv = document.getElementById('loading-screen');
  if (loadingDiv) loadingDiv.remove();
}

// =====================
// Applicazione impostazioni del menu
// =====================
// Nota: qui non tocchiamo direttamente il renderer perché non è gestito in questo file.
// Facciamo però 2 cose utili subito:
// 1) abilitiamo/disabilitiamo le ombre "dinamiche" delle torce via budget
// 2) salviamo le impostazioni globalmente (window.__gameSettings) per l'uso in altri moduli
function applyMenuSettings(s) {
  Object.assign(settings, s);

  // Ombre fuoco: se disabiliti le ombre nelle impostazioni, azzeri il budget dinamico;
  // se abiliti, riporti a un valore sensato (puoi cambiare 3 se vuoi).
  if (settings.shadows) {
    setFireShadowBudget(3);
  } else {
    setFireShadowBudget(0);
  }

  // Qualità, resScale, volume:
  // - Altri moduli (es. renderer/setup) possono leggere window.__gameSettings per:
  //   - cambiare shadowMap.type / pixelRatio / LOD / post-processing / audio gain, ecc.
  // - In questa sede non forziamo nulla che non sia sotto il nostro controllo diretto.
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: { ...settings } }));
}

// =====================
// Inizializzazione del gioco (lazy, solo su Play)
// =====================
async function init() {
  try {
    showLoadingScreen();

    // Applica subito le impostazioni correnti (es. ombre fuoco)
    applyMenuSettings(settings);

    await preloadAssets();
    setupInput();

    await createHeightmapTerrain();
    createSky();
    addWaterPlane();

    await populateVegetation();
    spawnAreaEnemies();

    // Oggetti demo / test
    spawnCampfireAt(0, 0);
    spawntorchAt(30, 15);
    spawntorchAt(17, -20);
    spawntorchAt(-20, -15);
    spawntorchAt(3, 13);
    spawntorchAt(5, 2);
    spawnChestAt(6, 6);
    // spawnWaterAltar(); // se lo vuoi attivo

    // Player
    const result = await changeForm('human');
    player = result.player;
    controller = result.controller;
    setPlayerReference(player);

    hideLoadingScreen();

    // Avvia loop
    running = true;
    paused = false;
    startLoop(player, controller);

    // Notifica che il gioco è pronto
    window.dispatchEvent(new Event('game:started'));
  } catch (err) {
    console.error('Init error:', err);
    hideLoadingScreen();
  }
}

// =====================
// MENU: istanziazione
// =====================
const menu = new MainMenu({
  onPlay: () => {
    // Se è la prima volta: inizializza.
    // Se stiamo solo riprendendo dopo un Quit (che nel web è "torna al menu"),
    // init verrà richiamato e reinstallerà la scena.
    if (!running) {
      init();
    } else {
      // Se il gioco era già in corso ma fermo (caso raro qui), riprendi
      paused = false;
      window.dispatchEvent(new Event('game:resume'));
    }
  },
  onResume: () => {
    paused = false;
    window.dispatchEvent(new Event('game:resume'));
  },
  onQuit: () => {
    // Su Web non si può chiudere la pagina;
    // qui usiamo Quit come "torna al menu": fermi la simulazione e lasci il canvas sotto.
    paused = false;
    running = false;
    window.dispatchEvent(new Event('game:quit'));
    // Mostriamo semplicemente il menu (è già gestito dal componente).
  },
  getSettings: () => ({ ...settings }),
  applySettings: applyMenuSettings,
});

// =====================
// ESC per Pausa/Resume
// =====================
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && running) {
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
// Ridimensionamento: notifichiamo altri moduli se servisse
// =====================
window.addEventListener('resize', () => {
  window.dispatchEvent(new Event('game:resize'));
});

// =====================
// Avvio: NON chiamare init()
// Lasciamo che il menu gestisca "Play".
// =====================
// init(); // <-- rimosso: ora parte dal Main Menu
