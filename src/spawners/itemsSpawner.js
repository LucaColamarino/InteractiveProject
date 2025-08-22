
import * as THREE from 'three';
  import { gameManager } from "../gameManager.js";
  import { ironSword, magicWand, bronzeHelmet } from "../items.js";
  import { getTerrainHeightAt } from '../map/map.js';
  
  export async function SpawnItems() {
    const pickableManager = gameManager.pickableManager;
      await pickableManager.spawnItem(
    ironSword,
    new THREE.Vector3(10, getTerrainHeightAt(10,6), 6),
    { autoPickup: false, pickupRadius: 1.5 }
  );

  // spawn con pickup a tasto (premi E quando vicino)
  await pickableManager.spawnItem(
    magicWand,
    new THREE.Vector3(14, getTerrainHeightAt(14,9), 9),
    { autoPickup: false, pickupRadius: 1.5 }
  );

  await pickableManager.spawnItem(
    bronzeHelmet,
    new THREE.Vector3(12, getTerrainHeightAt(12,12), 12),
    { autoPickup: false, pickupRadius: 1.5 }
  );
  
  }
  

  

  
  
  
  // Inizializzazione con parametri ottimizzati
  
  // Nel loop di rendering - usa spatial update per performance migliori
  
  
  