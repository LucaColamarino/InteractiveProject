// combat/strategies/HandMeleeStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../enemies/EnemyManager.js';
import { hudManager } from '../../ui/hudManager.js';

export class HandMeleeStrategy extends AttackStrategy {
  constructor() {
    // Arc più corto e stretto per i pugni
    super({
      reach: 1.7,
      arcDeg: 120,
      pitchOffsetDeg: -10,
      yOffset: 1.05
    });
  }

  onEquip(controller, weaponItem) {
    super.onEquip(controller, weaponItem);
  }

  // Attacco base = pugno
  attack(controller) { return this.baseAttack(controller, 'punch', 'Punch', 'attack'); } // (baseAttack ora già passa mode:'full')


  // Nessun speciale di default (si può aggiungere)
  specialAttack(_controller) { return false; }

  // Override: danno dello slash base
  _applyHits(controller) {
    const playerObj = controller.player.model;
    const Pw = playerObj.getWorldPosition(new THREE.Vector3());
    const NEAR_R = Math.max( this._arc?.reach + 1.0, 6 );
    const near = getEnemies().filter(e => {
      if (!e.alive || !e.model) return false;
      const Ew = e.model.getWorldPosition(new THREE.Vector3());
      return Ew.distanceTo(Pw) < NEAR_R;
    });
    console.log("NEAR ENEMIES",near);
    for (const enemy of near) {
      const key = enemy.model?.uuid || String(enemy);
      if (this._attackState.enemiesHit.has(key)) continue;

      if (this._inSwordArc(playerObj, enemy.model)) {
        this._attackState.enemiesHit.add(key);
        killEnemy(enemy);
        if (typeof window !== 'undefined' && typeof window.giveXP === 'function') {
          window.giveXP(20);
        }
        hudManager.showNotification('Enemy Punched!');
      }
    }
  }
}
