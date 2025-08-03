import * as THREE from 'three';
import { preloadAssets,changeForm } from './formManager.js';
import { setupInput } from './inputManager.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane } from './map.js';
import { spawnMagicStone } from './pickupSystem.js';
import { spawnFlyingWyvern, spawnWalkingNpc } from './npcSpawner.js';

let player = null;
let controller = null;


async function init() {
  await preloadAssets();
  setupInput();
  createHeightmapTerrain();
  addWaterPlane();
  await spawnFlyingWyvern(new THREE.Vector3(100, 60, 100));
  await spawnFlyingWyvern(new THREE.Vector3(-50, 70, -100));
  //await spawnWalkingNpc(new THREE.Vector3(20, 0, 20));
  //await spawnWalkingNpc(new THREE.Vector3(-100, 0, 150));
  spawnMagicStone(new THREE.Vector3(10, 20, 0), 'bird');
  const result = await changeForm('human');
  player = result.player;
  controller = result.controller;
  startLoop(player, controller);
}


init();
