import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { updateCamera } from './cameraFollow.js';
import { getInputVector, isJumpPressed, isShiftPressed, wasJumpJustPressed } from './inputManager.js';
import { changeForm } from './formManager.js';
import { updateShadowUniforms, updateWater } from './map.js';
import { updateWalkingNpcs, updateWyverns, updateWerewolfNpcs } from './npcSpawner.js';
import { updateSunShadowCamera} from './shadowManager.js';
import { terrainMaterial } from './map.js';
import { getCurrentArea } from './areaManager.js';
import { checkTransformationAltars } from './systems/pickupSystem.js';
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
    if (terrainMaterial?.uniforms?.time) {
      terrainMaterial.uniforms.time.value += delta;
    }

    try {
      if (player) player.update(delta);
      if (player?.model) {
        const pos = player.model.position;
        document.getElementById('coords').textContent =
          `X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`;

        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const angle = Math.atan2(dir.x, dir.z);
        const deg = THREE.MathUtils.radToDeg(angle);
        let compassDir = 'N';
        if (deg >= -45 && deg < 45) compassDir = 'N';
        else if (deg >= 45 && deg < 135) compassDir = 'E';
        else if (deg >= -135 && deg < -45) compassDir = 'W';
        else compassDir = 'S';
        document.getElementById('compass').textContent = `🧭 ${compassDir}`;
        const currentArea = getCurrentArea(pos);
        document.getElementById('zone-label').innerText = `Zona: ${currentArea}`;
      }

      if (controller) {
        const moveVec = getInputVector();
        if (wasJumpJustPressed()) {
          controller.abilities.canFly ? controller.fly() : controller.jump();
        }
        controller.update(delta, moveVec, isShiftPressed(), isJumpPressed());
        document.getElementById('form-label').innerText = `Form: ${controller.abilities.canFly ? 'wyvern' : 'human'}`;
        document.getElementById('fly-indicator').style.opacity = controller.isFlying ? 1 : 0.3;

        const maxFly = controller.abilities.maxFlyTime || 100;
        const current = controller.flyTimer ?? maxFly;
        const ratio = Math.max(0, Math.min(current / maxFly, 1));
        document.getElementById('stamina-fill').style.width = `${ratio * 100}%`;


      }
      updateWyverns(delta);
      updateWalkingNpcs(delta);
      updateWerewolfNpcs(delta);
      updateWater(delta);
      if (player?.model) {
        updateSunShadowCamera(player.model.position);
        updateShadowUniforms();
      }

      updateCamera(player);
      checkTransformationAltars(player, handleFormChange);
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