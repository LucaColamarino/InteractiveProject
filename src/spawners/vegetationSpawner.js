// vegetationSpawner.js
import { BushSpawner } from "../objects/bush";
import { TreeSpawner } from "../objects/tree.js";
import { SmallRockSpawner } from "../objects/rock.js";
import { scene, camera } from "../scene.js";
import { getTerrainHeightAt } from "../map/map.js";

let bushes = null;
export let  trees  = null;
let rocks = null;

export async function populateVegetation() {
  await Promise.all([spawnSmallRocks(),spawnBushes(),spawnTrees()]);

}

export function updateEnvironment() {
  if(trees)trees.updateLODSpatial(camera);
  if(bushes)bushes.updateLODSpatial(camera);



}

async function spawnBushes() {
 bushes = new BushSpawner({
  scene,
  getTerrainHeightAt,
  lodDistances: [30, 70, 130, 200], // 4 livelli
  lodHysteresis: 15,
  maxVisibleInstances: 500,
  useSpatialHashing: true,
  updateThrottleMs: 16
});
  const area = { x: 0, z: 0, width: 500, depth: 500 };
  await bushes.spawn('/models/environment/bush.fbx', 200, area); //400
}

async function spawnTrees() {
 trees = new TreeSpawner({
  scene,
  getTerrainHeightAt,
  lodDistances: [60, 140, 260, 400], // 4 livelli
  lodHysteresis: 15,
  maxVisibleInstances: 5000,
  useSpatialHashing: true,
  updateThrottleMs: 16
});

  const area = { x: 0, z: 0, width: 250, depth: 250 };
  await trees.spawn('/models/environment/TREE.fbx',100 , area); //200
}

async function spawnSmallRocks() {
 rocks = new SmallRockSpawner({
  scene,
  getTerrainHeightAt,
  lodDistances: [60, 140, 260, 400], // 4 livelli
  lodHysteresis: 15,
  maxVisibleInstances: 5000,
  useSpatialHashing: true,
  updateThrottleMs: 16
});

  const area = { x: 0, z: 0, width: 500, depth: 500 };
  await rocks.spawn('/models/environment/smallrock.fbx',2000 , area); //200
}




// Inizializzazione con parametri ottimizzati

// Nel loop di rendering - usa spatial update per performance migliori


