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
import { tickTrees, drainOnce, TREE_ESSENCE_CFG, findDrainableTree, getLeafDensity } from './systems/TreeEssenceSystem.js';
import { registerTreeEssenceInteraction } from './objects/treeEssenceInteractable.js';
import { updateArrowProjectiles } from './combat/projectiles/ArrowProjectile.js';
import { updateWolfStone } from './objects/wolfStone.js';
import { updatearchersStone } from './objects/archerStone.js';
import { renderXPHud } from './ui/xpHud.js';
import { updateFireBreathTest } from './testFireBreath.js';

const LEAF_MIN_OPACITY_DURING_COOLDOWN = 0.25;

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
const clock = new THREE.Clock();
export function startLoop(c) {
  gameManager.controller = c;

  // ⬇️ Inventory UI
  initInventoryUI();
  wireInventoryInteractions();
  const inv = gameManager.inventory;
  if (inv?.onChange) inv.onChange(() => refreshInventoryUI());
  refreshInventoryUI();

  // HUD & XP
  hudManager.init();
  renderXPHud(gameManager?.controller?.stats);
  registerTreeEssenceInteraction();

  // 👉 traccia l’ultimo sito drenato per gestire la rigenerazione visiva
  let lastRegenSite = null;

  function animate() {
    stats.begin();
    requestAnimationFrame(animate);

    let delta = clock.getDelta();
    delta = Math.min(delta, 0.05);

    // 🔄 LEGGI SEMPRE IL CONTROLLER CORRENTE AD OGNI FRAME
    const ctrl   = gameManager.controller;
    const player = ctrl?.player;

    // === PAUSA ===
    if (gameManager?.isPaused || gameManager.spawner._gameEnded) {
      hudManager.updatePaused?.(player, ctrl, camera);
      renderer.render(scene, camera);
      stats.end();
      return;
    }

    // --- world time & shaders (solo se NON in pausa) ---
    tickTrees(delta);
    updateSunPosition(delta);
    if (terrainMaterial?.userData?.shaderRef?.uniforms?.time) {
      terrainMaterial.userData.shaderRef.uniforms.time.value += delta;
    }

    try {
      if (ctrl) {
        pumpActions(ctrl);           // input → controller.setInputState(...)
        ctrl.update(delta);          // movimento/stati (Base/Human/Wyvern ecc.)
        if (player) player.update(delta);  // Animator e logiche player
      }

      // ➜ FACING verso il target quando lock-on attivo
      if (player) {
        updatePlayerFacingToLock(player, delta /*, { turnSpeed: 12, yawOffset: 0 } */);
      }

      if (ctrl?.isDraining) {
        const playerPos = player?.model?.position;
        if (playerPos && !ctrl._drainSite) {
          ctrl._drainSite = findDrainableTree(playerPos);
          if (!ctrl._drainSite) ctrl.stopDrain();
        }

        if (ctrl._drainSite) {
          const ess = drainOnce(ctrl._drainSite, TREE_ESSENCE_CFG.drainPerSec, delta);

          const density = getLeafDensity(ctrl._drainSite); // 1..0
          trees?.setLeafOpacityForSite?.(ctrl._drainSite, density);
          lastRegenSite = ctrl._drainSite;

          if (ess > 0) {
            const stats = ctrl.stats;
            if (stats && typeof stats.mana === 'number' && typeof stats.maxMana === 'number') {
              const add = Math.min(ess, ctrl._manaPerSecFromTree * delta);
              const newMana = Math.min(stats.maxMana, stats.mana + add);
              if (newMana !== stats.mana) {
                stats.mana = newMana;
                stats._notify();
              }
            }
          } else {
            const site = ctrl._drainSite;
            lastRegenSite = site;
            ctrl.stopDrain();
            trees?.setLeafOpacityForSite?.(site, LEAF_MIN_OPACITY_DURING_COOLDOWN);
          }
        }
      } else if (lastRegenSite) {
        const cd = lastRegenSite.cooldown ?? 0;
        if (cd > 0) {
          trees?.setLeafOpacityForSite?.(lastRegenSite, LEAF_MIN_OPACITY_DURING_COOLDOWN);
        } else {
          const density = getLeafDensity(lastRegenSite);
          trees?.setLeafOpacityForSite?.(lastRegenSite, density);
          if (density >= 0.999) {
            trees?.setLeafOpacityForSite?.(lastRegenSite, 1);
            lastRegenSite = null;
          }
        }
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
      updateWolfStone(delta);
      updatearchersStone(delta);
      gameManager.spawner.update(delta,gameManager.controller.player.model.position);
     // updateFireBreathTest(delta);

      // ✅ queste usano già gameManager.controller (quindi ok)
      gameManager.controller?.effects?.update(delta);
      gameManager.controller?.stats?.regenStamina(delta, 8);
      //gameManager.controller?.stats?.regenMana(delta, 3);

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

