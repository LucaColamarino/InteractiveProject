// combat/strategies/WandMagicStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../controllers/npcController.js';
import { hudManager } from '../../ui/hudManager.js';
import { MagicProjectile } from '../projectiles/magicProjectile.js';
import { scene } from '../../scene.js';

const TAG = '[WandMagicStrategy]';
const dlog = (...a) => {
  if (typeof window !== 'undefined' && window.__WAND_DEBUG__) console.log(TAG, ...a);
};

const DEFAULTS = {
  speed: 35,           // velocità del bolt
  cooldown: 0.45,      // tempo tra cast
  damage: 20,          // XP o danno per colpo
  boltRadius: 0.5,     // raggio di collisione "soft"
  lifetime: 2.0,       // vita del proiettile
  multishot: 1,        // numero di bolt per cast
  spreadDeg: 0,        // spread angolare tra i bolt
  homing: 0.0,         // forza di homing [0..]
  lockRange: 20,       // max distanza di auto-lock
  aimConeDeg: 18,      // cono di auto-lock
  muzzleOffset: new THREE.Vector3(0, 1.3, 0.5), // offset dal player
};

const isFiniteVec3 = (v) =>
  v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

export class WandMagicStrategy extends AttackStrategy {
  constructor() {
    super();
    Object.assign(this, DEFAULTS);

    this._cd = 0;
    this._castState = null; // { action, clip, clipName, fired }
    this._pool = [];
    this._poolSize = 24;

    this.debug = true; // pip/linee e log (toggle globale: window.__WAND_DEBUG__)

    this._tmp = {
      fwd: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      to: new THREE.Vector3(),
      muzzleWorld: new THREE.Vector3(),
      qWorld: new THREE.Quaternion(),
      qYaw: new THREE.Quaternion(),
      upWorld: new THREE.Vector3(),
      rightWorld: new THREE.Vector3(),
      posWorld: new THREE.Vector3(),
    };

    this._debugPips = [];

    dlog('constructed with defaults', { ...DEFAULTS });
  }

  onEquip(controller, weaponItem) {
    const m = weaponItem?.meta || {};
    for (const k of Object.keys(DEFAULTS)) {
      if (m[k] !== undefined) this[k] = m[k];
    }
    if (m.muzzleOffset instanceof THREE.Vector3) {
      this.muzzleOffset.copy(m.muzzleOffset);
    } else if (Array.isArray(m.muzzleOffset) && m.muzzleOffset.length === 3) {
      this.muzzleOffset.set(...m.muzzleOffset);
    }
    if (!isFiniteVec3(this.muzzleOffset)) {
      console.warn(`${TAG} invalid muzzleOffset meta, fallback to default`);
      this.muzzleOffset.set(0, 1.3, 0.5);
    }

    this._ensurePool(); // usa scene globale
    dlog('onEquip meta', m);
  }

  attack(controller, clipName = 'wandCast') {
    if (controller.isAttacking || this._cd > 0) {
      dlog('attack blocked', { isAttacking: controller.isAttacking, cd: this._cd });
      return false;
    }

    if (!this._pool.length) this._ensurePool();

    const actions = controller.player.animator?.actions || {};
    let action = actions[clipName] || actions['attack'] || null;
    if (!action) {
      const key = Object.keys(actions).find(k => k.toLowerCase().includes('attack'));
      if (key) action = actions[key];
    }
    if (!action) { dlog('attack failed: no action'); return false; }

    const chosenName = action._clipName || clipName;
    const ok = controller.player.animator?.playAction(chosenName);
    if (!ok) { dlog('playAction failed', chosenName); return false; }

    const clip = action.getClip?.() || null;
    const dur  = clip?.duration ?? 0.35;
    controller.lockMovementFor(dur);
    controller.isAttacking = true;
    this._cd = this.cooldown;

    this._castState = { action, clip, clipName: chosenName, fired: false };
    dlog('attack start', { chosenName, dur, cooldown: this._cd });
    return true;
  }

  update(controller, dt) {
    if (this._cd > 0) this._cd = Math.max(0, this._cd - dt);

    // timing & fire rispetto alla clip
    if (this._castState?.action && this._castState.clip) {
      const { action, clip } = this._castState;
      const frac = clip.duration > 0 ? (action.time / clip.duration) : 1;
      if (!this._castState.fired && frac >= 0.35) {
        dlog('fire at frac', frac.toFixed(3));
        this._fireBoltsNow(controller);
        this._castState.fired = true;
      }
      const weight = controller.player.animator?._getActionWeight?.(this._castState.clipName) ?? 0;
      const ended = !action.isRunning?.() || weight <= 0.001 || frac >= 0.999;
      if (ended) {
        dlog('attack ended', { frac: frac.toFixed(3), weight });
        this._castState = null;
        controller.isAttacking = false;
      }
    } else if (this._castState && !this._castState.fired) {
      // nessuna clip → spara subito
      dlog('no clip; immediate fire');
      this._fireBoltsNow(controller);
      this._castState.fired = true;
      this._castState = null;
      controller.isAttacking = false;
    }

    // update proiettili
    let activeCount = 0;
    for (const p of this._pool) {
      if (!p.active) continue;
      activeCount++;

      if (this.homing > 0 && p.target && p.target.alive) {
        p.steerToTarget(this.homing, dt);
      }
      p.integrate(dt);

      const hit = p.checkCollision();
      if (hit) {
        dlog('projectile hit', hit.model?.uuid || hit);
        this._onHitEnemy(hit);
        p.deactivate();
      }
    }
    if (activeCount && (Math.random() < 0.05)) dlog('active projectiles', activeCount);

    // cleanup debug pips
    if (this._debugPips.length) {
      for (let i = this._debugPips.length - 1; i >= 0; i--) {
        const o = this._debugPips[i];
        o.life -= dt;
        if (o.life <= 0) {
          o.mesh.parent?.remove(o.mesh);
          this._debugPips.splice(i, 1);
        }
      }
    }
  }

  cancel(controller) {
    dlog('cancel');
    this._castState = null;
    controller.isAttacking = false;
    for (const p of this._pool) if (p.active) p.deactivate();
  }

  // ---------- internals ----------
  _fireBoltsNow(controller) {
    if (!this._pool.length) this._ensurePool();

    const model = controller.player.model;
    model.updateMatrixWorld(true);

    // base world
    model.getWorldPosition(this._tmp.posWorld);
    model.getWorldQuaternion(this._tmp.qWorld);

    const upWorld   = this._tmp.upWorld.set(0,1,0).applyQuaternion(this._tmp.qWorld).normalize();
    const fwdWorld  = this._tmp.fwd.set(0,0,-1).applyQuaternion(this._tmp.qWorld).normalize();
    const rightWorld= this._tmp.rightWorld.set(1,0,0).applyQuaternion(this._tmp.qWorld).normalize();

    // muzzle robusto = pos + up*Y + fwd*Z + right*X (ignora localToWorld sull'offset)
    const offX = this.muzzleOffset?.x ?? 0;
    const offY = this.muzzleOffset?.y ?? 1.3;
    const offZ = this.muzzleOffset?.z ?? 0.5;

    const muzzle = this._tmp.muzzleWorld.copy(this._tmp.posWorld)
      .addScaledVector(upWorld, offY)
      .addScaledVector(fwdWorld, offZ)
      .addScaledVector(rightWorld, offX);

    if (!isFiniteVec3(muzzle)) {
      console.warn(`${TAG} muzzle NaN -> fallback`);
      muzzle.copy(this._tmp.posWorld).addScaledVector(upWorld, 1.3).addScaledVector(fwdWorld, 0.5);
    }

    dlog('muzzle & dir', { muzzle: muzzle.toArray(), fwd: fwdWorld.toArray() });
    if (this.debug && isFiniteVec3(muzzle)) this._spawnDebugPip(muzzle);

    // multishot
    const n = Math.max(1, this.multishot | 0);
    const half = (n - 1) * 0.5;

    for (let i = 0; i < n; i++) {
      const t = (n === 1) ? 0 : (i - half) / half;
      const yaw = THREE.MathUtils.degToRad((this.spreadDeg || 0) * t);
      this._spawnProjectile(muzzle, fwdWorld, upWorld, yaw, i, n);
    }
  }

  _spawnProjectile(origin, forward, upWorld, yawOffsetRad = 0, i = 0, n = 1) {
    const p = this._acquire();
    if (!p) { console.warn(`${TAG} no free projectile in pool (size=${this._poolSize})`); return; }

    this._tmp.qYaw.setFromAxisAngle(upWorld, yawOffsetRad);
    const dir = this._tmp.dir.copy(forward).applyQuaternion(this._tmp.qYaw).normalize();

    if (!isFiniteVec3(origin) || !isFiniteVec3(dir)) {
      console.warn(`${TAG} invalid origin/dir, abort`, { origin, dir });
      return;
    }

    const target = this._acquireTarget(origin, dir);
    p.radius = this.boltRadius;
    p.activate(origin, dir, this.speed, this.lifetime, target);

    dlog('spawn', {
      index: i, total: n,
      origin: origin.toArray(),
      dir: dir.toArray(),
      yawDeg: THREE.MathUtils.radToDeg(yawOffsetRad).toFixed(2),
      target: target ? (target.model?.uuid || 'enemy') : null
    });
  }

  _ensurePool() {
    const need = this._poolSize;
    const have = this._pool.length;
    if (have >= need) return;

    for (let i = have; i < need; i++) {
      this._pool.push(new MagicProjectile(scene, {
        radius: this.boltRadius,
        size: 0.28,      // visibile
        color: 0xffffff  // molto visibile
      }));
    }
    console.log(`${TAG} pool created/expanded:`, { count: this._pool.length, isScene: !!scene?.isScene });
  }

  _acquire() { return this._pool.find(p => !p.active) || null; }

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
    if (best) dlog('target acquired');
    return best;
  }

  _onHitEnemy(enemy) {
    killEnemy(enemy);
    if (typeof window !== 'undefined' && typeof window.giveXP === 'function') {
      window.giveXP(this.damage);
    }
    hudManager.showNotification('Magic Hit!');
  }

  _spawnDebugPip(worldPos) {
    const g = new THREE.SphereGeometry(0.06, 10, 10);
    const m = new THREE.MeshBasicMaterial({
      color: 0xffaa00, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending
    });
    const pip = new THREE.Mesh(g, m);
    pip.position.copy(worldPos);
    scene.add(pip);
    this._debugPips.push({ mesh: pip, life: 0.35 });
    dlog('debug pip @', worldPos.toArray());
  }
}
