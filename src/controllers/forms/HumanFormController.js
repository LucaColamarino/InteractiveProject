// controllers/forms/HumanFormController.js
import { BaseFormController } from './BaseFormController.js';
import { SwordMeleeStrategy } from '../../combat/strategies/SwordMeleeStrategy.js';
import { HandMeleeStrategy } from '../../combat/strategies/HandMeleeStrategy.js';
import { WandMagicStrategy } from '../../combat/strategies/WandMagicStrategy.js';

const STRATEGY_REGISTRY = {
  sword: () => new SwordMeleeStrategy(),
  greatsword: () => new SwordMeleeStrategy(),
  hand: () => new HandMeleeStrategy(),
  wand: () => new WandMagicStrategy(),
};

function getWeaponKind(item) {
  if (!item) return null;
  if (item.kind) return item.kind;
  if (item.meta?.weaponKind) return item.meta.weaponKind;
  const s = (item.id || item.meshPrefix || '').toLowerCase();
  if (s.includes('greatsword')) return 'greatsword';
  if (s.includes('sword')) return 'sword';
  if (s.includes('axe')) return 'axe';
  if (s.includes('spear') || s.includes('lance')) return 'spear';
  if (s.includes('bow')) return 'bow';
  if (s.includes('wand') || s.includes('staff')) return 'wand';
  return 'sword';
}

export class HumanFormController extends BaseFormController {
  constructor(player, abilities) {
    super(player, abilities);
    this._attackStrategy = null;
    this._equippedWeapon = null;
    this._equippedWeaponId = null;
  }

  setWeaponItem(item) {
    console.log("SETWEAPON ITEM",item);
    /*
        if (!item) {
      this._attackStrategy?.cancel?.(this);
      this._attackStrategy = null;
      this._equippedWeapon = null;
      this._equippedWeaponId = null;
      // stop eventuali azioni full rimaste
      this.player.animator.stopAction('swordAttack');
      this.player.animator.stopAction('wandCast');
      this.player.animator.stopAction('attack');
      this.isAttacking = false;
      return;
    }
    */

    if (this._equippedWeaponId && item.id === this._equippedWeaponId) return;

    const kind = getWeaponKind(item);
    const make = STRATEGY_REGISTRY[kind] || STRATEGY_REGISTRY['hand'];

    this._attackStrategy?.cancel?.(this);
    this._attackStrategy = make();
    this._attackStrategy.onEquip?.(this, item);

    this._equippedWeapon = item || null;
    this._equippedWeaponId = item?.id || null;
  }

  syncWeaponFromInventory(inventory) {
    console.log("syncWeaponFromInventory");
    const item = inventory?.equipment?.weapon || null;
    if (!item && this._equippedWeaponId !== null) { this.setWeaponItem(null); return; }
    if (item && item.id !== this._equippedWeaponId) { this.setWeaponItem(item);return; }
    this.setWeaponItem(null); return; 
  }

  /** chiamata da InputSystem con click sinistro */
  attack() {
    if (!this._attackStrategy) return;
    this._attackStrategy.attack?.(this);
  }
  block() {
    if (!this._attackStrategy) return;
    this._attackStrategy.block?.(this);
  }
  specialAttack() {
    if (!this._attackStrategy) return;
    this._attackStrategy.specialAttack?.(this);
  }

  update(dt) {
    super.update(dt);

    // rete di sicurezza: se non c'è nessuna full attiva, rilascia lo stato
    const full = this.player.animator?._activeFull || null;
    if (this.isAttacking && !full) {
      this.isAttacking = false;
    }

    this._attackStrategy?.update?.(this, dt);
  }
}
