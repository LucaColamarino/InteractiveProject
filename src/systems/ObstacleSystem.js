import * as THREE from 'three';

export const obstacles = [];
export function registerObstacle(o) {
  const obs = {
    type: o.type || 'cylinder',
    positionRef: o.positionRef,
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
      if (d2 < 1e-8) {
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
