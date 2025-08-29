import * as THREE from 'three';
import { scene } from '../scene.js';

export let sun;
export let moon;

export function createMoonLight() {
  // Luna fredda e appena percettibile
  moon = new THREE.DirectionalLight(0x8899cc, 0.15);
  moon.castShadow = false;

  // Parametri ombra (anche se disattivata, teniamo set coerenti)
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.bias = -0.00005;
  moon.shadow.normalBias = 0.01;

  moon.shadow.camera.top = 150;
  moon.shadow.camera.bottom = -150;
  moon.shadow.camera.left = -150;
  moon.shadow.camera.right = 150;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 600;
  moon.shadow.camera.updateProjectionMatrix();

  scene.add(moon);

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  moon.target = target;
}

export function createSunLight() {
  // Sole caldo/arancio (stile Souls), più intenso ma non bruciante
  sun = new THREE.DirectionalLight(0xffe6cc, 0.95);
  sun.castShadow = true;

  // Ombre più dettagliate e stabili
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 1;         // transizione molto netta
  sun.shadow.bias = -0.0003;     // meno acne
  sun.shadow.normalBias = 0.015; // meno peter-panning

  const box = 140;
  sun.shadow.camera.top = box;
  sun.shadow.camera.bottom = -box;
  sun.shadow.camera.left = -box;
  sun.shadow.camera.right = box;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.camera.updateProjectionMatrix();

  sun.position.set(100, 200, -100);
  scene.add(sun);

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  sun.target = target;
}
