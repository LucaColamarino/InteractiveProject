// Semplice registry di ostacoli "statici" per collisioni in XZ.
// Tipo di default: "cylinder" (usa solo raggio in XZ); opzionalmente "sphere".
import * as THREE from 'three';

export const obstacles = []; // { type, positionRef, radius, halfHeight?, userData? }

export function registerObstacle(o) {
  const obs = {
    type: o.type || 'cylinder',
    positionRef: o.positionRef,              // THREE.Vector3 (reference!)
    radius: Math.max(0.01, o.radius || 0.5),
    halfHeight: o.halfHeight ?? 0.5,
    userData: o.userData || {},
    _debugMesh: null,
  };
  obstacles.push(obs);
  return obs;
}

export function unregisterObstacle(obs) {
  const i = obstacles.indexOf(obs);
  if (i !== -1) obstacles.splice(i, 1);
  if (obs._debugMesh?.parent) obs._debugMesh.parent.remove(obs._debugMesh);
}

export function queryObstaclesAround(posXZ, radius = 3.0, out = []) {
  out.length = 0;
  const r2 = radius * radius;
  for (const o of obstacles) {
    const p = o.positionRef;
    const dx = p.x - posXZ.x;
    const dz = p.z - posXZ.z;
    const d2 = dx * dx + dz * dz;
    if (d2 <= r2) out.push(o);
  }
  return out;
}

// Push-out semplice in XZ tra un cerchio (player) e gli ostacoli cilindrici/sferici
export function resolveObstaclesXZ(posXZ, playerRadius = 0.4, margin = 1e-3) {
  const tmp = [];
  queryObstaclesAround(posXZ, 4.0, tmp);
  for (const o of tmp) {
    const p = o.positionRef;
    let dx = posXZ.x - p.x;
    let dz = posXZ.z - p.z;
    let d2 = dx * dx + dz * dz;
    const minR = playerRadius + o.radius;
    const minR2 = minR * minR;

    if (d2 < minR2) {
      if (d2 < 1e-8) { // esattamente sopra → spingi in direzione arbitraria
        dx = 1e-4; dz = 0; d2 = 1e-8;
      }
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const push = (minR - d) + margin;
      posXZ.x += nx * push;
      posXZ.z += nz * push;
    }
  }
}

// Debug opzionale: mostra il cilindro della hitbox
export function makeDebugHitbox(obstacle, scene, color = 0x00ffff) {
  const r = obstacle.radius;
  const h = (obstacle.halfHeight ?? 0.5) * 2;
  const geo = new THREE.CylinderGeometry(r, r, h, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({ wireframe: true, color, depthTest: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(obstacle.positionRef);
  mesh.position.y += h * 0.5; // centra sul suolo
  obstacle._debugMesh = mesh;
  scene.add(mesh);

  // segui la posizione della chest
  mesh.userData._tick = () => {
    mesh.position.x = obstacle.positionRef.x;
    mesh.position.z = obstacle.positionRef.z;
  };
  return mesh;
}
