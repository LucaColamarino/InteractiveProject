import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { updateCamera } from './player/cameraFollow.js';
import { changeForm } from './player/formManager.js';
import { updateWater, terrainMaterial, updateSunPosition } from './map/map.js';
import { updateEnemies, getEnemies } from './controllers/npcController.js';
import { checkTransformationAltars } from './systems/pickupSystem.js';
import { sun, moon } from './graphics/shadowManager.js';
import Stats from 'stats.js';
import { hudManager } from './ui/hudManager.js';
import { updateCampfires } from './objects/campfire.js';
import { setupInput, pumpActions } from './systems/InputSystem.js';
import { AnimationSystem } from './systems/AnimationSystem.js';
import { ActionBus } from './core/ActionBus.js';
import { interactionManager } from './systems/interactionManager.js';
import { updateChests } from './objects/chest.js';
import { updateEnvironment } from './spawners/vegetationSpawner.js';
import { updatetorchs } from './objects/torch.js';
import { updateFires } from './particles/FireParticleSystem.js';
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
const clock = new THREE.Clock();

export let player = null;
let controller = null;
let animSys = null;

async function handleFormChange(formName) {
  const result = await changeForm(formName);
  player = result.player;
  controller = result.controller;
  animSys = new AnimationSystem(player.anim, player.state);
}

export function startLoop(p, c) {
  player = p;
  controller = c;
  animSys = new AnimationSystem(player.anim, player.state);
  hudManager.init();
  ActionBus.on('jump_or_fly', ()=> controller?.jumpOrFly());
  ActionBus.on('attack_primary', ()=> controller?.attack('attack'));
  ActionBus.on('interact', ()=> { if (player) checkTransformationAltars(player, handleFormChange); });
  ActionBus.on('sit_toggle', ()=> controller?.sitToggle());
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
      // Input movimento/azioni base
      if (controller) {
      const camAngles = pumpActions(controller);
      controller.update(delta);
      if (player) player.update(delta);
      animSys.update();
      }

      if (player?.model) {
        const pos = player.model.position;
        if (sun?.target) sun.target.position.copy(pos);
        if (moon?.target) moon.target.position.copy(pos);

        // (direzione camera eventualmente usata per bussola/HUD)
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // const angle = Math.atan2(dir.x, dir.z);
        // const deg = THREE.MathUtils.radToDeg(angle);
      }

      updateEnemies(delta);
      updateWater(delta);
      updateCampfires(delta);
      updateFires(delta);
      updateChests(delta);
      updatetorchs(delta);
      updateCamera(player,delta); 
      updateEnvironment();
      interactionManager.update(player,delta);
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
