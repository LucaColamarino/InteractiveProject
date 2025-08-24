import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../controllers/npcController.js';
import { hudManager } from '../../ui/hudManager.js';

export class SwordMeleeStrategy extends AttackStrategy {
  constructor() { super(); }

  onEquip(controller, weaponItem) {
    this._setArc(weaponItem?.meta?.reach, weaponItem?.meta?.arcDeg);
  }

  // Attacco base condiviso (slash)
  attack(controller) { return this.baseAttack(controller); }

  // Manteniamo la gestione hit/fine anim nel base class
  update(controller, dt) { super.update(controller, dt); }

  // Cosa succede nella finestra "attiva"
  _applyHits(controller) {
    const playerObj = controller.player.model;
    const p = playerObj.position;
    const near = getEnemies().filter(
      (e) => e.alive && e.model?.position?.distanceTo(p) < 8
    );

    for (const enemy of near) {
      const key = enemy.model?.uuid || String(enemy);
      if (this._attackState.enemiesHit.has(key)) continue;

      if (this._inSwordArc(playerObj, enemy.model)) {
        this._attackState.enemiesHit.add(key);
        killEnemy(enemy);
        if (typeof window !== 'undefined' && typeof window.giveXP === 'function') {
          window.giveXP(25);
        }
        hudManager.showNotification('Enemy Killed!');
      }
    }
  }
}
