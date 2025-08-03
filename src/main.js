import * as THREE from 'three';
import { preloadAssets,changeForm } from './formManager.js';
import { setupInput } from './inputManager.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane } from './map.js';
import { spawnMagicStone } from './pickupSystem.js';
import { spawnFlyingWyvern, spawnWalkingNpc } from './npcSpawner.js';

let player = null;
let controller = null;
function showLoadingScreen() {
  const loadingDiv = document.createElement('div');
  loadingDiv.id = 'loading-screen';
  loadingDiv.innerText = 'Loading...';
  loadingDiv.style.position = 'absolute';
  loadingDiv.style.top = '50%';
  loadingDiv.style.left = '50%';
  loadingDiv.style.transform = 'translate(-50%, -50%)';
  loadingDiv.style.color = 'white';
  loadingDiv.style.fontSize = '2em';
  loadingDiv.style.fontFamily = 'sans-serif';
  loadingDiv.style.background = 'rgba(0, 0, 0, 0.7)';
  loadingDiv.style.padding = '20px';
  loadingDiv.style.borderRadius = '10px';
  loadingDiv.style.zIndex = 9999;
  document.body.appendChild(loadingDiv);
}

function hideLoadingScreen() {
  const loadingDiv = document.getElementById('loading-screen');
  if (loadingDiv) loadingDiv.remove();
}


async function init() {
  showLoadingScreen();
  await preloadAssets();
  setupInput();
  createHeightmapTerrain();
  addWaterPlane();
  await spawnFlyingWyvern(new THREE.Vector3(100, 60, 100));
  await spawnFlyingWyvern(new THREE.Vector3(-50, 70, -100));
  spawnMagicStone(new THREE.Vector3(10, 6, 0), 'bird');
  const result = await changeForm('human');
  player = result.player;
  controller = result.controller;
  hideLoadingScreen();
  startLoop(player, controller);
}

init();
