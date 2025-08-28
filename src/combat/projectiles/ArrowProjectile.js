// src/projectiles/ArrowProjectile.js
import * as THREE from 'three';
import { scene } from '../../scene.js';

const GRAVITY = new THREE.Vector3(0, -9.81, 0);

export class ArrowProjectile {
  /**
   * @param {THREE.Object3D} visual
   * @param {THREE.Vector3} pos0 (world)
   * @param {THREE.Quaternion} quat0 (world)
   * @param {number} speed
   * @param {number} lifeSec
   * @param {{localForward?:THREE.Vector3, localUp?:THREE.Vector3}} opts
   */
  constructor(visual, pos0, quat0, speed = 36, lifeSec = 6, opts = {}) {
    this.obj = visual;
    this.obj.position.copy(pos0);

    // Assi locali del modello freccia
    this.localForward = (opts.localForward || new THREE.Vector3(0, 0, -1)).clone().normalize();
    this.localUp      = (opts.localUp      || new THREE.Vector3(0, 1,  0)).clone().normalize();

    // Inizializza orientamento
    this.obj.quaternion.copy(quat0);
    this.obj.updateMatrixWorld(true);

    // Velocità iniziale lungo il forward **locale** del modello, in world
    const fwdWorld0 = this.localForward.clone().applyQuaternion(quat0).normalize();
    this.vel = fwdWorld0.multiplyScalar(speed);

    // Calcola roll iniziale da mantenere durante il volo
    this.roll = this._computeInitialRoll(quat0);

    this.alive = true;
    this.life = lifeSec;
    this._age = 0;

    scene.add(this.obj);

    if (window.DEBUG_ARROW) {
      console.log('[ArrowProjectile] spawn',
        { pos: pos0.toArray().map(v=>+v.toFixed(3)),
          speed, fwd: fwdWorld0.toArray().map(v=>+v.toFixed(3)),
          roll: +this.roll.toFixed(3) });
    }
  }

  _computeInitialRoll(q) {
    // forward e up del modello in world allo spawn
    const fw = this.localForward.clone().applyQuaternion(q).normalize();
    let upW  = this.localUp.clone().applyQuaternion(q).normalize();

    // proietta up sul piano ortogonale a fw
    upW = upW.projectOnPlane(fw).normalize();

    // "allineamento canonico" (solo forward)
    const qAlign = new THREE.Quaternion().setFromUnitVectors(this.localForward, fw);
    let upCanon = this.localUp.clone().applyQuaternion(qAlign).projectOnPlane(fw).normalize();

    if (upW.lengthSq() < 1e-6 || upCanon.lengthSq() < 1e-6) return 0;

    const dot = THREE.MathUtils.clamp(upCanon.dot(upW), -1, 1);
    let ang = Math.acos(dot);
    const sgn = Math.sign(new THREE.Vector3().crossVectors(upCanon, upW).dot(fw));
    ang *= sgn;
    return ang; // roll attorno a fw
  }

  update(dt) {
    if (!this.alive) return;

    // fisica base
    this.vel.addScaledVector(GRAVITY, dt);
    this.obj.position.addScaledVector(this.vel, dt);

    // orienta la freccia: forward locale → direzione di volo, mantenendo il roll iniziale
    const v = this.vel.clone();
    if (v.lengthSq() > 1e-8) {
      const dir = v.normalize();

      // allinea forward locale a dir
      const qAlign = new THREE.Quaternion().setFromUnitVectors(this.localForward, dir);

      // applica roll iniziale attorno a dir
      const qRoll = new THREE.Quaternion().setFromAxisAngle(dir, this.roll);

      // qFinal = qRoll * qAlign
      this.obj.quaternion.copy(qRoll.multiply(qAlign));
    }

    this._age += dt;
    if (this._age >= this.life) this.dispose();
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    if (this.obj?.parent) this.obj.parent.remove(this.obj);
  }
}

// Registro semplice
const _active = new Set();

export function spawnArrowProjectile(visual, pos, quat, speed, lifeSec, opts = {}) {
  const p = new ArrowProjectile(visual, pos, quat, speed, lifeSec, opts);
  _active.add(p);
  return p;
}

export function updateArrowProjectiles(dt) {
  for (const p of Array.from(_active)) {
    if (!p.alive) { _active.delete(p); continue; }
    p.update(dt);
    if (!p.alive) _active.delete(p);
  }
}
