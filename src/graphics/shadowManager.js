import * as THREE from 'three';
import { scene } from '../scene.js';
export let sun;
export let moon;

export function createMoonLight() {
  moon = new THREE.DirectionalLight(0xaaaaff, 0.2); // tenue ma visibile
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048); // meno risoluzione del sole
  moon.shadow.bias = -0.0001;
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
  sun = new THREE.DirectionalLight(0x88bbff, 0.8);

  sun.castShadow = true;

  sun.shadow.mapSize.set(16384,16384);
  sun.shadow.radius = 2.5;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.001;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1000;
  sun.shadow.camera.updateProjectionMatrix();


  sun.position.set(100, 200, -100); 
  scene.add(sun);

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  sun.target = target;

  const ambient = new THREE.AmbientLight(0xbfdfff, 0.6);
  scene.add(ambient);
}

