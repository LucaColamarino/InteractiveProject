// controllers/forms/HumanFormController.js
import { BaseFormController } from './BaseFormController.js';
import { SwordMeleeStrategy } from '../../combat/strategies/SwordMeleeStrategy.js';
import { BowRangedStrategy } from '../../combat/strategies/BowRangedStrategy.js';

const STRATEGY_REGISTRY = {
  sword: () => new SwordMeleeStrategy(),
  greatsword: () => new SwordMeleeStrategy(), // puoi parametrizzare reach/arcDeg
  bow: () => new BowRangedStrategy(),
  wand: () => new BowRangedStrategy(),        // o una MagicBoltStrategy dedicata
};

function getWeaponKind(item) {
  if (!item) return null;
  // 1) se già presente un campo dedicato
  if (item.kind) return item.kind;              // es. 'sword' | 'bow' | ...
  if (item.meta?.weaponKind) return item.meta.weaponKind;
  // 2) fallback su id/meshPrefix
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
    this._invUnsub = null;
  }

  setWeaponItem(item) {
    // disarma
    if (!item) {
      this._equippedWeapon = null;
      this._equippedWeaponId = null;
      this._attackStrategy?.cancel?.(this);
      this._attackStrategy = null;
      return;
    }
    // se è la stessa arma, non fare nulla
    if (this._equippedWeaponId && item.id === this._equippedWeaponId) return;
    // cambia strategia in base al tipo arma logico
    const kind = getWeaponKind(item);
    const make = STRATEGY_REGISTRY[kind] || STRATEGY_REGISTRY['sword'];
    this._attackStrategy?.cancel?.(this);
    this._attackStrategy = make();
    this._attackStrategy.onEquip?.(this, item);

    this._equippedWeapon = item;
    this._equippedWeaponId = item.id || null;
  }
  // chiamala quando cambia l'inventario (o farla girare in update con polling leggero)
  syncWeaponFromInventory(inventory) {
    const item = inventory?.equipment?.weapon || null;
    if (!item && this._equippedWeaponId !== null) {
      this.setWeaponItem(null);
      return;
    }
    if (item && item.id !== this._equippedWeaponId) {
      this.setWeaponItem(item);
    }
  }

  attack(clipName) {
    if (!this._attackStrategy) return; // niente arma equip
    // clip di default per arma (se non specificato)
    if (!clipName) {
      const kind = getWeaponKind(this._equippedWeapon);
      clipName = (kind === 'bow' || kind === 'wand') ? 'shoot' : 'attack';
    }
    this._attackStrategy.attack(this, clipName);
  }

  update(dt) {
    super.update(dt);
    this._attackStrategy?.update?.(this, dt);
  }
}
