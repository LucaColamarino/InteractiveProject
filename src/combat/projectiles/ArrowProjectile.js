// src/projectiles/ArrowProjectile.js
import * as THREE from 'three';
import { scene } from '../../scene.js';
import { gameManager } from '../../managers/gameManager.js';
const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const ARROW_RADIUS  = 0.05;
const PLAYER_RADIUS = 0.8;
// === Parry  ===
const PARRY_FRONT_DEG = 60;
const PARRY_FRONT_COS = Math.cos(THREE.MathUtils.degToRad(PARRY_FRONT_DEG));
const PARRY_DIR_DOT_MAX = -0.2;
const PLAYER_LOCAL_FWD = new THREE.Vector3(0, 0, 1);

export class ArrowProjectile {
  constructor(visual, pos0, quat0, speed = 36, lifeSec = 6, opts = {}) {
    this.obj = visual;
    this.obj.position.copy(pos0);
    this.localForward = (opts.localForward || new THREE.Vector3(0, 0, -1)).clone().normalize();
    this.localUp      = (opts.localUp      || new THREE.Vector3(0, 1,  0)).clone().normalize();
    this.obj.quaternion.copy(quat0);
    this.obj.updateMatrixWorld(true);
    const fwdWorld0 = this.localForward.clone().applyQuaternion(quat0).normalize();
    this.vel = fwdWorld0.multiplyScalar(speed);
    this.roll = this._computeInitialRoll(quat0);
    this.alive = true;
    this.life = lifeSec;
    this._age = 0;
    this._prevPos = pos0.clone();
    scene.add(this.obj);
  }
  _computeInitialRoll(q) {
    const fw = this.localForward.clone().applyQuaternion(q).normalize();
    let upW  = this.localUp.clone().applyQuaternion(q).normalize();
    upW = upW.projectOnPlane(fw).normalize();
    const qAlign = new THREE.Quaternion().setFromUnitVectors(this.localForward, fw);
    let upCanon = this.localUp.clone().applyQuaternion(qAlign).projectOnPlane(fw).normalize();
    if (upW.lengthSq() < 1e-6 || upCanon.lengthSq() < 1e-6) return 0;
    const dot = THREE.MathUtils.clamp(upCanon.dot(upW), -1, 1);
    let ang = Math.acos(dot);
    const sgn = Math.sign(new THREE.Vector3().crossVectors(upCanon, upW).dot(fw));
    ang *= sgn;
    return ang;
  }
  _getPlayerHitSphere() {
    const pObj = gameManager?.controller?.player?.model;
    const center = new THREE.Vector3();
    if (pObj && pObj.isObject3D) {
      pObj.getWorldPosition(center);
    } else {
      return null;
    }
    const r =
      gameManager?.player?.hitRadius ??
      gameManager?.player?.colliderRadius ??
      PLAYER_RADIUS;
    return { center, radius: r, obj: pObj };
  }
  _isPlayerParrying() {
    return !!gameManager?.controller?.isBlocking;
  }
  _getPlayerForward(pObj) {
    const q = new THREE.Quaternion();
    pObj.getWorldQuaternion(q);
    const fwd = PLAYER_LOCAL_FWD.clone().applyQuaternion(q).normalize();
    return fwd;
  }
  _isArrowInFrontWhileParrying(playerPos, pObj, testPos) {
    if (!this._isPlayerParrying() || !pObj) return false;
    const fwd = this._getPlayerForward(pObj);
    const toArrow = new THREE.Vector3().subVectors(testPos, playerPos).normalize();

    const frontDot = fwd.dot(toArrow);
    const velDir = this.vel.clone().normalize();
    const dirDot = velDir.dot(fwd);
    if (frontDot < PARRY_FRONT_COS) {
      console.log("[ArrowProjectile] → Non è davanti al player");
      return false;
    }
    if (dirDot > PARRY_DIR_DOT_MAX) {
      console.log("[ArrowProjectile] → La freccia non viene incontro al player");
      return false;
    }

    console.log("[ArrowProjectile] → Freccia deflessa da parry!");
    return true;
  }
  static _segmentSphereHit(p0, p1, c, r) {
    const seg = new THREE.Vector3().subVectors(p1, p0);
    const segLenSq = seg.lengthSq();
    if (segLenSq < 1e-12) {
      return c.distanceToSquared(p0) <= r * r;
    }
    const t = THREE.MathUtils.clamp(
      new THREE.Vector3().subVectors(c, p0).dot(seg) / segLenSq,
      0, 1
    );
    const closest = new THREE.Vector3().copy(p0).addScaledVector(seg, t);
    return c.distanceToSquared(closest) <= r * r;
  }
  _checkHitPlayer(nextPos) {
    const sph = this._getPlayerHitSphere();
    if (!sph) return false;
    const { center, radius, obj: pObj } = sph;
    const effectiveR = radius + ARROW_RADIUS;
    const hit = ArrowProjectile._segmentSphereHit(this._prevPos, nextPos, center, effectiveR);
    if (hit) {
      console.log("[ArrowProjectile] Freccia ha colpito hit-sphere del player!");
      const deflect = this._isArrowInFrontWhileParrying(center, pObj, nextPos);
      if (deflect) {
        try {
          gameManager?.controller?.combat?.onParryDeflect?.({
            position: nextPos.clone(),
            normal: new THREE.Vector3().subVectors(nextPos, center).normalize(),
            projectile: this
          });
        } catch {}
        console.log("[ArrowProjectile] → DEFLECTED, nessun danno.");
        return 'deflected';
      }
      try {
        if (gameManager?.controller?.stats?.damage) {
          gameManager.controller.stats.damage(10);
          console.log("[ArrowProjectile] → HIT, danno applicato");
        }
      } catch (e) {
        console.warn("[ArrowProjectile] damage call failed:", e);
      }
      return true;
    }
    return false;
  }
  update(dt) {
    if (!this.alive) return;
    this.vel.addScaledVector(GRAVITY, dt);
    const nextPos = new THREE.Vector3().copy(this.obj.position).addScaledVector(this.vel, dt);
    const hitResult = this._checkHitPlayer(nextPos);
    if (hitResult) {
      this.dispose();
      return;
    }
    this._prevPos.copy(this.obj.position);
    this.obj.position.copy(nextPos);
    const v = this.vel.clone();
    if (v.lengthSq() > 1e-8) {
      const dir = v.normalize();
      const qAlign = new THREE.Quaternion().setFromUnitVectors(this.localForward, dir);
      const qRoll = new THREE.Quaternion().setFromAxisAngle(dir, this.roll);
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