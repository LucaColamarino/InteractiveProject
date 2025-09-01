// combat/strategies/HandMeleeStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, damageEnemy } from '../../enemies/EnemyManager.js';
import { hudManager } from '../../ui/hudManager.js';

export class HandMeleeStrategy extends AttackStrategy {
  constructor() {
    super({
      reach: 1.7,
      arcDeg: 120,
      pitchOffsetDeg: -10,
      yOffset: 1.05
    });
    this.damage = 30;
  }

  onEquip(controller, weaponItem) {
    super.onEquip(controller, weaponItem);
  }
  attack(controller) { return this.baseAttack(controller, 'punch', 'Punch', 'attack'); }
  specialAttack(_controller) {
     console.log("NO SPECIAL ATTACK");return false; }
  _applyHits(controller) {
    const playerObj = controller.player.model;
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
          window.giveXP(20);
        }
        hudManager.showNotification('Enemy Punched!');
      }
    }
  }
}
