import * as THREE from 'three';
import { BaseFormController } from './BaseFormController.js';
import { SwordMeleeStrategy } from '../../combat/strategies/SwordMeleeStrategy.js';
import { HandMeleeStrategy } from '../../combat/strategies/HandMeleeStrategy.js';
import { WandMagicStrategy } from '../../combat/strategies/WandMagicStrategy.js';
import { instantiateEntity, buildMixerAndActions } from '../../utils/entityFactory.js';
import { ENTITY_CONFIG } from '../../utils/entities.js';
import { Animator } from '../../components/Animator.js';
import { offset as camOffset } from '../../player/cameraFollow.js';
import { WyvernFormController } from './WyvernFormController.js';

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

  async transform(formKey = 'wyvern') {
    try {
      const cfg = ENTITY_CONFIG[formKey];
      if (!cfg) return this;

      const newFBX = instantiateEntity(formKey);
      if (!newFBX) return this;

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

      const yOffset = cfg?.yOffset ?? 0;
      newFBX.position.y += yOffset;
      root.add(newFBX);

      const { mixer, actions } = buildMixerAndActions(newFBX, cfg);
      this.player.animator = new Animator({ mixer, actions }, () => this.player.state, true);

      const defaultCamOffset =
        formKey === 'wyvern' ? new THREE.Vector3(0, 15, -20) : new THREE.Vector3(0, 2.5, -1.5);
      if (camOffset?.copy) camOffset.copy(defaultCamOffset);

      let newController = this;
      if (formKey === 'wyvern') {
        const wyvAbilities = {
          formName: 'wyvern',
          canFly: true,
          canJump: false,
          speed: 50,
          gravity: -6,
          jumpForce: 10,
          cameraOffset: defaultCamOffset,
          yOffset
        };
        newController = new WyvernFormController(this.player, wyvAbilities, { inheritFrom: this });
      } else {
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

      newController.isAttacking = false;
      newController.isBlocking  = false;
      newController.isSprinting = false;
      newController.velY = 0;
      newController._ensureAboveGround();

      newFBX.userData.keepOnTransform = false;
      if (this.player.swordHitbox) this.player.swordHitbox.userData.keepOnTransform = true;

      return newController;
    } catch {
      return this;
    }
  }

  setWeaponItem(item) {
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

  attack() {
    if (!this._attackStrategy) return;
    if (this.stats.useStamina(20)) this._attackStrategy.attack?.(this);
  }
  blockStart() { this._attackStrategy?.blockStart?.(this); }
  blockEnd()   { this._attackStrategy?.blockEnd?.(this); }
  specialAttack() { this._attackStrategy?.specialAttack?.(this); }

  update(dt) {
    super.update(dt);
    const full = this.player.animator?._activeFull || null;
    if (this.isAttacking && !full) this.isAttacking = false;
    this._attackStrategy?.update?.(this, dt);
  }
}
