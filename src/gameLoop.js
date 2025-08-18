import * as THREE from 'three';
import { renderer, scene, camera } from './scene.js';
import { updateCamera } from './player/cameraFollow.js';
import { changeForm } from './player/formManager.js';
import { updateWater,terrainMaterial,updateSunPosition } from './map/map.js';
import { updateEnemies, getEnemies } from './controllers/npcController.js';
import { getCurrentArea } from './map/areaManager.js';
import { checkTransformationAltars } from './systems/pickupSystem.js';
import { handleInput } from './player/inputManager.js';
import { sun,moon } from './graphics/shadowManager.js';
import Stats from 'stats.js';
import { hudManager } from './ui/hudManager.js';
const stats = new Stats();
stats.showPanel(0); // 0: fps, 1: ms, 2: memory
document.body.appendChild(stats.dom);
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
  hudManager.init();
  function animate() {
    stats.begin();
    requestAnimationFrame(animate);
    let delta = clock.getDelta();
    if (delta > 0.1) delta = 0.016;
    updateSunPosition();
    if (terrainMaterial?.userData?.shaderRef?.uniforms?.time) {
      terrainMaterial.userData.shaderRef.uniforms.time.value += delta;
    }
    try {

      if (controller) {
        handleInput(delta, controller);
      }

      if (player?.model) {
        const pos = player.model.position;
        //document.getElementById('coords').textContent = `X: ${pos.x.toFixed(1)}, Y: ${pos.y.toFixed(1)}, Z: ${pos.z.toFixed(1)}`;
        if(sun?.target) sun.target.position.copy(pos);
        if(moon?.target) moon.target.position.copy(pos);
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const angle = Math.atan2(dir.x, dir.z);
        const deg = THREE.MathUtils.radToDeg(angle);
      }
      updateEnemies(delta);
      updateWater(delta);
      updateCamera(player);
      checkTransformationAltars(player, handleFormChange);
      renderer.render(scene, camera);
      hudManager.update(player, controller, camera, getEnemies());
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
