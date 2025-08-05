import * as THREE from 'three';
import { camera } from './scene.js';
import { setInputState } from './core/playerController.js';

export const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  space: false,
  shift: false,
  control: false,
};

let yaw = 0;
let pitch = 15;

export function getCameraAngles() {
  return { yaw, pitch };
}

let prevSpace = false;
export function wasJumpJustPressed() {
  const current = keys.space;
  const justPressed = current && !prevSpace;
  prevSpace = current;
  return justPressed;
}

export function setupInput() {
  document.addEventListener('keydown', (e) => {
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = true;
    console.log(`Key down: ${key}`, keys[key]);
  });

  document.addEventListener('keyup', (e) => {
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (keys.hasOwnProperty(key)) keys[key] = false;
  });

  document.addEventListener('mousemove', (e) => {
    yaw -= e.movementX * 0.2;
    pitch += e.movementY * 0.2;
    pitch = THREE.MathUtils.clamp(pitch, -30, 89);
  });

  window.addEventListener('click', () => {
    document.body.requestPointerLock();
  });

  window.addEventListener('contextmenu', e => e.preventDefault());
}

export function getInputVector() {
  const input = new THREE.Vector3(
    (keys.a ? 1 : 0) - (keys.d ? 1 : 0),
    0,
    (keys.w ? 1 : 0) - (keys.s ? 1 : 0)
  );

  if (input.lengthSq() === 0) return input;

  input.normalize();

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3();
  right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const moveDir = new THREE.Vector3();
  moveDir.addScaledVector(forward, input.z);
  moveDir.addScaledVector(right, -input.x);

  return moveDir.normalize();
}

export function handleInput(delta, controller) {
  const moveVec = getInputVector();
  const inputState = {
    moveVec,
    isShiftPressed: keys.shift,
    isJumpPressed: keys.space,
  };

  setInputState(inputState);

  if (wasJumpJustPressed()) {
    controller.abilities.canFly ? controller.fly() : controller.jump();
  }

  controller.update(delta);
}
