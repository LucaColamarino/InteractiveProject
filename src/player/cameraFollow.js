import * as THREE from 'three';
import { camera } from '../scene.js';
import { getCameraAngles } from '../systems/InputSystem.js';

export let offset = new THREE.Vector3(0, 3, -6);
const targetPos = new THREE.Vector3();
const targetLookAt = new THREE.Vector3();

// --- NEW: stato focus ---
const _focus = {
  active: false,
  point: new THREE.Vector3(),
  height: 1.2,     // quanto sopra al punto guardare
  stiffness: 6.0,  // quanto veloce interpola
};

export function setCameraFocus(point, { height = 1.2, stiffness = 6 } = {}) {
  _focus.active = true;
  _focus.point.copy(point);
  _focus.height = height;
  _focus.stiffness = stiffness;
}

export function clearCameraFocus() {
  _focus.active = false;
}

export function updateCamera(player, delta = 0) {
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

  const sPos = 1 - Math.exp(-6 * delta);
  targetPos.lerp(desiredPos, sPos);

  // --- NEW: se c'è un focus, guarda il focus; altrimenti il player ---
  const stiff = _focus.active ? _focus.stiffness : 6.0;
  const sLook = 1 - Math.exp(-stiff * delta);

  if (_focus.active) {
    const focusTarget = new THREE.Vector3(_focus.point.x, _focus.point.y + _focus.height, _focus.point.z);
    targetLookAt.lerp(focusTarget, sLook);
  } else {
    const playerHead = player.model.position.clone().add(new THREE.Vector3(0, 1.5, 0));
    targetLookAt.lerp(playerHead, sLook);
  }

  camera.position.copy(targetPos);
  camera.lookAt(targetLookAt);
}
