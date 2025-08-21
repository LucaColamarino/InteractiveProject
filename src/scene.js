// 🔧 Updated scene.js for high-quality shadows
import * as THREE from 'three';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0a0a0);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);


export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas: document.getElementById('three-canvas')
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;


renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // da 2 -> 1.5
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
