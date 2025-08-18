import * as THREE from 'three';
import { preloadAssets,changeForm } from './player/formManager.js';
import { setupInput } from './player/inputManager.js';
import { startLoop } from './gameLoop.js';
import { createHeightmapTerrain, addWaterPlane,createSky, getTerrainHeightAt } from './map/map.js';
import { spawnWaterAltar } from './objects/altar.js';
import {spawnAreaEnemies,setPlayerReference} from './spawners/npcSpawner.js';
import { populateVegetation } from './spawners/vegetationSpawner.js';
import { spawnCampfireAt } from './objects/campfire.js';
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
  await createHeightmapTerrain();
  createSky();
  addWaterPlane();
  await populateVegetation(); 
  spawnAreaEnemies();
  spawnWaterAltar(10,10, 'human');
  spawnWaterAltar(250,20, 'wyvern');
  spawnWaterAltar(-250,-20, 'werewolf');
  spawnCampfireAt(0,0);
  const result = await changeForm('human');
  player = result.player;
  controller = result.controller;
  hideLoadingScreen();
  startLoop(player, controller);
  
setPlayerReference(player);
}

init();
