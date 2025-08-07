
import * as THREE from 'three';
import { camera } from '../scene.js';
import { getCameraAngles } from './inputManager.js';

export let offset = new THREE.Vector3(0, 3, -6);
const smoothSpeed = 0.1;
const targetPos = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();

export function updateCamera(player) {
  if (!player?.model) return;

  const { yaw, pitch } = getCameraAngles();
  const distance = offset.length();
  const offsetX = distance * Math.sin(THREE.MathUtils.degToRad(yaw)) * Math.cos(THREE.MathUtils.degToRad(pitch));
  const offsetY = distance * Math.sin(THREE.MathUtils.degToRad(pitch));
  const offsetZ = distance * Math.cos(THREE.MathUtils.degToRad(yaw)) * Math.cos(THREE.MathUtils.degToRad(pitch));

  const desiredPos = new THREE.Vector3(
    player.model.position.x + offsetX,
    player.model.position.y + offsetY + 1.5,
    player.model.position.z + offsetZ
  );
  targetPos.lerp(desiredPos, smoothSpeed);
  targetLookAt.lerp(player.model.position.clone().add(new THREE.Vector3(0, 1.5, 0)), smoothSpeed);

  camera.position.copy(targetPos);
  camera.lookAt(targetLookAt);
}
