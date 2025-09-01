import { setupInput } from './systems/InputSystem.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane, createSky, getTerrainHeightAt } from './map/map.js';
import { spawnEnemies } from './spawners/npcSpawner.js';
import { populateVegetation } from './spawners/vegetationSpawner.js';
import { spawnCampfireAt } from './objects/campfire.js';
import { spawnChestAt } from './objects/chest.js';
import { setFireShadowBudget } from './particles/FireParticleSystem.js';
import { InventorySystem } from './systems/inventorySystem.js';
import { MainMenu } from './ui/mainMenu.js';
import { StartMenu } from './ui/startMenu.js';
import {gameManager } from './managers/gameManager.js';
import { updateLoadingProgress, hideLoadingScreen, showLoadingScreen, suspendLoadingScreen } from './loading.js';
import { PickableManager } from './managers/pickableManager.js';
import { camera, renderer, scene } from './scene.js';
import { preloadAllEntities } from './utils/entityFactory.js';
import { abilitiesByForm, spawnPlayer } from './player/Player.js';
import { loadHudVitals,loadHudMap, loadHudPills } from "./ui/hudManager.js";
import { ironShield, ironSword,magicWand,ironHelmet,allItems} from './utils/items.js';
import { updateVitalsHUD } from './ui/hudVitals.js';
import { setNoGoLevel } from './systems/GroundSystem.js';
import { spawnarchersStone } from './objects/archerStone.js';
import { spawnWolfStone } from './objects/wolfStone.js';
import {HitFeedbackSystem} from "./systems/HitFeedbackSystem.js";
import { waterHeight } from './utils/entities.js';
import * as THREE from 'three';
import { loadGame, saveGame, applyPendingSave } from './managers/saveManager.js';
import { createBridge } from './objects/bridge.js';
import { deathScreen } from './ui/deathScreen.js';
import { PortalSpawner } from './spawners/portalSpawner.js';
import { victoryScreen } from './ui/victoryScreen.js';
import { bossHealth } from './ui/bossHealth.js';
import { spawnManaTreeAt } from './objects/manaTree.js';
import { PlayerBurnFX } from './particles/PlayerBurnFX.js';
const settings = (window.__gameSettings = {
  quality: 'medium',
  shadows: true,
  resScale: 1.0,
  volume: 0.7,
});
let _initializing = false;
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
async function init() {
  if (_initializing) return;
  _initializing = true;
  try {
    if(!gameManager.inventory){
      console.log("CREATING NEW INVENTORY SYSTEM");
      const inventory = new InventorySystem();
      gameManager.inventory = inventory;
    }
    const inventory = gameManager.inventory;
    gameManager.pickableManager = new PickableManager({
      scene,
      inventory,
      onPickup: (p) => console.log('[Pickup]', p),
      usePointLight: true,
      interactKey: 'KeyE',
    });
    gameManager.pickableManager.prewarm(allItems);
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
    const waterY = waterHeight;
    addWaterPlane(waterY);
    setNoGoLevel(waterY, 0.06);
    await wait(120);
    updateLoadingProgress(70, 'Populate vegetation...');
    await populateVegetation();
    updateLoadingProgress(80, 'Spawn enemies...');
    spawnEnemies();
    await wait(80);
    updateLoadingProgress(90, 'Placing objects...');
    spawnCampfireAt(-60, 65);
    spawnChestAt(-65, 60, ironSword);
    spawnChestAt(-65, 70, magicWand);
    spawnChestAt(-55, 60, ironShield);
    spawnChestAt(-55, 70, ironHelmet);
    spawnManaTreeAt(-70, 75, {
      scale: 0.005,
      maxEssence: 180, regenPerSec: 5, drainPerSec: 28, emptyCooldown: 25,
      minInteractDist: 3.0,
    });
    await spawnarchersStone({x:-55,z:90});
    await spawnWolfStone({x:-65,z:40});
    const portalSpawner = new PortalSpawner(scene, camera, () => {
       console.log("Player escaped through portal!");
      victoryScreen.show({
        title: 'YOU ESCAPED',
        sub: 'The echo of the portal fades… but destiny still calls to you.'
      });
    });
     victoryScreen.init({
      onContinue: () => {
        if (gameManager) gameManager.isPaused = false;
        gameManager.spawner._gameEnded=false;
      },
      onQuit: () => {
        window.location.href = '/';
      }
    });
    gameManager.spawner = portalSpawner;
    portalSpawner.spawn({
      position: new THREE.Vector3(-57, 50, 62),
      color: 0xff4500,
      radius: 6.0     
    });
    if(gameManager.bridgeCreated)
      createBridge({
                modelUrl: '/models/props/Bridge.fbx',
                texturesPath: '/textures/bridge',
                scale: 0.004,
                position: new THREE.Vector3(-135,getTerrainHeightAt(-135,115),115),
                rotationY: 10,
                uvTile: 2,
              });
    updateLoadingProgress(95, 'Player initialization...');
    if (!gameManager.controller) {
      console.log("CREATING NEW CONTROLLER");
      const spawnArg = gameManager.savedPos != null ? gameManager.savedPos : undefined;
      gameManager.controller = await spawnPlayer(spawnArg);
      gameManager.controller.effects = new HitFeedbackSystem({
      camera: camera,
      playerObj: gameManager.controller.player?.model,
      });
    }
    deathScreen.init({
      onRespawn: async () => {
        deathScreen.hide();
        const cp = gameManager.lastCheckpoint;
        if (cp?.position) await gameManager.respawnAt(cp.position);
        else if (gameManager?.respawnAt) await gameManager.respawnAt(new THREE.Vector3(0,0,0));
        if (gameManager) gameManager.isPaused = false;
      },
      onLoad: async () => {
        deathScreen.hide();
        if (gameManager?.loadLastSave) await gameManager.loadLastSave();
        if (gameManager) gameManager.isPaused = false;
      },
      onQuit: () => {
        window.location.href = '/';
      }
    });
    applyPendingSave();
    updateVitalsHUD(gameManager.controller.stats);
    gameManager.inventory.updateEquipmentVisibility();
    gameManager.controller.syncWeaponFromInventory(gameManager.inventory);
    gameManager.inventory.onChange(() => {
      gameManager.controller.syncWeaponFromInventory(gameManager.inventory);
    });
    gameManager.controller._burnFx = new PlayerBurnFX(gameManager.controller.player.model);
    gameManager.controller._burnFx.prewarm(renderer, scene, camera);
    await wait(80);
    updateLoadingProgress(100, 'Finalizing...')
    renderer.compile(scene, camera);
    await wait(60);
    hideLoadingScreen();
    bossHealth.init();
    gameManager.running = true;
    gameManager.paused  = false;
    startLoop(gameManager.controller);
    if (!gameManager.menu) {
      gameManager.menu = new MainMenu({
        mode: 'pause',
        onResume: () => {
          gameManager.paused = false;
          window.dispatchEvent(new Event('game:resume'));
        },
        onQuit: () => {
          saveGame();
          gameManager.paused = false;
          gameManager.running = false;
          window.location.href = '/';
          ui.showStartMenu();
        },
        getSettings: () => ({ ...settings }),
        applySettings: applyMenuSettings,
      });
      gameManager.menu.show(false);
    }
  } catch (err) {
    console.error('[Main] Error during initialization:', err);
    hideLoadingScreen();
    showFatal(err?.message || 'Errore sconosciuto');
  } finally {
    _initializing = false;
  }
}
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
const ui = {
  startMenu: null,
  ensureStartMenu() {
    if (!this.startMenu) {
      this.startMenu = new StartMenu({
        onStart: () => {
          console.log('[UI] StartGame dal menu iniziale');
          showLoadingScreen?.();
          updateLoadingProgress?.(0, 'Preparazione...');
          init();
        },
        onContinue: () => {
          console.log('[UI] ContinueGame dal menu iniziale');
          loadGame();
          showLoadingScreen?.();
          updateLoadingProgress?.(0, 'Preparazione...');
          init();
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
ui.showStartMenu();
suspendLoadingScreen?.();