import * as THREE from 'three';
import { scene } from '../scene.js';

export let sun;
export let moon;
const SHADOW_MAP_SIZE = 4096;
const SHADOW_BOX_HALF_DEFAULT = 120;
const SHADOW_DIST_DEFAULT = 280;
const SHADOW_NEAR = 1;
const SHADOW_FAR  = 700
function stabilizeDirectionalLight(light) {
  const cam = light.shadow.camera;
  const mapW = Math.max(1, light.shadow.mapSize.x);
  const width = (cam.right - cam.left);
  const worldUnitsPerTexel = Math.max(1e-5, width / mapW);
  const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
  const right = new THREE.Vector3(1,0,0).applyMatrix4(rot);
  const up    = new THREE.Vector3(0,1,0).applyMatrix4(rot);
  const fwd   = new THREE.Vector3(0,0,1).applyMatrix4(rot);

  function snapVec(v) {
    const vx = right.dot(v), vy = up.dot(v), vz = fwd.dot(v);
    const sx = Math.round(vx / worldUnitsPerTexel) * worldUnitsPerTexel;
    const sy = Math.round(vy / worldUnitsPerTexel) * worldUnitsPerTexel;
    const sz = Math.round(vz / worldUnitsPerTexel) * worldUnitsPerTexel;
    return right.clone().multiplyScalar(sx)
      .add(up.clone().multiplyScalar(sy))
      .add(fwd.clone().multiplyScalar(sz));
  }

  const center = light.target.position.clone();
  const pos    = light.position.clone();
  const snappedCenter = snapVec(center);
  const dir = pos.clone().sub(center).normalize();
  const snappedPos = snappedCenter.clone().add(dir.multiplyScalar(pos.distanceTo(center)));

  light.target.position.copy(snappedCenter);
  light.position.copy(snappedPos);
  light.target.updateMatrixWorld();
}

export function fitSunShadowToCenter(center, lightDirTowardScene, boxHalf = SHADOW_BOX_HALF_DEFAULT, dist = SHADOW_DIST_DEFAULT) {
  if (!sun) return;

  const L = lightDirTowardScene.clone().normalize();
  const pos = center.clone().sub(L.multiplyScalar(dist));
  sun.position.copy(pos);
  sun.target.position.copy(center);
  sun.target.updateMatrixWorld();

  const cam = sun.shadow.camera;
  cam.left   = -boxHalf;
  cam.right  =  boxHalf;
  cam.top    =  boxHalf;
  cam.bottom = -boxHalf;
  cam.near   = SHADOW_NEAR;
  cam.far    = SHADOW_FAR;
  cam.updateProjectionMatrix();

  stabilizeDirectionalLight(sun);
  sun.shadow.needsUpdate = true;
}

export function createMoonLight() {
  moon = new THREE.DirectionalLight(0x8899cc, 0.12);
  moon.castShadow = false;

  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.bias = -0.00005;
  moon.shadow.normalBias = 0.01;

  moon.shadow.camera.top = 150;
  moon.shadow.camera.bottom = -150;
  moon.shadow.camera.left = -150;
  moon.shadow.camera.right = 150;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 600;
  moon.shadow.camera.updateProjectionMatrix();

  scene.add(moon);

  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  moon.target = target;
}

export function createSunLight() {
  sun = new THREE.DirectionalLight(0xffe6cc, 1.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  sun.shadow.radius = 1;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.012;
  const box = SHADOW_BOX_HALF_DEFAULT;
  sun.shadow.camera.left   = -box;
  sun.shadow.camera.right  =  box;
  sun.shadow.camera.top    =  box;
  sun.shadow.camera.bottom = -box;
  sun.shadow.camera.near   = SHADOW_NEAR;
  sun.shadow.camera.far    = SHADOW_FAR;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);
  scene.add(target);
  sun.target = target;
}
