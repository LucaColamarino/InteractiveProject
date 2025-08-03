// ✅ shadowManager.js aggiornato: luce direzionale corretta e inclinata sul terreno
import * as THREE from 'three';
import { scene } from './scene.js';
export let sun;

export function createSunLight() {
  sun = new THREE.DirectionalLight(0x88bbff, 0.8); // più blu e tenue

  sun.castShadow = true;

  sun.shadow.mapSize.set(8192, 8192);
  sun.shadow.radius = 2.5;
  sun.shadow.bias = -0.0004;

  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;

  sun.position.set(100, 200, -100); // luce alta e inclinata
  scene.add(sun);

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0); // punta verso il centro terreno
  scene.add(target);
  sun.target = target;

  const ambient = new THREE.AmbientLight(0xbfdfff, 0.6);
  scene.add(ambient);
}

export function updateSunShadowCamera(playerPos) {
  if (!sun) return;

  const range = 100;

  sun.shadow.camera.left = -range;
  sun.shadow.camera.right = range;
  sun.shadow.camera.top = range;
  sun.shadow.camera.bottom = -range;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 500;

  sun.position.set(playerPos.x + 60, playerPos.y + 120, playerPos.z - 60);
  sun.target.position.set(playerPos.x, playerPos.y - 40, playerPos.z); // guarda verso il basso
  sun.target.updateMatrixWorld();

  sun.shadow.camera.updateProjectionMatrix();
}
