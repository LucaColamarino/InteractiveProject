// combat/strategies/SwordMeleeStrategy.js
import * as THREE from 'three';
import { AttackStrategy } from './AttackStrategy.js';
import { getEnemies, killEnemy } from '../../enemies/EnemyManager.js';
import { hudManager } from '../../ui/hudManager.js';
import { scene } from '../../scene.js';

export class HandMeleeStrategy extends AttackStrategy {
  constructor() {
    super();
    // ---- shockwave params ----
    this.shockCooldown = 2.0;      // secondi tra uno shockwave e l'altro
    this.shockFireFrac = 0.35;     // frazione della clip a cui “parte” l'onda
    this.shockMaxRadius = 12;      // raggio massimo dell'onda (m)
    this.shockSpeed = 22;          // m/s (velocità di espansione)
    this.shockThickness = 1.2;     // spessore del fronte (m)
    this.shockDamageXP = 40;       // XP/“danno” dato a chi colpisci
    this._shockCd = 0;             // timer cooldown
    this._shockState = null;       // { action, clip, clipName, fired }
    this._shockwaves = [];         // istanze attive dell'effetto
  }

  onEquip(controller, weaponItem) {
    this._setArc(weaponItem?.meta?.reach, weaponItem?.meta?.arcDeg);
  }

  // Attacco base (slash su click sinistro)
  attack(controller) { return this.baseAttack(controller); }

  // --- NUOVO: attacco speciale = SHOCKWAVE ---
  specialAttack(controller, clipName = 'shockwave') {
    if (controller.isAttacking || this._shockCd > 0) return false;

    // prova ad ottenere l'azione "shockwave"
    const actions = controller.player.animator?.actions || {};
    console.log("actions",actions);
    let action = actions[clipName] || null;

    // fallback: usa un'azione qualsiasi se non troviamo "shockwave"
    if (!action) {
      action = actions['attack'] || actions['swordAttack'] || null;
      if (!action) {
        const key = Object.keys(actions).find(k => k.toLowerCase().includes('attack'));
        if (key) action = actions[key];
      }
    }
    if (!action) return false;

    const chosenName = action._clipName || clipName;
    const ok = controller.player.animator?.playAction(chosenName);
    if (!ok) return false;

    const clip = action.getClip?.() || null;
    const dur  = clip?.duration ?? 0.8;

    controller.lockMovementFor(dur);
    controller.isAttacking = true;
    this._shockCd = this.shockCooldown;

    this._shockState = { action, clip, clipName: chosenName, fired: false };
    return true;
  }

  // Manteniamo gestione hit per lo slash nel base class, e aggiungiamo update shockwave
  update(controller, dt) {
    // 1) slash base (finestre hit ecc.)
    super.update(controller, dt);

    // 2) cooldown shockwave
    if (this._shockCd > 0) this._shockCd = Math.max(0, this._shockCd - dt);

    // 3) stato della clip shockwave (quando “parte” generiamo l’onda)
    if (this._shockState?.action && this._shockState.clip) {
      const { action, clip } = this._shockState;
      const frac = clip.duration > 0 ? (action.time / clip.duration) : 1;

      if (!this._shockState.fired && frac >= this.shockFireFrac) {
        this._spawnShockwave(controller);
        this._shockState.fired = true;
      }

      const weight = controller.player.animator?._getActionWeight?.(this._shockState.clipName) ?? 0;
      const ended = !action.isRunning?.() || weight <= 0.001 || frac >= 0.999;
      if (ended) {
        this._shockState = null;
        controller.isAttacking = false;
      }
    } else if (this._shockState && !this._shockState.fired) {
      // clip non disponibile? comunque spara l’onda.
      this._spawnShockwave(controller);
      this._shockState.fired = true;
      this._shockState = null;
      controller.isAttacking = false;
    }

    // 4) integrazione delle onde attive (espansione + collisioni)
    for (let i = this._shockwaves.length - 1; i >= 0; i--) {
      const sw = this._shockwaves[i];
      sw.radius += this.shockSpeed * dt;

      // effetto visivo: scala e dissolvenza
      if (sw.mesh) {
        const s = Math.max(0.001, sw.radius * 2); // diametro ~ scala XY
        sw.mesh.scale.set(s, s, 1);
        const lifeFrac = THREE.MathUtils.clamp(sw.radius / this.shockMaxRadius, 0, 1);
        sw.mesh.material.opacity = 0.45 * (1.0 - lifeFrac);
      }

      // colpisci i nemici attraversati dal “fronte”
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
          killEnemy(e);
          if (typeof window !== 'undefined' && typeof window.giveXP === 'function') {
            window.giveXP(this.shockDamageXP);
          }
          hudManager.showNotification('Shockwave Hit!');
        }
      }

      // fine onda
      if (sw.radius >= this.shockMaxRadius) {
        if (sw.mesh) sw.mesh.parent?.remove(sw.mesh);
        this._shockwaves.splice(i, 1);
      }
    }
  }

  cancel(controller) {
    super.cancel(controller);
    this._shockState = null;
    // rimuovi eventuali onde visive ancora in scena
    for (const sw of this._shockwaves) sw.mesh?.parent?.remove(sw.mesh);
    this._shockwaves.length = 0;
  }

  // Cosa succede nella finestra "attiva" dello slash (click sinistro)
  _applyHits(controller) {
    console.log("apply hits");
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

  // ---- internals shockwave ----
  _spawnShockwave(controller) {
    // posizione e rotazione world del player
    const model = controller.player.model;
    model.updateMatrixWorld(true);
    const origin = model.getWorldPosition(new THREE.Vector3());

    // mesh effetto: anello piatto (disc) con additive blending
    const ringGeo = new THREE.RingGeometry(0.98, 1.02, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; // orizzontale
    ring.position.copy(origin).add(new THREE.Vector3(0, 0.05, 0)); // leggermente sopra il terreno
    ring.renderOrder = 999;
    scene.add(ring);

    this._shockwaves.push({
      origin: origin.clone(),
      radius: 0.01,
      hit: new Set(),
      mesh: ring
    });
  }
}
