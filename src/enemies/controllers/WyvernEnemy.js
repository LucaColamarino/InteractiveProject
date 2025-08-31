// WyvernEnemy.js — Boss Wyvern (red fire, adult) semplificata
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

    // --- Fire breath range (dinamica, basata sulla lunghezza del cono) ---
    // Esempio: length 15 → breathRange ≈ 90m (factor 6).
    this.breathRangeFactor = 4.0;

    // ===== Debug Range/Angolo =====
    this._dbgDistIn = false;       // true se dist <= breathRange
    this._dbgAngleIn = false;      // true se angle <= attackAngleDeg/2
    this._dbgInRange = false;      // true se dist&angle ok
    this._dbgRangeLogTimer = 0;    // ping periodico se debugMode

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

    // ===== Attacco (melee di prossimità) =====
    this.attackRange     = opt.attackRange     ?? 12.0; // melee vicino
    this.attackAngleDeg  = opt.attackAngleDeg  ?? 85;   // cono ampio
    this.attackDamage    = opt.attackDamage    ?? 5;
    this._didHitThisAttack = false;

    // ===== Configurazione fissa “boss rosso adulto” =====
    this.breathIntensity = opt.breathIntensity ?? 8.0; // intensità base respiro
    this.mouthBoneName   = opt.mouthBoneName ?? null;
    this.invertForward   = !!opt.invertForward; // se il modello è invertito
    this.debugFireSeconds = opt.debugFireSeconds ?? 0;
    this.debugMode = opt.debugMode ?? true;

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

    // Sistema di fuoco (cono fisso: “adult”)
    const baseLength = 15.0;
    const baseRadius = 4.0;
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
        color: 0xff4444,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
        renderOrder: 9999
      })
    );
    this._debugMouthMarker.visible = this.debugMode;

    // ===== Variabili Comportamento =====
    this._angle = Math.random() * Math.PI * 2;
    this._flyDur = this._randBetween(...this.flyTimeRange);
    this._groundDur = this._randBetween(...this.groundTimeRange);
    this._altitude = this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);
    this._cooldown = 1.0;

    // ===== Effetti Avanzati =====
    this._windVector = new THREE.Vector3();
    this._breathPhase = 0;
    this._isChargingBreath = false;
    this._burstCounter = 0;

    // Helper vector
    this._tmpDir = new THREE.Vector3();
    this._tmpPos = new THREE.Vector3();
  }

  // ===== Range effettiva del respiro =====
  _getBreathRange() {
    const L = this._fire?.length ?? 0;
    const byFactor = (L > 0) ? (L * this.breathRangeFactor) : 0;
    return Math.max(this.attackRange, byFactor || 0);
  }

  // ===== Utility =====
  _randBetween(a, b) { return a + Math.random() * (b - a); }

  _currentTerrainY() {
    const p = this.model.position;
    return getTerrainHeightAt(p.x, p.z);
  }

  _circleDir(dt, speedFactor = 1) {
    this._angle += dt * 0.5 * speedFactor;
    return new THREE.Vector3(Math.cos(this._angle), 0, Math.sin(this._angle)).normalize();
  }

  _faceDir(dir, dt) {
    this.faceDirection(dir, this.turnK, dt);
  }

  _facePlayer(dt) {
    if (!this.player?.model) return;
    this.setTarget(this.player.model);
    this.faceTarget(this.turnK, dt);
  }

  _distanceToPlayer() {
    if (!this.player?.model) return Infinity;
    return this.model.position.distanceTo(this.player.model.position);
  }

  // ===== Check in cono di fuoco (range respiro + angolo) =====
  _playerInFireCone() {
    const playerObj = this.player?.model;
    if (!playerObj || !this.model) return false;

    // distanza
    const wyvPos = this.model.position;
    const toP = this._tmpDir.subVectors(playerObj.position, wyvPos);
    const dist = toP.length();

    // range del respiro
    const breathRange = this._getBreathRange();
    const inDist = dist <= breathRange;

    // angolo rispetto alla direzione di fuoco
    this.model.getWorldDirection(this._tmpPos);
    const fireDir = this.invertForward ? this._tmpPos.negate() : this._tmpPos.clone();
    const toPNorm = toP.normalize();
    const cos = THREE.MathUtils.clamp(fireDir.dot(toPNorm), -1, 1);
    const angleDeg = Math.acos(cos) * THREE.MathUtils.RAD2DEG;

    const halfCone = this.attackAngleDeg * 0.5;
    const inAngle = angleDeg <= halfCone;

    // log transizioni + stato combinato
    this._updateRangeLogs({ dist, inDist, angleDeg, halfCone, inAngle, breathRange });

    return inDist && inAngle;
  }

  _updateRangeLogs({ dist, inDist, angleDeg, halfCone, inAngle, breathRange }) {
    // Distanza (respiro)
    if (inDist !== this._dbgDistIn) {
      this._dbgDistIn = inDist;
      if (inDist) {
        console.log(
          `[Wyvern][RANGE] ENTER distance (breath): dist=${dist.toFixed(2)} ≤ breathRange=${breathRange.toFixed(2)} (melee=${this.attackRange})`
        );
      } else {
        console.log(
          `[Wyvern][RANGE] EXIT distance (breath): dist=${dist.toFixed(2)} > breathRange=${breathRange.toFixed(2)} (melee=${this.attackRange})`
        );
      }
    }

    // Angolo
    if (inAngle !== this._dbgAngleIn) {
      this._dbgAngleIn = inAngle;
      if (inAngle) {
        console.log(`[Wyvern][RANGE] ENTER angle: angle=${angleDeg.toFixed(1)}° ≤ halfCone=${halfCone.toFixed(1)}°`);
      } else {
        console.log(`[Wyvern][RANGE] EXIT angle: angle=${angleDeg.toFixed(1)}° > halfCone=${halfCone.toFixed(1)}°`);
      }
    }

    // Stato combinato
    const nowInRange = inDist && inAngle;
    if (nowInRange !== this._dbgInRange) {
      this._dbgInRange = nowInRange;
      if (nowInRange) {
        console.log(`[Wyvern][RANGE] ✅ ATTACKABLE (BREATH) dist=${dist.toFixed(2)}/${breathRange.toFixed(2)} angle=${angleDeg.toFixed(1)}°≤${halfCone.toFixed(1)}°`);
      } else {
        const why = inDist ? 'ANGLE' : (inAngle ? 'DISTANCE' : 'DISTANCE+ANGLE');
        console.log(`[Wyvern][RANGE] ⛔ NOT ATTACKABLE (BREATH; missing ${why}) dist=${dist.toFixed(2)}/${breathRange.toFixed(2)} angle=${angleDeg.toFixed(1)}°`);
      }
    }

    if (this.debugMode) {
      this._dbgLastRangeSnapshot = { dist, angleDeg, halfCone, breathRange };
    }
  }

  _tryApplyAttackDamage() {
    if (this._didHitThisAttack) return;
    if (this._playerInFireCone()) {
      gameManager?.controller?.stats?.damage?.(this.attackDamage);
      this._didHitThisAttack = true;

      // Effetto visivo per il colpo
      this._fire.addExplosiveBurst?.();
      this._fire.pulseIntensity?.(0.3, this.breathIntensity * 1.5);

      console.log('[Wyvern] FIRE DAMAGE applied:', this.attackDamage);
    }
  }

  // ===== Animazioni e Effetti =====
  _playTakeoff() {
    const ok = this.animator?.playOverlay?.('takeoff', { loop: 'once', mode: 'full' });
    if (!ok) {
      this.behaviorState = 'flying';
      this.stateTimer = 0;
    }
  }

  _playAttack() {
    this._didHitThisAttack = false;
    this._isChargingBreath = true;
    this._breathPhase = 0;

    console.log('[Wyvern] Starting advanced fire attack sequence');

    const ok = this.animator?.playOverlay?.('attack', { loop: 'once', mode: 'full' });
    if (!ok) {
      console.log('[Wyvern] No attack animation, executing fire sequence');
      this._executeFireSequence();
    }
  }

  _executeFireSequence() {
    // Sequenza senza animazione
    setTimeout(() => {
      console.log('[Wyvern] Phase 1: Charging breath');
      this._fire.setIntensity(this.breathIntensity * 0.3);
      this._fire.setActive(true);
    }, 100);

    setTimeout(() => {
      console.log('[Wyvern] Phase 2: Initial burst');
      this._fire.addExplosiveBurst?.();
      this._fire.setIntensity(this.breathIntensity * 1.2);
    }, 600);

    setTimeout(() => {
      console.log('[Wyvern] Phase 3: Sustained fire');
      this._fire.setIntensity(this.breathIntensity);
      this._tryApplyAttackDamage();
    }, 900);

    setTimeout(() => {
      console.log('[Wyvern] Phase 4: Final pulse');
      this._fire.pulseIntensity?.(0.5, this.breathIntensity * 1.8);
    }, 2400);

    setTimeout(() => {
      console.log('[Wyvern] Fire sequence complete');
      this._fire.setActive(false);
      this._isChargingBreath = false;
      this.behaviorState = 'grounded';
      this.stateTimer = 0;
      this._cooldown = this.attackCooldown;
      this.state.isAttacking = false;
    }, 3200);
  }

  // ===== Setup e Hook =====
  onModelReady() {
    console.log('[Wyvern] Model ready, setting up fire system');
    this._logHierarchy(this.model, { maxDepth: 8 });
    this._tryHookMouth(true);

    // Disabilita frustum culling (evita sparizioni con il cono)
    this.model.traverse(o => { o.frustumCulled = false; });

    // Autoscale basato sul modello
    const diag = this._computeModelDiagonal();
    if (diag) {
      console.log('[Wyvern] Auto-scaling fire system to model size:', diag.toFixed(2));
      this._fire.autoscaleFromModelBounds?.(diag, 0.5, 0.18);
    }

    // Setup finale del sistema
    this._fire.setIntensity(this.breathIntensity);

    // Test iniziale se richiesto
    if (this.debugFireSeconds > 0) {
      console.log(`[Wyvern] DEBUG: Initial fire test for ${this.debugFireSeconds}s`);
      this._fire.forceFire(this.debugFireSeconds);
    }
  }

  _tryHookMouth(verbose = false) {
    if (!this.model || this._mouthRef) return;

    // Ricerca esatta
    for (const name of this.mouthCandidatesExact) {
      const bone = this.model.getObjectByName(name);
      if (bone) {
        this._mouthRef = bone;
        if (verbose) console.log('[Wyvern] Found exact mouth bone:', name);
        break;
      }
    }

    // Ricerca per parole chiave
    if (!this._mouthRef) {
      const keywords = ['mouth','muzzle','jaw','head','snout','face','teeth','skull'];
      let bestMatch = null;
      let bestScore = 0;

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

      if (bestMatch) {
        this._mouthRef = bestMatch;
        if (verbose) console.log('[Wyvern] Found mouth by keyword:', bestMatch.name);
      }
    }

    // Setup finale
    if (this._mouthRef) {
      console.log('[Wyvern] ✅ Mouth reference established:', this._mouthRef.name);

      // Offset dinamico basato sulla scala del modello
      const scale = this._getModelScale();
      const mouthOffset = new THREE.Vector3(0, 0.8 * scale, 2.5 * scale);

      // Aggiungi marker e sistema di fuoco
      this._mouthRef.add(this._debugMouthMarker);
      this._debugMouthMarker.position.copy(mouthOffset);

      this._fire.attachTo(this._mouthRef, mouthOffset);
      this._fire.invertForward(this.invertForward);

      // Autoscale proporzionale
      this._fire.autoscaleFromParentWorldScale?.(1.5, 1.2);

    } else {
      console.warn('[Wyvern] ⚠️ No mouth bone found! Using model root with forward offset');
      const scale = this._getModelScale();
      const fallbackOffset = new THREE.Vector3(0, 2.0 * scale, 3.5 * scale);

      this.model.add(this._debugMouthMarker);
      this._debugMouthMarker.position.copy(fallbackOffset);

      this._fire.attachTo(this.model, fallbackOffset);
      this._fire.autoscaleFromParentWorldScale?.(1.8, 1.5);
    }

    // Forza render order e no-cull ai children del fuoco
    this._fire.group.renderOrder = 1001;
    this._fire.group.traverse(child => {
      if (child.material) {
        child.renderOrder = 1001;
        child.frustumCulled = false;
      }
    });
  }

  _getModelScale() {
    if (!this.model) return 1.0;
    const s = new THREE.Vector3();
    this.model.getWorldScale(s);
    return (Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.z)) / 3;
  }

  // ===== Update FSM =====
  update(dt) {
    // Sistema di fuoco e hook
    this._tryHookMouth(false);
    this._fire.update?.(dt);

    // Effetti ambientali
    this._updateEnvironmentalEffects(dt);

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

    // Ping (BREATH range)
    if (this.debugMode) {
      this._dbgRangeLogTimer += dt;
      if (this._dbgRangeLogTimer >= 0.5) {
        this._dbgRangeLogTimer = 0;
        if (this.player?.model) {
          const dist = this.model.position.distanceTo(this.player.model.position);
          this.model.getWorldDirection(this._tmpPos);
          const fireDir = this.invertForward ? this._tmpPos.negate() : this._tmpPos.clone();
          const toP = this._tmpDir.subVectors(this.player.model.position, this.model.position).normalize();
          const angleDeg = Math.acos(THREE.MathUtils.clamp(fireDir.dot(toP), -1, 1)) * THREE.MathUtils.RAD2DEG;
          const halfCone = this.attackAngleDeg * 0.5;
          const breathRange = this._getBreathRange();

          console.log(
            `[Wyvern][RANGE/ping] dist=${dist.toFixed(2)} (≤${breathRange.toFixed(2)} BREATH | melee ${this.attackRange}) | ` +
            `angle=${angleDeg.toFixed(1)}° (≤${halfCone.toFixed(1)}°) | ` +
            `inDist=${dist<=breathRange} inAngle=${angleDeg<=halfCone} inRange=${(dist<=breathRange)&&(angleDeg<=halfCone)}`
          );
        }
      }
    }

    this.updateAnimFromMove();
  }

  _updateEnvironmentalEffects(dt) {
    // vento “lieve” sul cono
    this._windVector.x = Math.sin(this.stateTimer * 0.8) * 0.3;
    this._windVector.y = 0;
    this._windVector.z = Math.cos(this.stateTimer * 1.2) * 0.2;
    this._fire.setWindEffect?.(this._windVector);
  }

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
      this._flyDur = this._randBetween(...this.flyTimeRange);
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

    // Attacco aereo se nel raggio del respiro
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
    const targetY = groundY + this.yOffset;
    p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 3.0));

    const dir = this._circleDir(dt, 0.5);
    p.x += dir.x * this.walkSpeed * 0.4 * dt;
    p.z += dir.z * this.walkSpeed * 0.4 * dt;
    this._faceDir(dir, dt);
    this.state.speed = 0.6;
    this.state.isFlying = false;
    this._fire.setActive(false);

    if (Math.abs(p.y - targetY) < 0.12) {
      p.y = targetY;
      this.behaviorState = 'grounded';
      this.stateTimer = 0;
      this._groundDur = this._randBetween(...this.groundTimeRange);
      this._cooldown = 0.3; // Cooldown breve
    }
  }

  _updateGrounded(dt, p, groundY) {
    this.state.isFlying = false;
    if (this.player?.model) this._facePlayer(dt);

    // Movimento circolare più naturale
    const dir = this._circleDir(dt, 0.3);
    this.model.position.addScaledVector(dir, this.walkSpeed * dt);

    // Altitudine terreno
    const targetY = getTerrainHeightAt(p.x, p.z) + this.yOffset;
    p.y = THREE.MathUtils.lerp(p.y, targetY, Math.min(1, dt * 8));
    this.state.speed = this.walkSpeed;

    this._fire.setActive(false);
    this._cooldown -= dt;

    const distToPlayer = this._distanceToPlayer();
    const breathRange  = this._getBreathRange();

    // Attacco: melee ravvicinato vs fuoco a distanza
    if (this._cooldown <= 0) {
      if (distToPlayer <= this.attackRange * 0.6) {
        this._executeCloseRangeAttack();
      } else if (distToPlayer <= breathRange) {
        this._executeLongRangeAttack();
      }
    }

    if (this.stateTimer >= this._groundDur) {
      this.behaviorState = 'takingoff';
      this.stateTimer = 0;
      this._altitude = this.altitudeMin + Math.random() * (this.altitudeMax - this.altitudeMin);
      this._playTakeoff();
    }
  }

  _updateAttacking(dt) {
    this.state.isFlying = false;
    this.state.isAttacking = true;
    this._facePlayer(dt);
    this.state.speed = 0;

    const dur = this.animator?.getClipDuration?.('attack') || 2.5;
    const oc = this.animator?.overlayCtx;
    const t = oc?.t ?? this.stateTimer;

    // Sequenza di fuoco sincronizzata con animazione
    this._updateFireSequence(t, dur);

    // Fine animazione
    if (!oc || oc.name !== this.animator?.names?.attack || t >= dur * 0.95) {
      this._fire.setActive(false);
      this.behaviorState = 'grounded';
      this.stateTimer = 0;
      this._cooldown = this.attackCooldown;
      this.state.isAttacking = false;
      this._isChargingBreath = false;
    }
  }

  _updateFireSequence(t, duration) {
    const progress = t / duration;

    if (progress < 0.2) {
      // Carica
      if (!this._isChargingBreath) {
        this._isChargingBreath = true;
        this._fire.setIntensity(this.breathIntensity * 0.4);
        this._fire.setActive(true);
      }
    } else if (progress < 0.3) {
      // Burst
      if (this._breathPhase < 1) {
        this._breathPhase = 1;
        this._fire.addExplosiveBurst?.();
        this._fire.setIntensity(this.breathIntensity * 1.3);
      }
    } else if (progress < 0.8) {
      // Sostenuta
      if (this._breathPhase < 2) {
        this._breathPhase = 2;
        this._fire.setIntensity(this.breathIntensity);
      }
      this._tryApplyAttackDamage();

      // Pulse intermittenti
      if (Math.floor(t * 4) % 2 === 0 && this._burstCounter < 3) {
        this._fire.pulseIntensity?.(0.2, this.breathIntensity * 1.4);
        this._burstCounter++;
      }
    } else {
      // Finale
      if (this._breathPhase < 3) {
        this._breathPhase = 3;
        this._fire.pulseIntensity?.(0.4, this.breathIntensity * 2.0);
        this._burstCounter = 0;
      }
    }
  }

  // ===== Tipi di Attacco =====
  _executeCloseRangeAttack() {
    console.log('[Wyvern] Close range fire attack!');
    this.behaviorState = 'attacking';
    this.stateTimer = 0;
    this._playAttack();
  }

  _executeLongRangeAttack() {
    console.log('[Wyvern] Long range fire attack!');
    this.behaviorState = 'attacking';
    this.stateTimer = 0;
    this._playAttack();
  }

  _executeAerialAttack() {
    console.log('[Wyvern] Aerial fire strafe!');
    this._fire.setIntensity(this.breathIntensity * 0.8);
    this._fire.forceFire(1.5);
    this._fire.addExplosiveBurst?.();
    this._cooldown = this.attackCooldown * 1.5; // Cooldown più lungo per attacchi aerei
  }

  // ===== Debug e Utility =====
  _logHierarchy(root, { maxDepth = 6 } = {}) {
    try {
      const lines = [];
      const walk = (o, d = 0) => {
        if (!o) return;
        const bones = o.isBone ? ' [BONE]' : '';
        const mesh = o.isMesh ? ' [MESH]' : '';
        lines.push(`${'  '.repeat(d)}- ${o.name || '(no-name)'} [${o.type}]${bones}${mesh}`);
        if (d >= maxDepth) return;
        for (const c of o.children || []) walk(c, d + 1);
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
      const size = new THREE.Vector3();
      box.getSize(size);
      const diagonal = size.length();
      console.log('[Wyvern] Model bounds - size:', size.toArray().map(x => x.toFixed(2)),
        'diagonal:', diagonal.toFixed(2));
      return diagonal || null;
    } catch (e) {
      console.warn('[Wyvern] Bounds computation error:', e);
      return null;
    }
  }

  // ===== API Pubblica =====
  testFireBreath(seconds = 3.0, intensity = null) {
    console.log(`[Wyvern] Manual fire test: ${seconds}s, intensity: ${intensity || 'default'}`);
    if (intensity) this._fire.setIntensity(intensity);
    this._fire.forceFire(seconds);
    this._fire.addExplosiveBurst?.();
  }

  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    this._debugMouthMarker.visible = this.debugMode;
    this._fire.showHelpers?.(this.debugMode);
    console.log('[Wyvern] Debug mode:', this.debugMode ? 'ENABLED' : 'DISABLED');
    if (this.debugMode) this.logFireStats();
  }

  logFireStats() {
    const stats = this._fire.getStats?.();
    console.log('[Wyvern] Fire System Stats:', stats || '(no stats)');
    console.log('[Wyvern] Config:', {
      attackRange: this.attackRange,
      attackDamage: this.attackDamage,
      breathIntensity: this.breathIntensity,
      mouthBone: this._mouthRef?.name || 'NOT_FOUND'
    });
  }

  performSpectacularAttack() {
    console.log('[Wyvern] 🔥 SPECTACULAR FIRE ATTACK!');
    this.behaviorState = 'attacking';
    this.stateTimer = 0;
    this._didHitThisAttack = false;

    setTimeout(() => {
      this._fire.setIntensity(this.breathIntensity * 0.2);
      this._fire.setActive(true);
    }, 200);

    setTimeout(() => {
      this._fire.addExplosiveBurst?.();
      this._fire.setIntensity(this.breathIntensity * 1.5);
    }, 800);

    setTimeout(() => {
      this._fire.pulseIntensity?.(1.0, this.breathIntensity * 2.5);
    }, 1200);

    setTimeout(() => {
      this._fire.addExplosiveBurst?.();
      this._tryApplyAttackDamage();
    }, 1600);

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

  // ===== Controlli Manuali per Test =====
  forceState(newState) {
    console.log(`[Wyvern] Force state change: ${this.behaviorState} -> ${newState}`);
    this.behaviorState = newState;
    this.stateTimer = 0;
    if (newState === 'attacking') this._playAttack();
  }

  forceAttack() {
    console.log('[Wyvern] 🎯 FORCED ATTACK SEQUENCE!');
    this.forceState('attacking');
  }

  // ===== Danni e Morte =====
  takeDamage(amount, source = null) {
    super.takeDamage(amount, source);
    if (this.health > 0 && Math.random() < 0.3) {
      console.log('[Wyvern] Pain response - angry fire burst!');
      this._fire.addExplosiveBurst?.();
      this._fire.pulseIntensity?.(0.4, this.breathIntensity * 1.8);
    }
  }

  onKilled() {
    console.log('[Wyvern] Death sequence - final fire burst');
    this._fire.setIntensity(this.breathIntensity * 2.0);
    this._fire.forceFire(2.0);
    this._fire.addExplosiveBurst?.();
    setTimeout(() => { this._fire.setActive(false); }, 2000);
    super.onKilled?.();
  }

  // ===== Dispose =====
  dispose() {
    console.log('[Wyvern] Disposing fire system');
    this._fire?.dispose();
    if (this._debugMouthMarker) {
      this._debugMouthMarker.geometry?.dispose();
      this._debugMouthMarker.material?.dispose();
      if (this._debugMouthMarker.parent) this._debugMouthMarker.parent.remove(this._debugMouthMarker);
    }
    super.dispose?.();
  }

  // ===== Getters =====
  get fireSystem() { return this._fire; }
  get isBreathingFire() { return this._fire?.isActive?.() || false; }
  get mouthPosition() {
    if (this._mouthRef) {
      const worldPos = new THREE.Vector3();
      this._mouthRef.getWorldPosition(worldPos);
      return worldPos;
    }
    return this.model.position.clone();
  }
  get fireDirection() {
    if (this._mouthRef) {
      const worldDir = new THREE.Vector3();
      this._mouthRef.getWorldDirection(worldDir);
      return this.invertForward ? worldDir.negate() : worldDir;
    }
    this.model.getWorldDirection(this._tmpDir);
    return this.invertForward ? this._tmpDir.negate() : this._tmpDir;
  }

  // ===== API di Debug Pubblica =====
  debugCommands() {
    return {
      'fire(seconds)': 'this.testFireBreath(seconds)',
      'attack()': 'this.forceAttack()',
      'spectacular()': 'this.performSpectacularAttack()',
      'wall()': 'this.createFireWall()',
      'helpers()': 'this.toggleDebugMode()',
      'stats()': 'this.logFireStats()',
    };
  }

  printDebugHelp() {
    console.log('[Wyvern] 🐉 DEBUG COMMANDS:');
    const commands = this.debugCommands();
    for (const [cmd, code] of Object.entries(commands)) {
      console.log(`  ${cmd} -> ${code}`);
    }
    console.log('\nExample: wyvern.testFireBreath(5.0) // 5 second fire test');
  }

  // ===== Effetti Speciali Aggiuntivi =====
  breatheFireAtPosition(worldPos, duration = 2.0) {
    if (!worldPos) return;
    this.model.lookAt(worldPos);
    console.log('[Wyvern] Breathing fire at position:', worldPos.toArray().map(x => x.toFixed(1)));
    this._fire.forceFire(duration);
    this._fire.addExplosiveBurst?.();
  }

  createFireWall(duration = 4.0) {
    console.log('[Wyvern] 🔥 CREATING FIRE WALL!');
    this._fire.setIntensity(this.breathIntensity * 1.5);
    this._fire.setActive(true);
    let elapsed = 0;
    const rotateAndBreathe = () => {
      elapsed += 0.1;
      if (elapsed < duration) {
        this.model.rotateY(Math.PI * 0.05);
        this._fire.addExplosiveBurst?.();
        setTimeout(rotateAndBreathe, 100);
      } else {
        this._fire.setActive(false);
        console.log('[Wyvern] Fire wall complete');
      }
    };
    rotateAndBreathe();
  }
}
