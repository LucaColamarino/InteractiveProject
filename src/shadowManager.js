// ✅ shadowManager.js aggiornato: luce direzionale corretta e inclinata sul terreno
import * as THREE from 'three';
import { scene } from './scene.js';
export let sun;

export function createSunLight() {
  sun = new THREE.DirectionalLight(0x88bbff, 0.8); // più blu e tenue

  sun.castShadow = true;

  sun.shadow.mapSize.set(16384,16384);
  sun.shadow.radius = 2.5;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.02;

  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1000;
  sun.shadow.camera.updateProjectionMatrix();


  sun.position.set(100, 200, -100); // luce alta e inclinata
  scene.add(sun);

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0); // punta verso il centro terreno
  scene.add(target);
  sun.target = target;

  const ambient = new THREE.AmbientLight(0xbfdfff, 0.6);
  scene.add(ambient);
}

