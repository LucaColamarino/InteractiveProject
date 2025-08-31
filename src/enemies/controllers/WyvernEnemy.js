// WyvernEnemy.js — Boss Wyvern (red fire, adult) senza vento (getto identico al test)
import * as THREE from 'three';
import { BaseEnemy } from './BaseEnemy.js';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';
import { FireBreathCone } from '../../particles/FireBreathCone.js';

export class WyvernEnemy extends BaseEnemy {
  constructor(opt = {}) {
    super({ ...opt, type: 'wyvern' });

    // ===== Stats =====
    this.health = opt.health ?? 300;
    this.xp     = opt.xp ?? 250;

    // ===== FSM =====
    this.behaviorState = opt.startState ?? 'flying';
    this.stateTimer    = 0;

    // --- Fire breath range (derivata dalla lunghezza del cono) ---
    // es: length=15 → range ≈ 60 (factor 4).
    this.breathRangeFactor = opt.breathRangeFactor ?? 4.0;

    // ===== Movimento =====
    this.altitudeMin = opt.altitudeMin ?? 10;
    this.altitudeMax = opt.altitudeMax ?? 16;
    this.flySpeed    = opt.flySpeed    ?? 6.5;
    this.walkSpeed   = opt.walkSpeed   ?? 1.6;
    this.turnK       = opt.turnK       ?? 6.0;
    this.yOffset     = opt.yOffset     ?? 0.0;

    // ===== Timing =====
    this.flyTimeRange    = opt.flyTimeRange    ?? [6, 10];
    this.groundTimeRange = opt.groundTimeRange ?? [5, 8];
    this.attackCooldown  = opt.attackCooldown  ?? 3.0;
    this._cooldown       = 1.0;

    // ===== Attacco =====
    this.attackRange     = opt.attackRange     ?? 12.0; // melee vicino
    this.attackAngleDeg  = opt.attackAngleDeg  ?? 85;   // cono ampio
    this.attackDamage    = opt.attackDamage    ?? 5;
    this._didHitThisAttack = false;

    // ===== Config fuoco (boss rosso adulto) =====
    this.breathIntensity  = 70;//opt.breathIntensity ?? 8.0;
    this.mouthBoneName    = opt.mouthBoneName ?? null;
    this.invertForward    = !!opt.invertForward; // se il modello è invertito
    this.debugFireSeconds = opt.debugFireSeconds ?? 0;
    this.debugMode        = opt.debugMode ?? true;

    // Candidati per l’aggancio alla bocca
    this.mouthCandidatesExact = [
      this.mouthBoneName,
      'Mouth','mouth','Mouth_end','mouth_end',
      'Head','head','Head_end','head_end',
      'metarigHead','metarig.head','metarig_Head',
      'jaw','Jaw','jaw_end','Jaw_end',
      'Snout','snout','muzzle','Muzzle',
      'neck','Neck','neck_end','Neck_end',
      'face','Face','skull','Skull'
    ].filter(Boolean);

    this._mouthRef = null;

    // Sistema di fuoco (identico al test come comportamento)
    const baseLength = 10
    const baseRadius = 0.1
    this._fire = new FireBreathCone({
      length: baseLength,
      radius: baseRadius,
      intensity: this.breathIntensity,
      renderOrder: 1000
    });

    // Marker bocca per debug
    this._debugMouthMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshBasicMaterial({
        color: 0xff4444, transparent: true, opacity: 0.8,
        depthTest: false
      })
    );
    this._debugMouthMarker.visible = this.debugMode;

    // ===== Variabili comportamento =====
    this._angle   = Math.random() * Math.PI * 2;
    this._flyDur  = this._randBetween(this.flyTimeRange[0], this.flyTimeRange[1]);
    this._groundDur = this._randBetween(this.groundTimeRange[0], this.groundTimeRange[1]);
    this._altitude  = this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);

    // Effetti avanzati (vento disattivato: manteniamo vettore ma non lo usiamo)
    this._windVector = new THREE.Vector3(0,0,0);

    // Helper vector
    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
  }

  // ===== Lifecycle =====
  onModelReady() {
    console.log('[Wyvern] Model ready, setting up fire system');
    this._logHierarchy(this.model, { maxDepth: 8 });
    this._tryHookMouth(true);

    // No-cull ai children
    this.model.traverse(o => { o.frustumCulled = false; });

    // Autoscale basato su bounding box del modello
    const diag = this._computeModelDiagonal();
    if (diag) {
      this._fire.autoscaleFromModelBounds?.(diag, 0.5, 0.18);
    }

    // Setup finale del sistema
    this._fire.setIntensity(this.breathIntensity);

    // Test iniziale opzionale
    if (this.debugFireSeconds > 0) {
      console.log(`[Wyvern] DEBUG: Initial fire test for ${this.debugFireSeconds}s`);
      this._fire.forceFire(this.debugFireSeconds);
    }
  }

  update(dt) {
    // Hook bocca (lazy) + update fuoco
    this._tryHookMouth(false);
    this._fire.update?.(dt);

    // Effetti ambientali (VENTO DISATTIVATO per look identico al test)
    this._updateEnvironmentalEffects(dt);

    // FSM
    this.stateTimer += dt;
    const p = this.model.position;
    const groundY = this._currentTerrainY();

    switch (this.behaviorState) {
      case 'takingoff': this._updateTakeoff(dt, p, groundY);  break;
      case 'flying':    this._updateFlying(dt, p, groundY);   break;
      case 'landing':   this._updateLanding(dt, p, groundY);  break;
      case 'grounded':  this._updateGrounded(dt, p, groundY); break;
      case 'attacking': this._updateAttacking(dt);            break;
    }

    // Ping (range) in debug
    if (this.debugMode) {
      this._dbgRangeLogTimer = (this._dbgRangeLogTimer || 0) + dt;
      if (this._dbgRangeLogTimer >= 0.5 && this.player?.model) {
        this._dbgRangeLogTimer = 0;
        const dist = this.model.position.distanceTo(this.player.model.position);
        this.model.getWorldDirection(this._tmpPos);
        const fireDir = this.invertForward ? this._tmpPos.negate() : this._tmpPos.clone();
        const toP = this._tmpDir.subVectors(this.player.model.position, this.model.position).normalize();
        const angleDeg = Math.acos(THREE.MathUtils.clamp(fireDir.dot(toP), -1, 1)) * THREE.MathUtils.RAD2DEG;
        const halfCone = this.attackAngleDeg * 0.5;
        const breathRange = this._getBreathRange();
        console.log(
          `[Wyvern][RANGE] dist=${dist.toFixed(2)}/${breathRange.toFixed(2)}  angle=${angleDeg.toFixed(1)}°≤${halfCone.toFixed(1)}°  in=${(dist<=breathRange)&&(angleDeg<=halfCone)}`
        );
      }
    }

    this.updateAnimFromMove();
  }

  // ===== Effetti ambientali =====
  _updateEnvironmentalEffects(/* dt */) {
    // NIENTE VENTO: lasciamo il jet identico al test (ancorato e orizzontale).
    // Se in futuro vorrai riattivarlo:
    // this._windVector.set(ampX, 0, ampZ); this._fire.setWindEffect?.(this._windVector);
  }

  // ===== FSM dettagli =====
  _updateTakeoff(dt, p, groundY) {
    this.state.isFlying = true;
    const targetH = groundY + this._altitude;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 2.5));

    const dir = this._circleDir(dt, 0.6);
    p.x += dir.x * this.flySpeed * 0.5 * dt;
    p.z += dir.z * this.flySpeed * 0.5 * dt;
    this._faceDir(dir, dt);
    this.state.speed = this.flySpeed * 0.5;
    this._fire.setActive(false);

    const dur = this.animator?.getClipDuration?.('takeoff') || 2.0;
    if (this.stateTimer >= dur * 0.95 || Math.abs(p.y - targetH) < 0.4) {
      this.behaviorState = 'flying';
      this.stateTimer = 0;
      this._flyDur  = this._randBetween(this.flyTimeRange[0], this.flyTimeRange[1]);
      this._altitude = this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);
    }
  }

  _updateFlying(dt, p, groundY) {
    this.state.isFlying = true;
    const h = groundY + this._altitude + Math.sin(this.stateTimer * 2) * 1.2;
    p.y = THREE.MathUtils.lerp(p.y, h, Math.min(1, dt * 3.0));

    const dir = this._circleDir(dt, 1.0);
    p.x += dir.x * this.flySpeed * dt;
    p.z += dir.z * this.flySpeed * dt;
    this._faceDir(dir, dt);
    this.state.speed = this.flySpeed;
    this._fire.setActive(false);

    // Attacco aereo se in range
    const distToPlayer = this._distanceToPlayer();
    const breathRange  = this._getBreathRange();
    if (distToPlayer < breathRange && this._cooldown <= 0) {
      if (Math.random() < 0.1) { // 10% chance per frame
        console.log('[Wyvern] Aerial fire attack!');
        this._executeAerialAttack();
      }
    }

    if (this.stateTimer >= this._flyDur) {
      this.behaviorState = 'landing';
      this.stateTimer = 0;
    }
  }

  _updateLanding(dt, p, groundY) {
    this.state.isFlying = true;
    const targetH = groundY + 1.0 + this.yOffset;
    p.y = THREE.MathUtils.lerp(p.y, targetH, Math.min(1, dt * 3.5));
    this.state.speed = this.flySpeed * 0.4;
    this._fire.setActive(false);

    if (Math.abs(p.y - targetH) < 0.2 || this.stateTimer > 2.0) {
      this.behaviorState = 'grounded';
      this.stateTimer = 0;
      this._groundDur = this._randBetween(this.groundTimeRange[0], this.groundTimeRange[1]);
    }
  }

  _updateGrounded(dt, p, groundY) {
    this.state.isFlying = false;
    p.y = THREE.MathUtils.lerp(p.y, groundY + this.yOffset, Math.min(1, dt * 6.0));
    this.state.speed = this.walkSpeed;
    this._fire.setActive(false);

    // prova melee se molto vicino
    if (this._distanceToPlayer() <= this.attackRange && this._cooldown <= 0) {
      this.behaviorState = 'attacking';
      this.stateTimer = 0;
      this._playAttack();
      return;
    }

    // riparti in volo
    if (this.stateTimer >= this._groundDur) {
      this.behaviorState = 'takingoff';
      this.stateTimer = 0;
    }

    this._cooldown = Math.max(0, this._cooldown - dt);
  }

  _updateAttacking(dt) {
    // sequenze gestite da _playAttack/_executeFireSequence
    this._cooldown = Math.max(0, this._cooldown - dt);
  }

  _executeAerialAttack() {
    this.behaviorState = 'attacking';
    this.stateTimer = 0;
    this._didHitThisAttack = false;

    // Sequenza “pulita” senza vento
    setTimeout(() => { this._fire.setIntensity(this.breathIntensity * 0.3); this._fire.setActive(true); }, 100);
    setTimeout(() => { this._fire.addExplosiveBurst?.(); this._fire.setIntensity(this.breathIntensity * 1.2); }, 600);
    setTimeout(() => { this._fire.setIntensity(this.breathIntensity); this._tryApplyAttackDamage(); }, 900);
    setTimeout(() => { this._fire.pulseIntensity?.(0.5, this.breathIntensity * 1.8); }, 2400);
    setTimeout(() => {
      this._fire.setActive(false);
      this.behaviorState = 'flying';
      this.stateTimer = 0;
      this._cooldown = this.attackCooldown;
      this.state.isAttacking = false;
    }, 3200);
  }

  _playAttack() {
    this._didHitThisAttack = false;
    const ok = this.animator?.playOverlay?.('attack', { loop: 'once', mode: 'full' });
    if (!ok) this._executeGroundFireSequence();
    else this._executeGroundFireSequence(); // se vuoi, sincronizza ai marker dell’animazione
  }

  _executeGroundFireSequence() {
    // Sequenza a terra (senza vento)
    setTimeout(() => { this._fire.setIntensity(this.breathIntensity * 0.3); this._fire.setActive(true); }, 100);
    setTimeout(() => { this._fire.addExplosiveBurst?.(); this._fire.setIntensity(this.breathIntensity * 1.2); }, 600);
    setTimeout(() => { this._fire.setIntensity(this.breathIntensity); this._tryApplyAttackDamage(); }, 900);
    setTimeout(() => { this._fire.pulseIntensity?.(0.5, this.breathIntensity * 1.8); }, 2400);
    setTimeout(() => {
      this._fire.setActive(false);
      this.behaviorState = 'grounded';
      this.stateTimer = 0;
      this._cooldown = this.attackCooldown;
      this.state.isAttacking = false;
    }, 3200);
  }

  // ===== Danni e morte =====
  _tryApplyAttackDamage() {
    if (this._didHitThisAttack) return;
    if (this._playerInFireCone()) {
      gameManager?.controller?.stats?.damage?.(this.attackDamage);
      this._didHitThisAttack = true;
      this._fire.addExplosiveBurst?.();
      this._fire.pulseIntensity?.(0.3, this.breathIntensity * 1.5);
      console.log('[Wyvern] FIRE DAMAGE applied:', this.attackDamage);
    }
  }

  takeDamage(amount, source = null) {
    super.takeDamage(amount, source);
    if (this.health > 0 && Math.random() < 0.3) {
      this._fire.addExplosiveBurst?.();
      this._fire.pulseIntensity?.(0.4, this.breathIntensity * 1.8);
    }
  }

  onKilled() {
    this._fire.setIntensity(this.breathIntensity * 2.0);
    this._fire.forceFire(2.0);
    this._fire.addExplosiveBurst?.();
    setTimeout(() => { this._fire.setActive(false); }, 2000);
    super.onKilled?.();
  }

  // ===== Utilità =====
  _getBreathRange() {
    const L = this._fire?.length ?? 0;
    const byFactor = (L > 0) ? (L * this.breathRangeFactor) : 0;
    return Math.max(this.attackRange, byFactor || 0);
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

  _randBetween(a, b) { return a + Math.random() * (b - a); }

  _currentTerrainY() {
    const p = this.model.position;
    return getTerrainHeightAt(p.x, p.z);
  }

  _circleDir(dt, speedFactor = 1) {
    this._angle += dt * 0.5 * speedFactor;
    return new THREE.Vector3(Math.cos(this._angle), 0, Math.sin(this._angle)).normalize();
  }

  _faceDir(dir, dt) { this.faceDirection(dir, this.turnK, dt); }

  _distanceToPlayer() {
    if (!this.player?.model) return Infinity;
    return this.model.position.distanceTo(this.player.model.position);
  }

  _tryHookMouth(verbose = false) {
    if (!this.model || this._mouthRef) return;

    // Ricerca esatta
    for (const name of this.mouthCandidatesExact) {
      const bone = this.model.getObjectByName(name);
      if (bone) { this._mouthRef = bone; if (verbose) console.log('[Wyvern] Found exact mouth bone:', name); break; }
    }

    // Ricerca per keyword
    if (!this._mouthRef) {
      const keywords = ['mouth','muzzle','jaw','head','snout','face','teeth','skull'];
      let bestMatch = null, bestScore = 0;
      this.model.traverse(obj => {
        if (!obj?.name) return;
        const nm = obj.name.toLowerCase();
        for (const kw of keywords) {
          if (nm.includes(kw)) {
            const score = kw === 'mouth' ? 10 : kw === 'head' ? 8 : 5;
            if (score > bestScore) { bestScore = score; bestMatch = obj; }
          }
        }
      });
      if (bestMatch) { this._mouthRef = bestMatch; if (verbose) console.log('[Wyvern] Found mouth by keyword:', bestMatch.name); }
    }

    // Setup finale
    const scale = this._getModelScale();
    const mouthOffset = new THREE.Vector3(0, 0.8 * scale, 2.5 * scale);

    if (this._mouthRef) {
      console.log('[Wyvern] ✅ Mouth reference:', this._mouthRef.name);
      this._mouthRef.add(this._debugMouthMarker);
      this._debugMouthMarker.position.copy(mouthOffset);

      this._fire.attachTo(this._mouthRef, mouthOffset);
      this._fire.invertForward(this.invertForward);
      this._fire.autoscaleFromParentWorldScale?.(1.5, 1.2);
    } else {
      console.warn('[Wyvern] ⚠️ No mouth bone found! Fallback to model root.');
      const fallbackOffset = new THREE.Vector3(0, 2.0 * scale, 3.5 * scale);
      this.model.add(this._debugMouthMarker);
      this._debugMouthMarker.position.copy(fallbackOffset);

      this._fire.attachTo(this.model, fallbackOffset);
      this._fire.autoscaleFromParentWorldScale?.(1.8, 1.5);
    }

    // Forza render order e no-cull ai children del fuoco
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

  _logHierarchy(root, { maxDepth = 8 } = {}) {
    try {
      const lines = [];
      const walk = (node, depth) => {
        if (!node || depth > maxDepth) return;
        lines.push(`${'  '.repeat(depth)}- ${node.type} ${node.name || ''}`);
        if (node.children) for (const c of node.children) walk(c, depth + 1);
      };
      walk(root, 0);
      console.groupCollapsed(`[Wyvern] Model Hierarchy (depth<=${maxDepth})`);
      console.log(lines.join('\n'));
      console.groupEnd();
    } catch (e) {
      console.warn('[Wyvern] Hierarchy logging error:', e);
    }
  }

  _computeModelDiagonal() {
    try {
      const box = new THREE.Box3().setFromObject(this.model);
      const size = new THREE.Vector3(); box.getSize(size);
      const diagonal = size.length();
      return diagonal || null;
    } catch (e) {
      console.warn('[Wyvern] Bounds computation error:', e);
      return null;
    }
  }

  // ===== API di test =====
  testFireBreath(seconds = 3.0, intensity = null) {
    console.log(`[Wyvern] Manual fire test: ${seconds}s, intensity: ${intensity || 'default'}`);
    if (intensity) this._fire.setIntensity(intensity);
    this._fire.forceFire(seconds);
    this._fire.addExplosiveBurst?.();
  }

  performSpectacularAttack() {
    console.log('[Wyvern] 🔥 SPECTACULAR FIRE ATTACK!');
    this.behaviorState = 'attacking';
    this.stateTimer = 0;
    this._didHitThisAttack = false;

    setTimeout(() => { this._fire.setIntensity(this.breathIntensity * 0.2); this._fire.setActive(true); }, 200);
    setTimeout(() => { this._fire.addExplosiveBurst?.(); this._fire.setIntensity(this.breathIntensity * 1.5); }, 800);
    setTimeout(() => { this._fire.pulseIntensity?.(1.0, this.breathIntensity * 2.5); }, 1200);
    setTimeout(() => { this._fire.addExplosiveBurst?.(); this._tryApplyAttackDamage(); }, 1600);
    setTimeout(() => {
      this._fire.pulseIntensity?.(0.8, this.breathIntensity * 3.0);
    }, 2200);
    setTimeout(() => {
      this._fire.setActive(false);
      this.behaviorState = 'grounded';
      this.stateTimer = 0;
      this._cooldown = this.attackCooldown * 2.0;
      this.state.isAttacking = false;
    }, 3500);
  }
}

export default WyvernEnemy;
