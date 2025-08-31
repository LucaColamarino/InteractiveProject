// WyvernEnemy.js — Idle (solo all'inizio) → Ground Fire (fire) → Takeoff (take_off) → Air Assault (flapingFiring) → loop
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';
import { FireBreathCone } from '../../particles/FireBreathCone.js';

export class WyvernEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'wyvern' });

    // ── Stats
    this.health = opt.health ?? 300;
    this.xp     = opt.xp ?? 250;

    // ── Distanze / cono
    this.breathRangeFactor = opt.breathRangeFactor ?? 4.0; // usato solo per danno
    this.attackAngleDeg    = opt.attackAngleDeg ?? 45;
    this.attackDamage      = opt.attackDamage ?? 15;

    // Ingaggio: l'idle passa al combattimento SOLO sotto questa distanza
    this.engageRange       = opt.engageRange ?? 45;

    // ── Movimento / volo
    this.altitudeMin = opt.altitudeMin ?? 15;
    this.altitudeMax = opt.altitudeMax ?? 20;
    this.flySpeed    = opt.flySpeed    ?? 6.5;
    this.turnK       = opt.turnK       ?? 6.0;
    this.yOffset     = opt.yOffset     ?? 0;

    // Orbita in aria (distanza minima e orbit target)
    this.orbitRadius     = opt.orbitRadius ?? 40;     // leggermente più largo
    this.minAirDistance  = opt.minAirDistance ?? Math.max(35, this.orbitRadius * 0.9);
    this.orbitTightenK   = opt.orbitTightenK ?? 2.5;  // correzione radiale
    this.orbitAngular    = opt.orbitAngular ?? 0.9;   // non usata direttamente (manteniamo la tangente)

    // ── Fuoco
    this.breathIntensity = opt.breathIntensity ?? 10;
    const fireLength = opt.fireLength ?? 30;
    const fireRadius = opt.fireRadius ?? 1.5;

    this._fire = new FireBreathCone({
      length: fireLength,
      radius: fireRadius,
      intensity: this.breathIntensity,
      renderOrder: 1000
    });

    // ── Animazioni
    this.animClips = {
      idle: 'idle',
      groundFire: 'fire',
      takeoff: 'take_off',
      airFlame: 'flapingFiring'
    };
    this._activeAnim = null;       // evita re-trigger continui
    this._autoAnimEnabled = true;  // blocca updateAnimFromMove durante le fasi di combat

    // ── Stati
    this.behaviorState = 'idle';
    this.stateTimer = 0;
    this._altitude = this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);
    this._angle    = Math.random() * Math.PI * 2;

    // Timeline fuoco
    this._atkT = 0;
    this._didHitThisAttack = false;
    this._ATK_WARMUP   = 0.20;
    this._ATK_BURST    = 0.50;
    this._ATK_SUSTAIN  = 1.60;
    this._ATK_WINDDOWN = 0.60;
    this._ATK_TOTAL    = this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN + this._ATK_WINDDOWN;

    // Gestione cicli in aria → dopo N getti torna a terra e ricomincia
    this.airBurstsPerCycle = opt.airBurstsPerCycle ?? 2;
    this._airBurstsDone    = 0;
    this._airPause         = 0.6;
    this._airPauseLeft     = 0;

    // Bocca / orientamento
    this.mouthBoneName = opt.mouthBoneName ?? null;
    this.invertForward = !!opt.invertForward;
    this._mouthRef = null;

    // temp
    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
    this._up     = new THREE.Vector3(0,1,0);
  }

  // ────────────────────────────────────────────────────────────────────────────
  onModelReady() {
    this._tryHookMouth();
    this.model.traverse(o => { o.frustumCulled = false; });
    this._fire.setIntensity(this.breathIntensity);
    this._logAvailableAnimations();
    this._enterIdle(true);
  }

  update(dt) {
    this._tryHookMouth(false);
    this._fire.update?.(dt);
    this.stateTimer += dt;

    switch (this.behaviorState) {
      case 'idle':            this._updateIdle(dt);        break;
      case 'ground_fire':     this._updateGroundFire(dt);  break;
      case 'takeoff':         this._updateTakeoff(dt);     break;
      case 'air_assault':     this._updateAirAssault(dt);  break;
      case 'landing_ground':  this._updateLandingGround(dt); break;
    }

    // lascia che l'AI locomotoria scelga animazioni solo in IDLE
    if (this._autoAnimEnabled) this.updateAnimFromMove();
  }

  // ── IDLE (solo all'inizio) ─────────────────────────────────────────────────
  _enterIdle(first=false) {
    this.behaviorState = 'idle';
    this.stateTimer = 0;
    this._autoAnimEnabled = true;
    this.state.isFlying = false;
    this._fire.setActive(false);
    this._setAnim(this.animClips.idle, { loop: 'repeat' });
    if (!first) this._altitude = this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);
  }

  _updateIdle(dt) {
    const p = this.model.position;
    const groundY = this._currentTerrainY();
    p.y = THREE.MathUtils.lerp(p.y, groundY + this.yOffset, Math.min(1, dt * 8));

    const dist = this._distanceToPlayer();
    if (dist <= this.engageRange) {
      this._enterGroundFire();
    }
  }

  // ── GROUND FIRE ─────────────────────────────────────────────────────────────
  _enterGroundFire() {
    this.behaviorState = 'ground_fire';
    this.stateTimer = 0;
    this._autoAnimEnabled = false;
    this.state.isFlying = false;
    this._beginFireTimeline();
    this._setAnim(this.animClips.groundFire, { loop: 'once' });
  }

  _updateGroundFire(dt) {
    const p = this.model.position;
    const groundY = this._currentTerrainY();
    p.y = THREE.MathUtils.lerp(p.y, groundY + this.yOffset, Math.min(1, dt * 8));

    const player = this.player?.model;
    if (player) {
      const toP = this._tmpDir.subVectors(player.position, p).normalize();
      this.faceDirection(toP, this.turnK * 1.2, dt);
    }

    if (this._updateFireTimeline(dt)) {
      this._enterTakeoff();
    }
  }

  // ── TAKEOFF ────────────────────────────────────────────────────────────────
  _enterTakeoff() {
    this.behaviorState = 'takeoff';
    this.stateTimer = 0;
    this._autoAnimEnabled = false;
    this.state.isFlying = true;
    this._fire.setActive(false);
    this._setAnim(this.animClips.takeoff, { loop: 'once' });
  }

  _updateTakeoff(dt) {
    const p = this.model.position;
    const targetH = this._currentTerrainY() + this._altitude;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 3.2));

    const player = this.player?.model;
    if (player) {
      const toP = this._tmpDir.subVectors(player.position, p).normalize();
      this.faceDirection(toP, this.turnK, dt);
    }

    const clipDur = this.animator?.getClipDuration?.(this.animClips.takeoff) ?? 1.8;
    if (this.stateTimer >= clipDur * 0.95 || Math.abs(p.y - targetH) < 0.3) {
      this._enterAirAssault();
    }
  }

  // ── AIR ASSAULT (mantiene distanza minima, spara a cicli) ──────────────────
  _enterAirAssault() {
    this.behaviorState = 'air_assault';
    this.stateTimer = 0;
    this._airPauseLeft = 0;
    this._airBurstsDone = 0;
    this._autoAnimEnabled = false;
    this.state.isFlying = true;
    this._beginFireTimeline(); // parte subito
    this._setAnim(this.animClips.airFlame, { loop: 'repeat' }); // forza flapingFiring
  }

  _updateAirAssault(dt) {
    const player = this.player?.model;
    if (!player) return;

    const p = this.model.position;
    const center = player.position;

    // quota
    const targetH = this._currentTerrainY() + this._altitude + Math.sin(this.stateTimer * 1.6) * 0.8;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 2.5));

    // orbita con guardia di distanza
    const fromCenter = this._tmpDir.subVectors(p, center);
    let dist = fromCenter.length(); if (dist < 0.001) dist = 0.001;
    const outward = fromCenter.clone().normalize();         // da player → wyvern
    const tangent = this._up.clone().cross(fromCenter).normalize();

    const desired = Math.max(this.orbitRadius, this.minAirDistance);

    // velocità tangenziale ridotta se troppo vicino (per lasciare spazio alla correzione radiale)
    const tangentialSpeed = this.flySpeed * THREE.MathUtils.clamp(dist / desired, 0.5, 1.0);
    p.addScaledVector(tangent, tangentialSpeed * dt);

    // correzione radiale verso il raggio desiderato
    const radialErr = dist - desired;                       // <0 troppo vicino, >0 troppo lontano
    p.addScaledVector(outward, -radialErr * this.orbitTightenK * dt);

    // repulsione extra se sotto la distanza minima
    if (dist < this.minAirDistance) {
      const push = (this.minAirDistance - dist) * (this.orbitTightenK * 2.5);
      p.addScaledVector(outward, push * dt);
    }

    // guarda il player
    const toPlayer = this._tmpPos.subVectors(center, p).normalize();
    this.faceDirection(toPlayer, this.turnK * 1.15, dt);

    // assicurati che l'anim corretta resti attiva
    this._setAnim(this.animClips.airFlame, { loop: 'repeat' });

    // fuoco a cicli
    if (this._atkT > 0) {
      const finished = this._updateFireTimeline(dt);
      if (finished) {
        this._airBurstsDone++;
        this._airPauseLeft = this._airPause;
        // ciclo completato? scendi e riparti da ground_fire
        if (this._airBurstsDone >= this.airBurstsPerCycle) {
          this._enterLandingGround();
          return;
        }
      }
    } else {
      this._airPauseLeft -= dt;
      if (this._airPauseLeft <= 0 && this._distanceToPlayer() <= this._getBreathRange() * 1.15) {
        this._beginFireTimeline();
      }
    }

    // se il player scappa molto, smette e torna idle (fallback)
    const far = this._distanceToPlayer() > Math.max(this.engageRange * 1.8, this._getBreathRange() * 1.2);
    if (far) this._enterIdle();
  }

  // ── LANDING per tornare a GROUND FIRE (senza passare da idle) ──────────────
  _enterLandingGround() {
    this.behaviorState = 'landing_ground';
    this.stateTimer = 0;
    this._fire.setActive(false);
    this.state.isFlying = true;   // vola ancora durante la discesa
    // manteniamo l'anim di volo; appena a terra partirà "fire"
  }

  _updateLandingGround(dt) {
    const p = this.model.position;
    const targetY = this._currentTerrainY() + this.yOffset;
    p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 4.0)); // discesa veloce

    // guarda il player mentre scende
    const player = this.player?.model;
    if (player) {
      const toP = this._tmpDir.subVectors(player.position, p).normalize();
      this.faceDirection(toP, this.turnK, dt);
    }

    if (Math.abs(p.y - targetY) < 0.2 || this.stateTimer > 1.2) {
      // a terra → riparti subito con ground_fire
      this._enterGroundFire();
    }
  }

  // ── Timeline fuoco ─────────────────────────────────────────────────────────
  _beginFireTimeline() {
    this._atkT = 0;
    this._didHitThisAttack = false;
    this._fire.setActive(true);
  }

  _updateFireTimeline(dt) {
    this._atkT += dt;

    if (this._atkT <= this._ATK_WARMUP) {
      const t = this._atkT / this._ATK_WARMUP;
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity * 0.3, this.breathIntensity * 0.9, t));
      this._fire.setActive(true);
    } else if (this._atkT <= this._ATK_WARMUP + this._ATK_BURST) {
      const t = (this._atkT - this._ATK_WARMUP) / this._ATK_BURST;
      this._fire.addExplosiveBurst?.();
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity * 0.9, this.breathIntensity * 1.2, t));
      this._fire.setActive(true);
    } else if (this._atkT <= this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN) {
      this._fire.setIntensity(this.breathIntensity);
      this._fire.setActive(true);
      if (!this._didHitThisAttack && this._playerInFireCone()) {
        gameManager?.controller?.stats?.damage?.(this.attackDamage);
        this._didHitThisAttack = true;
      }
    } else if (this._ATK_TOTAL && this._atkT <= this._ATK_TOTAL) {
      const t = (this._atkT - (this._ATK_WARMUP + this._ATK_BURST + this._ATK_SUSTAIN)) / this._ATK_WINDDOWN;
      this._fire.setIntensity(THREE.MathUtils.lerp(this.breathIntensity, this.breathIntensity * 0.2, t));
      this._fire.setActive(true);
    }

    if (this._atkT >= this._ATK_TOTAL) {
      this._fire.setActive(false);
      this._atkT = 0;
      return true;
    }
    return false;
  }

  // ── Danno / range ──────────────────────────────────────────────────────────
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

  // ── Utils / anim helper ────────────────────────────────────────────────────
  _currentTerrainY() {
    const p = this.model.position;
    return getTerrainHeightAt(p.x, p.z);
  }

  _setAnim(name, opts={}) {
    if (!name) return;
    if (this._activeAnim === name) return;
    this._activeAnim = name;
    try { this.animator?.play?.(name, { mode:'full', fade:0.18, ...opts }); } catch(_) {}
  }

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

  _distanceToPlayer() {
    if (!this.player?.model) return Infinity;
    return this.model.position.distanceTo(this.player.model.position);
  }

  // dentro la classe WyvernEnemy, aggiungi:
_logAvailableAnimations() {
  try {
    const names = new Set();
    const add = (x) => {
      if (!x) return;
      if (Array.isArray(x)) x.forEach(c => c && (typeof c === 'string' ? names.add(c) : c.name && names.add(c.name)));
      else if (typeof x === 'object') {
        // oggetto {clipName: action/clip}
        Object.entries(x).forEach(([k, v]) => {
          if (typeof v === 'string') names.add(v);
          else if (v && v._clip && v._clip.name) names.add(v._clip.name);
          else if (v && v.name) names.add(v.name);
          else names.add(k);
        });
      }
    };

    // fonti possibili
    if (this.animator?.listClips) add(this.animator.listClips());
    if (this.animator?.clips)     add(this.animator.clips);
    if (this.animator?.actions)   add(this.animator.actions);

    if (this.model?.animations)   add(this.model.animations);
    this.model?.traverse?.(o => {
      if (o.animations)           add(o.animations);
      if (o.userData?.animations) add(o.userData.animations);
    });

    const arr = [...names].sort();
    console.groupCollapsed(`[Wyvern] Animations found (${arr.length})`);
    arr.forEach((n,i) => console.log(`  ${i+1}. ${n}`));
    console.groupEnd();
    if (arr.length === 0) console.warn('[Wyvern] No animations found on model/animator.');
  } catch (e) {
    console.warn('[Wyvern] Error listing animations:', e);
  }
}

// opzionale: esposizione pubblica per richiamarlo da console
debugListAnimations(){ this._logAvailableAnimations(); }

}

export default WyvernEnemy;
