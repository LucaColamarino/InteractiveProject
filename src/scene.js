// scene.js – renderer pronto per ombre di qualità
import * as THREE from 'three';
import { gameManager } from './managers/gameManager.js';

export const scene = new THREE.Scene();

export const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
if (gameManager) gameManager.camera = camera;
camera.position.set(0, 2, 5);

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas: document.getElementById('three-canvas')
});

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 👉 Se vuoi provare VSM (ombre più morbide/stabili):
// renderer.shadowMap.type = THREE.VSMShadowMap;
// (e nel shadowManager imposta: sun.shadow.bias = 0; sun.shadow.normalBias = 0;)
// (puoi anche usare: sun.shadow.blurSamples = 6; // richiede VSM)

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.physicallyCorrectLights = true;
renderer.toneMappingExposure = 1.1;

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
