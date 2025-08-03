import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { updateCamera } from './cameraFollow.js';
import { getInputVector, isJumpPressed, isShiftPressed, wasJumpJustPressed } from './inputManager.js';
import { checkStonePickup } from './pickupSystem.js';
import { changeForm } from './formManager.js';
import { updateShadowUniforms, updateWater } from './map.js';
import { updateWalkingNpcs, updateWyverns } from './npcSpawner.js';
import { updateSunShadowCamera, sun } from './shadowManager.js';

const clock = new THREE.Clock();

let player = null;
let controller = null;

async function handleFormChange(formName) {
  const result = await changeForm(formName);
  player = result.player;
  controller = result.controller;
}

export function startLoop(p, c) {
  player = p;
  controller = c;

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    try {
      if (player) player.update(delta);

      if (controller) {
        const moveVec = getInputVector();
        if (wasJumpJustPressed()) {
          controller.abilities.canFly ? controller.fly() : controller.jump();
        }
        controller.update(delta, moveVec, isShiftPressed(), isJumpPressed());
        document.getElementById('form-label').innerText = `Form: ${controller.abilities.canFly ? 'bird' : 'human'}`;
        document.getElementById('fly-indicator').style.opacity = controller.isFlying ? 1 : 0.3;

        const maxFly = controller.abilities.maxFlyTime || 100;
        const current = controller.flyTimer ?? maxFly;
        const ratio = Math.max(0, Math.min(current / maxFly, 1));
        document.getElementById('stamina-fill').style.width = `${ratio * 100}%`;


      }
      updateWyverns(delta);
      updateWalkingNpcs(delta);
      updateWater(delta);
      if (player?.model) {
        updateSunShadowCamera(player.model.position);
        updateShadowUniforms();
      }

      updateCamera(player);
      checkStonePickup(player, handleFormChange);
      renderer.render(scene, camera);
    } catch (e) {
      console.error('🚨 Render crash:', e);
      scene.traverse(obj => {
        if (obj.isMesh && (!obj.material || !obj.geometry)) {
          console.warn('⚠️ Problema in mesh:', obj);
        }
      });
    }
  }

  animate();
}