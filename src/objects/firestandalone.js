// src/objects/fireStandalone.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { GPUParticleEmitter } from './FireParticles.js';

export const fires = [];

/** Spawna un fuoco standalone alle (x,z) del terreno. */
export function spawnFireAt(x, z, opts = {}) {
  const y = getTerrainHeightAt(x, z);
  const anchor = new THREE.Object3D();
  anchor.position.set(x, y, z);
  scene.add(anchor);

  // FIAMME
  const flames = new GPUParticleEmitter({
    count: 260, radius: 0.22, baseSize: 26,
    lifeRange: [0.6, 1.0], upward: 2.4, spread: 0.7, drag: 0.97,
    smoke: false, opacity: 1.0,
  });
  anchor.add(flames.points);
  // limite dimensione (anti “semicerchio”)
  flames.material.uniforms.uMaxSize.value = 110.0;

  // FUMO
  const smoke = new GPUParticleEmitter({
    count: 140, radius: 0.26, baseSize: 22,
    lifeRange: [1.4, 2.4], upward: 1.35, spread: 0.42, drag: 0.988,
    smoke: true, opacity: 0.55,
  });
  smoke.points.position.y += 0.05;
  anchor.add(smoke.points);
  smoke.material.uniforms.uMaxSize.value = 60.0;

  // LUCE con flicker
  const light = new THREE.PointLight(0xffaa66, 1.2, 9, 2);
  light.position.set(0, 0.9, 0);
  anchor.add(light);
  const rand = Math.random() * 100.0;

  const fire = {
    anchor, flames, smoke, light, rand,
    update(dt) {
      flames.update(dt);
      smoke.update(dt);
      const t = performance.now() * 0.001 + rand;
      light.intensity = 1.0 + Math.abs(Math.sin(t * 7.5)) * 0.35 + Math.random() * 0.08;
      light.color.setHSL(0.07 + Math.sin(t*0.7)*0.01, 1.0, 0.6);
    },
    dispose() {
      scene.remove(anchor);
    }
  };

  fires.push(fire);
  return fire;
}

export function updateFires(delta) {
  for (const f of fires) f.update(delta);
}
