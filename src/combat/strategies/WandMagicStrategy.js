// combat/strategies/WandMagicStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../controllers/npcController.js';
import { hudManager } from '../../ui/hudManager.js';

const DEFAULTS = {
  speed: 35, cooldown: 0.45, damage: 20,
  boltRadius: 0.5, lifetime: 2.0,
  multishot: 1, spreadDeg: 0, homing: 0.0,
  lockRange: 20, aimConeDeg: 18,
  muzzleOffset: new THREE.Vector3(0, 1.3, 0.5),
};

// Durate fade pensate per essere percettivamente “burrose”
const FADE_IN = 0.10;
const FADE_OUT = 0.12;

export class WandMagicStrategy extends AttackStrategy {
  constructor() {
    super();
    this.cooldown = DEFAULTS.cooldown; this._cd = 0;
    this.speed = DEFAULTS.speed; this.damage = DEFAULTS.damage;
    this.boltRadius = DEFAULTS.boltRadius; this.lifetime = DEFAULTS.lifetime;
    this.multishot = DEFAULTS.multishot; this.spreadDeg = DEFAULTS.spreadDeg;
    this.homing = DEFAULTS.homing; this.lockRange = DEFAULTS.lockRange;
    this.aimConeDeg = DEFAULTS.aimConeDeg;
    this.muzzleOffset = DEFAULTS.muzzleOffset.clone();

    this._castState = null;                // { action, clip, fired }
    this._pool = []; this._poolSize = 24;

    this._tmp = {
      fwd: new THREE.Vector3(), right: new THREE.Vector3(1,0,0), up: new THREE.Vector3(0,1,0),
      dir: new THREE.Vector3(), to: new THREE.Vector3(), muzzleWorld: new THREE.Vector3(),
      q: new THREE.Quaternion(),
    };
  }

  onEquip(controller, weaponItem) {
    const m = weaponItem?.meta || {};
    this.speed       = m.speed       ?? this.speed;
    this.cooldown    = m.cooldown    ?? this.cooldown;
    this.damage      = m.damage      ?? this.damage;
    this.boltRadius  = m.boltRadius  ?? this.boltRadius;
    this.lifetime    = m.lifetime    ?? this.lifetime;
    this.multishot   = m.multishot   ?? this.multishot;
    this.spreadDeg   = m.spreadDeg   ?? this.spreadDeg;
    this.homing      = m.homing      ?? this.homing;
    this.lockRange   = m.lockRange   ?? this.lockRange;
    this.aimConeDeg  = m.aimConeDeg  ?? this.aimConeDeg;

    if (m.muzzleOffset instanceof THREE.Vector3) this.muzzleOffset.copy(m.muzzleOffset);
    else if (Array.isArray(m.muzzleOffset) && m.muzzleOffset.length === 3) this.muzzleOffset.set(...m.muzzleOffset);

    this._ensurePool(controller);
  }

attack(controller, clipName = 'wandCast') {
  if (controller.isAttacking || this._cd > 0) return;

  controller.isAttacking = true;
  this._cd = this.cooldown;

  const actions = controller.player.anim?.actions || {};
  const castAction = actions[clipName] || actions['attack'] || null;
  const clip = castAction?.getClip?.();
  const castDur = clip?.duration ?? 0.35;

  controller.lockMovementFor(castDur);

  // avvia dal direttore
  controller.player.animator?.playAction(clipName) || controller.player.animator?.playAction('attack');

  // memorizza stato per il timing dello spawn
  this._castState = { action: castAction, clip, fired: false };
}

  update(controller, dt) {
    if (this._cd > 0) this._cd = Math.max(0, this._cd - dt);

  // fire a ~35% della clip (se esiste), altrimenti fallback immediato
  if (this._castState?.action && this._castState.clip) {
    const { action, clip } = this._castState;
    const frac = clip.duration > 0 ? (action.time / clip.duration) : 1;
    if (!this._castState.fired && frac >= 0.35) {
      this._fireBoltsNow(controller);
      this._castState.fired = true;
    }
  } else if (!this._castState?.fired && controller.isAttacking) {
    // se non c’è clip disponibile, spara subito
    this._fireBoltsNow(controller);
    this._castState = { fired: true };
  }

    // aggiorna proiettili (nessuna allocazione nuova)
    const pool = this._pool, tmp = this._tmp;
    for (let i = 0, n = pool.length; i < n; i++) {
      const b = pool[i]; if (!b.active) continue;

      if (this.homing > 0 && b.target && b.target.alive) {
        tmp.to.subVectors(b.target.model.position, b.mesh.position).normalize();
        b.vel.lerp(tmp.to.multiplyScalar(this.speed), Math.min(this.homing * dt, 1));
      }

      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;

      const hitEnemy = this._checkCollision(b);
      if (hitEnemy) { this._onHitEnemy(hitEnemy); this._deactivate(b); continue; }
      if (b.life <= 0) this._deactivate(b);
    }
  }

cancel(controller) {
  for (const b of this._pool) if (b.active) this._deactivate(b);
  this._castState = null;
}


  // ---------- internals ----------
  _fireBoltsNow(controller) {
    const fwd = this._tmp.fwd.set(0,0,-1)
      .applyQuaternion(controller.player.model.quaternion)
      .normalize();

    const n = Math.max(1, this.multishot | 0);
    const half = (n - 1) * 0.5;

    for (let i = 0; i < n; i++) {
      const t = (n === 1) ? 0 : (i - half) / half;
      const yaw = THREE.MathUtils.degToRad((this.spreadDeg || 0) * t);
      this._spawnBolt(controller, fwd, yaw);
    }
  }

  _ensurePool(controller) {
    if (this._pool.length) return;
    const geom = new THREE.SphereGeometry(0.12, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x66ccff, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    const root = getSceneRoot(controller.player.model);
    for (let i = 0; i < this._poolSize; i++) {
      const m = new THREE.Mesh(geom, mat.clone());
      m.visible = false; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      root.add(m);
      this._pool.push({ mesh: m, vel: new THREE.Vector3(), life: 0, active: false, target: null });
    }
  }

  _spawnBolt(controller, forward, yawOffsetRad = 0) {
    const b = this._acquire(); if (!b) return;

    const model = controller.player.model, tmp = this._tmp;
    tmp.muzzleWorld.copy(this.muzzleOffset).applyQuaternion(model.quaternion).add(model.position);

    const qYaw = tmp.q.setFromAxisAngle(tmp.up.set(0,1,0), yawOffsetRad);
    const dir = tmp.dir.copy(forward).applyQuaternion(qYaw).normalize();

    b.target = this._acquireTarget(tmp.muzzleWorld, dir);
    if (b.target && this.homing > 0) {
      tmp.to.subVectors(b.target.model.position, tmp.muzzleWorld).normalize();
      dir.lerp(tmp.to, 0.35).normalize();
    }

    b.mesh.position.copy(tmp.muzzleWorld);
    b.vel.copy(dir).multiplyScalar(this.speed);
    b.life = this.lifetime; b.active = true; b.mesh.visible = true;
  }

  _acquire() { for (const b of this._pool) if (!b.active) return b; return null; }
  _deactivate(b) { b.active = false; b.mesh.visible = false; b.target = null; }

  _acquireTarget(origin, dir) {
    const enemies = getEnemies();
    const maxDist = this.lockRange;
    const coneCos = Math.cos(THREE.MathUtils.degToRad(this.aimConeDeg));
    let best = null, bestDot = coneCos, bestDist = maxDist;

    for (const e of enemies) {
      const to = this._tmp.to.subVectors(e.model.position, origin);
      const dist = to.length(); if (dist > maxDist) continue;
      to.normalize();
      const dot = dir.dot(to);
      if (dot >= bestDot && dist <= bestDist) { bestDot = dot; bestDist = dist; best = e; }
    }
    return best;
  }

  _checkCollision(bolt) {
    const R = this.boltRadius;
    if (bolt.target && bolt.target.alive) {
      if (bolt.mesh.position.distanceTo(bolt.target.model.position) <= (R + 0.8)) return bolt.target;
    }
    for (const e of getEnemies())
      if (bolt.mesh.position.distanceTo(e.model.position) <= (R + 0.8)) return e;
    return null;
  }

  _onHitEnemy(enemy) {
    killEnemy(enemy);
    if (typeof window !== 'undefined' && typeof window.giveXP === 'function')
      window.giveXP(this.damage);
    hudManager.showNotification('Magic Hit!');
  }
}

function getSceneRoot(obj){ let r=obj; while (r.parent) r = r.parent; return r; }
function getLocomotionAction(actions, speed){
  if (!actions) return null;
  if (speed > 5)   return actions.run  || actions.walk || actions.idle || null;
  if (speed > 0.1) return actions.walk || actions.run  || actions.idle || null;
  return actions.idle || actions.walk || actions.run || null;
}
