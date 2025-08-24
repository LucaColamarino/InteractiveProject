// combat/strategies/BowRangedStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../controllers/npcController.js';
import { hudManager } from '../../ui/hudManager.js';

export class BowRangedStrategy extends AttackStrategy {
  constructor() { super(); this.cooldown = 0.5; this._cd = 0; this.projectileSpeed = 30; }

   onEquip(controller, weaponItem) {
    this.projectileSpeed = weaponItem?.meta?.speed ?? 30;
    this.cooldown = weaponItem?.meta?.cooldown ?? 0.5;
   }

// dentro BowRangedStrategy
attack(controller, clipName='shoot') {
  if (controller.isAttacking || this._cd > 0) return;

  controller.isAttacking = true;              // segnale alto-livello
  this._cd = this.cooldown;

  const actions = controller.player.anim?.actions || {};
  const act = actions[clipName] || actions['attack'] || null;
  const dur = act?.getClip?.()?.duration ?? 0.35;

  controller.lockMovementFor(dur * 0.6);      // piccolo freeze
  controller.player.animator?.playAction(clipName) || controller.player.animator?.playAction('attack');

  // spara subito (ranged feeling reattivo)
  this._spawnProjectile(controller);
  // NON mettere isAttacking=false qui: ci pensa il controller quando finisce la clip
}

update(controller, dt) {
  if (this._cd > 0) this._cd -= dt;
}

  cancel(controller) { controller.isAttacking = false; }

  _spawnProjectile(controller) {
    // versione semplice: colpisci il nemico più vicino nella direzione di vista
    const origin = controller.player.model.position.clone();
    const dir = new THREE.Vector3(0,0,-1).applyQuaternion(controller.player.model.quaternion).normalize();

    const candidates = getEnemies().filter(e => e.alive);
    let best = null, bestDot = 0;
    for (const e of candidates) {
      const to = e.model.position.clone().sub(origin).normalize();
      const d = dir.dot(to);
      if (d > 0.95 && d > bestDot) { best = e; bestDot = d; } // entro un cono stretto
    }
    if (best) {
      killEnemy(best);
      if (typeof window !== 'undefined' && typeof window.giveXP === 'function') window.giveXP(20);
      hudManager.showNotification("Headshot!");
    }
  }
}
