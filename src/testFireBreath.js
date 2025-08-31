// testFireBreath.js
import * as THREE from 'three';
import { scene } from './scene';
import { FireBreathCone } from './particles/FireBreathCone';
import { getTerrainHeightAt } from './map/map';

let fireTest;

export function initFireBreathTest() {
  fireTest = new FireBreathCone({
    length: 30,
    radius: 1.5,
    intensity: 70
  });

  // spawn a 2 metri da terra davanti al player
  fireTest.group.position.set(0, getTerrainHeightAt(0,-5)+3, -5);
  scene.add(fireTest.group);

  // attivalo subito
  fireTest.setActive(true);
}

export function updateFireBreathTest(dt) {
  if (fireTest) fireTest.update(dt);
}
