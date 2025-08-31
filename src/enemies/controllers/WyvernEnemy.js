// WyvernEnemy.js — Wyvern che attacca SOLO col fuoco (pulita e ottimizzata)
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';
import { FireBreathCone } from '../../particles/FireBreathCone.js';

export class WyvernEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'wyvern' });

    // ---- Stats / setup base
    this.health = opt.health ?? 300;
    this.xp     = opt.xp ?? 250;

    // ---- Movimento/volo
    this.behaviorState = 'flying';
    this.stateTimer    = 0;
    this.altitudeMin   = opt.altitudeMin ?? 10;
    this.altitudeMax   = opt.altitudeMax ?? 16;
    this.flySpeed      = opt.flySpeed    ?? 6.5;
    this.turnK         = opt.turnK       ?? 6.0;

    // ---- Distanze / cono d'attacco
    this.breathRangeFactor = opt.breathRangeFactor ?? 4.0; // range = length * factor
    this.attackAngleDeg    = opt.attackAngleDeg    ?? 85;  // apertura del cono di danno
    this.attackDamage      = opt.attackDamage      ?? 5;

    // ---- Respiro (parametri visuali/forza)
    this.breathIntensity = opt.breathIntensity ?? 10; // usata per la timeline
    const fireLength = opt.fireLength ?? 30;
    const fireRadius = opt.fireRadius ?? 1.5;

    // ---- Cooldown attacco
    this.attackCooldown = opt.attackCooldown ?? 3.0;
    this._cooldown      = 1.0;

    // ---- Bocca / orientamento
    this.mouthBoneName = opt.mouthBoneName ?? null;
    this.invertForward = !!opt.invertForward;
    this._mouthRef     = null;

    // ---- Sistema fuoco
    this._fire = new FireBreathCone({
      length: fireLength,
      radius: fireRadius,
      intensity: this.breathIntensity,
      renderOrder: 1000
    });

    // ---- Variabili interne
    this._angle   = Math.random() * Math.PI * 2;
    this._altitude= this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);
    this._tmpDir  = new THREE.Vector3();
    this._tmpPos  = new THREE.Vector3();

    // ---- Timeline attacco (solo fuoco)
    this._atkT = 0;             // tempo corrente nella sequenza
    this._didHitThisAttack = false;

    // Fasi (secondi): warmup → burst → sustain → winddown
    this._ATK_WARMUP  = 0.20;
    this._ATK_BURST   = 0.50;
    this._ATK_SUSTAIN = 1.60;
    this._ATK_WINDDOWN= 0.60;
    this._ATK_TOTAL   = this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN + this._ATK_WINDDOWN;
  }

  // ===== Lifecycle ==========================================================
  onModelReady() {
    this._tryHookMouth();
    // no-cull al modello per sicurezza
    this.model.traverse(o => { o.frustumCulled = false; });
    // intensità di base (coerente con breathIntensity)
    this._fire.setIntensity(this.breathIntensity);
  }

  update(dt) {
    this._tryHookMouth(false);
    this._fire.update?.(dt);

    this.stateTimer += dt;

    switch (this.behaviorState) {
      case 'flying': this._updateFlying(dt); break;
      case 'firing': this._updateFiring(dt); break;
    }

    this.updateAnimFromMove();
  }

  // ===== Stato: Flying (pattuglia in aria, niente melee) ====================
  _updateFlying(dt) {
    const p = this.model.position;
    const groundY = this._currentTerrainY();

    // quota desiderata (piccola oscillazione)
    const targetH = groundY + this._altitude + Math.sin(this.stateTimer * 2) * 1.2;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 3.0));

    // moto circolare
    const dir = this._circleDir(dt, 1.0);
    p.x += dir.x * this.flySpeed * dt;
    p.z += dir.z * this.flySpeed * dt;
    this.faceDirection(dir, this.turnK, dt);

    this._fire.setActive(false); // spento finché non attacca

    // trigger attacco a distanza
    const distToPlayer = this._distanceToPlayer();
    const inRange = distToPlayer < this._getBreathRange();
    if (inRange && this._cooldown <= 0) {
      this._beginFireAttack();
    }

    // cooldown scende nel tempo
    this._cooldown = Math.max(0, this._cooldown - dt);
  }

  // ===== Stato: Firing (sequenza respiro a timeline) ========================
  _updateFiring(dt) {
    const player = this.player?.model;
    if (player) {
      // prova a guardare il player durante l'attacco
      const toP = this._tmpDir.subVectors(player.position, this.model.position).normalize();
      this.faceDirection(toP, this.turnK * 1.1, dt);
    }

    this._atkT += dt;

    // curva intensità/attivazione per fasi
    // warmup: accensione morbida
    if (this._atkT <= this._ATK_WARMUP) {
      const t = this._atkT / this._ATK_WARMUP;
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity * 0.3, this.breathIntensity * 0.9, t));
      this._fire.setActive(true);
    }
    // burst: picco + scintille
    else if (this._atkT <= this._ATK_WARMUP + this._ATK_BURST) {
      const t = (this._atkT - this._ATK_WARMUP) / this._ATK_BURST;
      this._fire.addExplosiveBurst?.();
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity * 0.9, this.breathIntensity * 1.2, t));
      this._fire.setActive(true);
    }
    // sustain: piena potenza e applico danno (una sola volta)
    else if (this._atkT <= this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN) {
      this._fire.setIntensity(this.breathIntensity);
      this._fire.setActive(true);
      if (!this._didHitThisAttack && this._playerInFireCone()) {
        gameManager?.controller?.stats?.damage?.(this.attackDamage);
        this._didHitThisAttack = true;
      }
    }
    // winddown: spegnimento
    else if (this._atkT <= this._ATK_TOTAL) {
      const t = (this._atkT - (this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN)) / this._ATK_WINDDOWN;
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity, this.breathIntensity * 0.2, t));
      this._fire.setActive(true);
    }

    // fine attacco
    if (this._atkT >= this._ATK_TOTAL) {
      this._fire.setActive(false);
      this.behaviorState = 'flying';
      this.stateTimer = 0;
      this._cooldown = this.attackCooldown;
    }
  }

  _beginFireAttack() {
    this.behaviorState = 'firing';
    this.stateTimer = 0;
    this._atkT = 0;
    this._didHitThisAttack = false;
  }

  // ===== Danno / geometria del cono ========================================
  _getBreathRange() {
    const L = this._fire?.length ?? 0;
    return (L > 0) ? (L * this.breathRangeFactor) : 0;
  }

  _playerInFireCone() {
    const playerObj = this.player?.model;
    if (!playerObj) return false;

    const from = this.model.position;
    const to   = playerObj.position;
    const dist = from.distanceTo(to);
    if (dist > this._getBreathRange()) return false;

    this.model.getWorldDirection(this._tmpPos);
    const fireDir = this.invertForward ? this._tmpPos.negate() : this._tmpPos.clone();
    const toP = this._tmpDir.subVectors(to, from).normalize();
    const angleDeg = Math.acos(THREE.MathUtils.clamp(fireDir.dot(toP), -1, 1)) * THREE.MathUtils.RAD2DEG;
    return angleDeg <= this.attackAngleDeg * 0.5;
  }

  // ===== Utility movimento ==================================================
  _currentTerrainY() {
    const p = this.model.position;
    return getTerrainHeightAt(p.x, p.z);
  }

  _circleDir(dt, speedFactor = 1) {
    this._angle += dt * 0.5 * speedFactor;
    return new THREE.Vector3(Math.cos(this._angle), 0, Math.sin(this._angle)).normalize();
  }

  // ===== Hook bocca / attach fuoco =========================================
  _tryHookMouth() {
    if (!this.model || this._mouthRef) return;

    const exact = [
      this.mouthBoneName,
      'Mouth','mouth','Mouth_end','mouth_end',
      'Head','head','Head_end','head_end',
      'metarigHead','metarig.head','metarig_Head',
      'jaw','Jaw','jaw_end','Jaw_end',
      'Snout','snout','muzzle','Muzzle'
    ].filter(Boolean);

    for (const name of exact) {
      const bone = this.model.getObjectByName(name);
      if (bone) { this._mouthRef = bone; break; }
    }

    if (!this._mouthRef) {
      const keywords = ['mouth','muzzle','jaw','head','snout','face','teeth','skull'];
      let best = null, bestScore = 0;
      this.model.traverse(obj => {
        if (!obj?.name) return;
        const nm = obj.name.toLowerCase();
        for (const kw of keywords) {
          if (nm.includes(kw)) {
            const s = kw === 'mouth' ? 10 : kw === 'head' ? 8 : 5;
            if (s > bestScore) { bestScore = s; best = obj; }
          }
        }
      });
      if (best) this._mouthRef = best;
    }

    const scale = this._getModelScale();
    const mouthOffset = new THREE.Vector3(0, 0.8 * scale, 2.5 * scale);

    if (this._mouthRef) {
      this._fire.attachTo(this._mouthRef, mouthOffset);
      this._fire.invertForward(this.invertForward);
      this._fire.autoscaleFromParentWorldScale?.(1.5, 1.2);
    } else {
      const fallbackOffset = new THREE.Vector3(0, 2.0 * scale, 3.5 * scale);
      this._fire.attachTo(this.model, fallbackOffset);
      this._fire.autoscaleFromParentWorldScale?.(1.8, 1.5);
    }

    this._fire.group.renderOrder = 1001;
    this._fire.group.traverse(child => {
      if (child.material) { child.renderOrder = 1001; child.frustumCulled = false; }
    });
  }

  _getModelScale() {
    if (!this.model) return 1.0;
    const s = new THREE.Vector3();
    this.model.getWorldScale(s);
    return (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3;
  }

  // ===== Helper vari ========================================================
  _distanceToPlayer() {
    if (!this.player?.model) return Infinity;
    return this.model.position.distanceTo(this.player.model.position);
  }
}

export default WyvernEnemy;
