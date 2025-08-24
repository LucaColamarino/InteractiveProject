import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { updateCamera } from './player/cameraFollow.js';
import { updateWater, terrainMaterial, updateSunPosition } from './map/map.js';
import { updateEnemies, getEnemies } from './controllers/npcController.js';
import { sun, moon } from './graphics/shadowManager.js';
import Stats from 'stats.js';
import { hudManager } from './ui/hudManager.js';
import { updateCampfires } from './objects/campfire.js';
import { pumpActions } from './systems/InputSystem.js';
// ⬇️ RIMOSSO: AnimationSystem
// import { AnimationSystem } from './systems/AnimationSystem.js';
import { interactionManager } from './systems/interactionManager.js';
import { updateChests } from './objects/chest.js';
import { updateEnvironment } from './spawners/vegetationSpawner.js';
import { updatetorchs } from './objects/torch.js';
import { updateFires } from './particles/FireParticleSystem.js';
import { LevelSystem } from './systems/LevelSystem.js';
import { gameManager } from './managers/gameManager.js';
import { initInventoryUI } from './ui/inventoryUi.js';
import { refreshInventoryUI } from './ui/inventoryBridge.js';
import { wireInventoryInteractions } from './ui/inventoryInteractions.js';

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
const clock = new THREE.Clock();

// === XP SYSTEM (single source of truth) ===
const STORAGE_KEY = 'player_xp';
export let xp = null;

function loadXP() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  xp = new LevelSystem({ startingLevel: 1, startingXP: 0 });
  xp.load(saved);
}

function saveXP() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(xp.toJSON()));
}

function renderXPHud() {
  const pill = document.getElementById('mm-level');
  const bar = document.getElementById('xp-bar');
  const text = document.getElementById('xp-text');

  if (pill) pill.textContent = `🧬 LVL ${xp.level}`;
  if (bar)  bar.style.width = `${Math.round(xp.progress * 100)}%`;
  if (text) text.textContent = `${xp.xp} / ${xp.xpToNextLevel}`;
}

function toastLevelUp(newLevel) {
  const area = document.getElementById('notifications');
  if (!area) return;
  const div = document.createElement('div');
  div.className = 'notification';
  div.textContent = `🎉 Level Up! Sei al livello ${newLevel}`;
  area.appendChild(div);
  setTimeout(() => div.remove(), 4000);

  const xpEl = document.getElementById('xp-bar');
  if (xpEl) {
    xpEl.classList.add('levelup');
    setTimeout(() => xpEl.classList.remove('levelup'), 650);
  }
}

function initXP() {
  loadXP();
  renderXPHud();

  // API globale per assegnare XP da qualsiasi punto
  window.giveXP = function(amount = 10) {
    const before = xp.level;
    const leveled = xp.addXP(Math.max(0, amount|0));
    saveXP();
    renderXPHud();
    if (leveled && xp.level > before) toastLevelUp(xp.level);
  };
}

export function startLoop(c) {
  console.log('[GameLoop] Starting main loop...');
  gameManager.controller = c;

  // ⬇️ Inventory UI
  initInventoryUI();
  wireInventoryInteractions();
  const inv = gameManager.inventory;
  if (inv?.onChange) inv.onChange(() => refreshInventoryUI());
  refreshInventoryUI();

  const controller = gameManager.controller;
  const player = controller?.player;

  // HUD & XP
  hudManager.init();
  initXP();

  function animate() {
    stats.begin();
    requestAnimationFrame(animate);

    let delta = clock.getDelta();
    delta = Math.min(delta, 0.05);

    updateSunPosition();
    if (terrainMaterial?.userData?.shaderRef?.uniforms?.time) {
      terrainMaterial.userData.shaderRef.uniforms.time.value += delta;
    }

    try {
      if (controller) {
        pumpActions(controller);    // input → controller.setInputState(...)
        controller.update(delta);   // movimento/stati (Base/HumanFormController)
        if (player) player.update(delta); // <-- ORA qui vive l’Animator
      }

      if (player?.model) {
        const pos = player.model.position;
        if (sun?.target) sun.target.position.copy(pos);
        if (moon?.target) moon.target.position.copy(pos);
      }

      updateEnemies(delta);
      updateWater(delta);
      updateCampfires(delta);
      updateFires(delta);
      updateChests(delta);
      updatetorchs(delta);
      updateCamera(player, delta);
      updateEnvironment();
      gameManager.pickableManager?.update(delta, player?.model?.position);
      interactionManager.update();
      hudManager.update(player, controller, camera, getEnemies());

      renderer.render(scene, camera);
    } catch (e) {
      console.error('🚨 Render crash:', e);
      scene.traverse(obj => {
        if (obj.isMesh && (!obj.material || !obj.geometry)) {
          console.warn('⚠️ Problema in mesh:', obj);
        }
      });
    }

    stats.end();
  }

  animate();
}
