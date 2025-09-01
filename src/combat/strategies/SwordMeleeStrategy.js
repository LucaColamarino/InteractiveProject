// combat/strategies/SwordMeleeStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, damageEnemy } from '../../enemies/EnemyManager.js';
import { hudManager } from '../../ui/hudManager.js';
import { scene } from '../../scene.js';

export class SwordMeleeStrategy extends AttackStrategy {
  constructor() {
    super({
      reach: 2.7,
      arcDeg: 130,
      pitchOffsetDeg: -6,
      yOffset: 1.1
    });
    this.shockCooldown = 2.0;
    this.shockFireFrac = 0.35;
    this.shockMaxRadius = 12;
    this.shockSpeed = 22;
    this.shockThickness = 1.2;
    this.shockDamageXP = 40;
    this._shockCd = 0;
    this._shockState = null;
    this._shockwaves = [];
    this.damage =60;
    this.spDamage = 30;
  }

  onEquip(controller, weaponItem) {
    super.onEquip(controller, weaponItem);
  }
  attack(controller) { return this.baseAttack(controller, 'swordAttack', 'Slash', 'attack'); }
  specialAttack(controller, clipName = 'shockwave') {
    if (controller.stats.useMana(15)) {  
    } else {
      console.log("Not enough mana!");
      return;
    }
    if (controller.isAttacking || this._shockCd > 0) return false;

    const animator = controller.player.animator;
    if (!animator) return false;

    const aliases = [clipName, 'Shockwave', 'PowerSlash', 'attack'];
    let used = null;
    for (const n of aliases) {
      if (animator.playOverlay?.(n, { loop: 'once', mode: 'full' })) { used = n; break; }
    }
    if (!used) return false;

    const dur = Math.max(0.2, animator.getClipDuration?.(used) || 0.8);
    controller.lockMovementFor?.(dur);
    controller.isAttacking = true;
    this._shockCd = this.shockCooldown;

    this._shockState = { t: 0, dur, clipName: used, fired: false };
    return true;
  }

  update(controller, dt) {
    super.update(controller, dt);
    if (this._shockCd > 0) this._shockCd = Math.max(0, this._shockCd - dt);
    if (this._shockState) {
      const s = this._shockState;
      s.t += dt;
      const frac = s.dur > 0 ? THREE.MathUtils.clamp(s.t / s.dur, 0, 1) : 1;
      if (!s.fired && frac >= this.shockFireFrac) {
        this._spawnShockwave(controller);
        s.fired = true;
      }
      if (s.t >= s.dur) {
        this._shockState = null;
        controller.isAttacking = false;
        controller.player.animator?.stopOverlay?.();
      }
    }
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      sw.radius += this.shockSpeed * dt;
      if (sw.mesh) {
        const s = Math.max(0.001, sw.radius * 2);
        sw.mesh.scale.set(s, s, 1);
        const lifeFrac = THREE.MathUtils.clamp(sw.radius / this.shockMaxRadius, 0, 1);
        sw.mesh.material.opacity = 0.45 * (1.0 - lifeFrac);
      }
      const enemies = getEnemies();
      const rMin = sw.radius - this.shockThickness * 0.5;
      const rMax = sw.radius + this.shockThickness * 0.5;
      for (const e of enemies) {
        if (!e.alive || !e.model) continue;
        const key = e.model.uuid || String(e);
        if (sw.hit.has(key)) continue;
        const dist = e.model.position.distanceTo(sw.origin);
        if (dist >= rMin && dist <= rMax) {
          sw.hit.add(key);
          damageEnemy(e,this.spDamage)
          if (typeof window !== 'undefined' && typeof window.giveXP === 'function') {
            window.giveXP(this.shockDamageXP);
          }
          hudManager.showNotification('Shockwave Hit!');
        }
      }
      if (sw.radius >= this.shockMaxRadius) {
        if (sw.mesh) sw.mesh.parent?.remove(sw.mesh);
        this._shockwaves.splice(i, 1);
      }
    }
  }
  cancel(controller) {
    super.cancel(controller);
    this._shockState = null;
    for (const sw of this._shockwaves) sw.mesh?.parent?.remove(sw.mesh);
    this._shockwaves.length = 0;
  }
  _applyHits(controller) {
    const playerObj = controller.player.model;
    if (!playerObj) return;
    const Pw = playerObj.getWorldPosition(new THREE.Vector3());
    const NEAR_R = Math.max( this._arc?.reach + 1.0, 6 );
    const near = getEnemies().filter(e => {
      if (!e.alive || !e.model) return false;
      const Ew = e.model.getWorldPosition(new THREE.Vector3());
      return Ew.distanceTo(Pw) < NEAR_R;
    });
    for (const enemy of near) {
      const key = enemy.model?.uuid || String(enemy);
      if (this._attackState.enemiesHit.has(key)) continue;

      if (this._inSwordArc(playerObj, enemy.model)) {
        this._attackState.enemiesHit.add(key);
        damageEnemy(enemy,this.damage);
        if (typeof window !== 'undefined' && typeof window.giveXP === 'function') {
          window.giveXP(30);
        }
        hudManager.showNotification('Sword Hit!');
      }
    }
  }
  _spawnShockwave(controller) {
    const model = controller.player.model;
    model.updateMatrixWorld(true);
    const origin = model.getWorldPosition(new THREE.Vector3());
    const ringGeo = new THREE.RingGeometry(0.98, 1.02, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.45, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(origin).add(new THREE.Vector3(0, 0.05, 0));
    ring.renderOrder = 999;
    scene.add(ring);
    this._shockwaves.push({ origin: origin.clone(), radius: 0.01, hit: new Set(), mesh: ring });
  }
}
