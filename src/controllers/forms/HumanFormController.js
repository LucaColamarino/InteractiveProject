// controllers/forms/HumanFormController.js
import * as THREE from 'three';
import { BaseFormController } from './BaseFormController.js';
import { SwordMeleeStrategy } from '../../combat/strategies/SwordMeleeStrategy.js';
import { HandMeleeStrategy } from '../../combat/strategies/HandMeleeStrategy.js';
import { WandMagicStrategy } from '../../combat/strategies/WandMagicStrategy.js';

// 👇 nuovi import per trasformazione (stessi path usati nel Base)
import { instantiateEntity, buildMixerAndActions } from '../../utils/entityFactory.js';
import { ENTITY_CONFIG } from '../../utils/entities.js';
import { Animator } from '../../components/Animator.js';
import { offset as camOffset } from '../../player/cameraFollow.js';

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

  // ============== TRASFORMAZIONE QUI ==============
  /**
   * Trasforma il player in una forma (default 'wyvern') e installa
   * il controller specifico (WyvernFormController) senza import circolari.
   * Ritorna il nuovo controller.
   */
  async transform(formKey = 'wyvern') {
    try {
      const cfg = ENTITY_CONFIG[formKey];
      if (!cfg) { console.warn(`[transform] Form sconosciuta: ${formKey}`); return this; }

      // 1) Istanzia il nuovo avatar del form
      const newFBX = instantiateEntity(formKey);
      if (!newFBX) { console.warn('[transform] Impossibile istanziare il modello.'); return this; }

      // 2) Mantieni child utility (es. swordHitbox) marcati con keepOnTransform
      const root = this.player.model;
      const keep = new Set();
      root.traverse(o => { if (o.userData?.keepOnTransform) keep.add(o); });
      if (this.player.model?.children) {
        for (const c of this.player.model.children) {
          if (c === this.player.swordHitbox) keep.add(c);
        }
      }
      const toRemove = root.children.filter(c => !keep.has(c));
      toRemove.forEach(c => root.remove(c));

      // 3) Aggiungi avatar e offset verticale
      const yOffset = cfg?.yOffset ?? 0;
      newFBX.position.y += yOffset;
      root.add(newFBX);

      // 4) Ricostruisci mixer/azioni e Animator sul nuovo avatar
      const { mixer, actions } = buildMixerAndActions(newFBX, cfg);
      this.player.animator = new Animator({ mixer, actions }, () => this.player.state, true);

      // 5) Aggiorna offset camera
      const defaultCamOffset =
        formKey === 'wyvern' ? new THREE.Vector3(0, 15, -20) : new THREE.Vector3(0, 2.5, -1.5);
      if (camOffset?.copy) camOffset.copy(defaultCamOffset);

      // 6) Crea controller specifico senza import a livello top (no cicli)
      let newController = this;
      if (formKey === 'wyvern') {
        // import dinamico per evitare l’import circolare
        const { WyvernFormController } = await import('./WyvernFormController.js');

        const wyvAbilities = {
          formName: 'wyvern',
          canFly: true,
          canJump: false,
          speed: 10,
          gravity: -6,
          jumpForce: 10,
          cameraOffset: defaultCamOffset,
          yOffset
        };

        newController = new WyvernFormController(this.player, wyvAbilities, { inheritFrom: this });
      } else {
        // fallback: resta umano ma con eventuali abilità personalizzate
        this.abilities = {
          formName: formKey,
          canFly: false,
          canJump: true,
          speed: 5,
          jumpForce: 10,
          gravity: -30,
          cameraOffset: defaultCamOffset,
          yOffset
        };
        newController = this;
      }

      // 7) Reset coerenza e ground snap
      newController.isAttacking = false;
      newController.isBlocking  = false;
      newController.isSprinting = false;
      newController.velY = 0;
      newController._ensureAboveGround();

      // 8) Marca avatar/child per future trasformazioni
      newFBX.userData.keepOnTransform = false;
      if (this.player.swordHitbox) this.player.swordHitbox.userData.keepOnTransform = true;

      // 9) Installa il nuovo controller sul player e ritorna
      this.player.controller = newController;
      console.log(`[TRANSFORM] Trasformato in ${formKey} con ${newController.constructor.name}.`);
      return newController;
    } catch (e) {
      console.error('[transform] Errore durante la trasformazione:', e);
      return this;
    }
  }
  // ============ FINE TRASFORMAZIONE ==============

  setWeaponItem(item) {
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

    if (this._equippedWeaponId && item?.id === this._equippedWeaponId) return;

    const kind = getWeaponKind(item);
    const make = STRATEGY_REGISTRY[kind] || STRATEGY_REGISTRY['hand'];

    this._attackStrategy?.cancel?.(this);
    this._attackStrategy = make();
    this._attackStrategy.onEquip?.(this, item);

    this._equippedWeapon = item || null;
    this._equippedWeaponId = item?.id || null;
  }

  syncWeaponFromInventory(inventory) {
    const item = inventory?.equipment?.weapon || null;
    if (!item && this._equippedWeaponId !== null) { this.setWeaponItem(null); return; }
    if (item && item.id !== this._equippedWeaponId) { this.setWeaponItem(item); return; }
    this.setWeaponItem(null); return;
  }

  /** chiamata da InputSystem con click sinistro */
  attack() {
    if (!this._attackStrategy) return;
    if (this.stats.useStamina(20)) {
      this._attackStrategy.attack?.(this);
    } else {
      console.log("Not enough stamina!");
    }
  }
  blockStart() {
    if (!this._attackStrategy) return;
    this._attackStrategy.blockStart?.(this);
  }
  blockEnd() {
    if (!this._attackStrategy) return;
    this._attackStrategy.blockEnd?.(this);
  }
  specialAttack() {
    if (!this._attackStrategy) return;
    if (this.stats.useMana(15)) {
      this._attackStrategy.specialAttack?.(this);
    } else {
      console.log("Not enough mana!");
    }
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
