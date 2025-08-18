import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';

const loader = new FBXLoader();
const vegetation = [];

const textureLoader = new THREE.TextureLoader();

// Precarica materiali
const barkMaterial = new THREE.MeshStandardMaterial({
  map: textureLoader.load('/textures/Bark.jpeg'),
  normalMap: textureLoader.load('/textures/Bark_Normal.jpeg'),
  roughness: 1,
});

const leafMaterial = new THREE.MeshStandardMaterial({
  map: textureLoader.load('/textures/Leaf.jpeg'),
  normalMap: textureLoader.load('/textures/Leaf_Normal.jpeg'),
  alphaMap: textureLoader.load('/textures/Leaf_Opacity.jpeg'),
  transparent: true,
  alphaTest: 0.5,
  side: THREE.DoubleSide,
  depthWrite: true,
});

async function spawnVegetation(modelPath, count, area) {
  const baseModel = await loader.loadAsync(modelPath);

  for (let i = 0; i < count; i++) {
    const clone = baseModel.clone();
    const pos = new THREE.Vector3(
      area.x + Math.random() * area.width - area.width / 2,
      0,
      area.z + Math.random() * area.depth - area.depth / 2
    );
    pos.y = getTerrainHeightAt(pos.x, pos.z);

    clone.position.copy(pos);
    clone.scale.setScalar((0.8 + Math.random() * 0.4) * 0.1);
    clone.setRotationFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));



    clone.traverse(child => {
  if (child.isMesh) {
    // Se ha più materiali, sostituisci l’intero array
    if (Array.isArray(child.material)) {
      const newMaterials = [];

      for (let i = 0; i < child.material.length; i++) {
        const matName = child.material[i].name.toLowerCase();
        if (matName.includes('leaf')) {
          newMaterials.push(leafMaterial);
        } else {
          newMaterials.push(barkMaterial);
        }
      }

      child.material = newMaterials;
    } else {
      // Se ha un solo materiale, fallback a leaf
      child.material = leafMaterial;
    }

    child.castShadow = true;
    child.receiveShadow = true;
  }
});


    scene.add(clone);
    vegetation.push(clone);
  }
}

export async function populateVegetation() {
  return;
  await spawnVegetation('/models/environment/bush.fbx', 30, { x: 0, z: 0, width: 400, depth: 400 });
  await spawnVegetation('/models/environment/bush.fbx', 40, { x: 0, z: 0, width: 600, depth: 600 });
}
