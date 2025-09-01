import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { updateCamera, updatePlayerFacingToLock } from './player/cameraFollow.js';
import { updateWater, terrainMaterial, updateSunPosition } from './map/map.js';
import { updateEnemies, getEnemies } from './enemies/EnemyManager.js';
import { sun, moon } from './graphics/shadowManager.js';
import Stats from 'stats.js';
import { hudManager } from './ui/hudManager.js';
import { updateCampfires } from './objects/campfire.js';
import { pumpActions } from './systems/InputSystem.js';
import { interactionManager } from './systems/interactionManager.js';
import { updateChests } from './objects/chest.js';
import { updateEnvironment, trees } from './spawners/vegetationSpawner.js';
import { updatetorchs } from './objects/torch.js';
import { updateFires } from './particles/FireParticleSystem.js';
import { gameManager } from './managers/gameManager.js';
import { initInventoryUI } from './ui/inventoryUi.js';
import { refreshInventoryUI } from './ui/inventoryBridge.js';
import { wireInventoryInteractions } from './ui/inventoryInteractions.js';
import { updateManaTrees } from './objects/manaTree.js';
import { updateArrowProjectiles } from './combat/projectiles/ArrowProjectile.js';
import { renderXPHud } from './ui/xpHud.js';
import { updateRunicStones } from './objects/runicStones.js';
const LEAF_MIN_OPACITY_DURING_COOLDOWN = 0.25;
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
const clock = new THREE.Clock();
export function startLoop(c) {
  gameManager.controller = c;
  initInventoryUI();
  wireInventoryInteractions();
  const inv = gameManager.inventory;
  if (inv?.onChange) inv.onChange(() => refreshInventoryUI());
  refreshInventoryUI();
  hudManager.init();

  renderXPHud(gameManager?.controller?.stats);
  let lastRegenSite = null;
  function animate() {
    stats.begin();
    requestAnimationFrame(animate);
    let delta = clock.getDelta();
    delta = Math.min(delta, 0.05);
    const ctrl   = gameManager.controller;
    const player = ctrl?.player;
    if (gameManager?.isPaused || gameManager.spawner._gameEnded) {
      hudManager.updatePaused?.(player, ctrl, camera);
      renderer.render(scene, camera);
      stats.end();
      return;
    }
    updateSunPosition(delta);
    if (terrainMaterial?.userData?.shaderRef?.uniforms?.time) {
      terrainMaterial.userData.shaderRef.uniforms.time.value += delta;
    }
    try {
      if (ctrl) {
        pumpActions(ctrl);           // input → controller.setInputState(...)
        ctrl.update(delta);  
        if (player) player.update(delta);
      }
      if (player) {
        updatePlayerFacingToLock(player, delta);
      }
      if (player?.model) {
        const pos = player.model.position;
        if (sun?.target) sun.target.position.copy(pos);
        if (moon?.target) moon.target.position.copy(pos);
      }
      updateEnemies(delta);
      updateArrowProjectiles(delta);
      updateWater(delta);
      updateCampfires(delta);
      updateFires(delta);
      updateChests(delta);
      updatetorchs(delta);
      updateCamera(player, delta);
      updateEnvironment();
      updateRunicStones(delta);
      updateManaTrees(delta);
      gameManager.spawner.update(delta,gameManager.controller.player.model.position);
      gameManager.controller?.effects?.update(delta);
      gameManager.controller?.stats?.regenStamina(delta, 8);
      gameManager.controller?.stats?.regenMana(delta, 3);
      gameManager.pickableManager?.update(delta, player?.model?.position);
      interactionManager.update();
      hudManager.update(player, ctrl, camera, getEnemies());
      renderer.render(scene, camera);
    } catch (e) {
      console.error('🚨 Render crash:', e);
      scene.traverse(obj => {
        if (obj.isMesh && (!obj.material || !obj.geometry)) {
          console.warn('⚠️ Problema in mesh:', obj);
        }
      });
      renderer.render(scene, camera);
    }
    stats.end();
  }
  animate();
}

