import * as THREE from 'three';
import { scene } from './scene.js';

const magicStones = [];

export function spawnMagicStone(position, formName = 'bird') {
  const geometry = new THREE.SphereGeometry(0.5, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x55aaff,
    emissive: 0x223344,
  });

  const stone = new THREE.Mesh(geometry, material);
  stone.position.copy(position);
  stone.userData.formName = formName;

  stone.castShadow = true;
  scene.add(stone);
  magicStones.push(stone);
}

export function checkStonePickup(player, onFormChange) {
  if (!player?.model) return;

  const playerPos = player.model.position;

  for (let i = magicStones.length - 1; i >= 0; i--) {
    const stone = magicStones[i];
    const distance = playerPos.distanceTo(stone.position);

    if (distance < 1.5) {
      const newForm = stone.userData.formName;
      onFormChange(newForm); 
      scene.remove(stone);
      magicStones.splice(i, 1);
      break;
    }
  }
}
