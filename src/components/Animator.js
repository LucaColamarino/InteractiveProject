// components/Animator.js
import * as THREE from 'three';

export class Animator {
  /**
   * @param {{mixer: THREE.AnimationMixer, actions: Record<string, THREE.AnimationAction>}} animComp
   * @param {() => any} stateRefFn
   */
  constructor(animComp, stateRefFn) {
    this.mixer = animComp?.mixer || null;
    this.actions = animComp?.actions || {};
    this._getState = stateRefFn || (() => ({}));

    // Overlay full-body (attack/jump/die...)
    this._activeFull = null;
    this._fullFading = false; // evita retrigger del fadeOut anticipato

    // Config blending
    this._blendSpeed   = 8.0;   // reattività blend locomozione
    this._flyBlend     = 10.0;  // reattività quando c'è overlay
    this._fullFadeIn   = 0.16;
    this._fullFadeOut  = 0.16;
    this._isHoldFull = false;
    this._holdReleasing = false;
    // Anticipo rientro loco PRIMA che la full finisca
    this._fullBackWindow = 0.20; // secondi finali in cui rientra la locomozione

    // Floor anti T-pose
    this._weightFloor = 0.06; // peso minimo totale
    this._locoHold    = 0.12; // sostegno loco start/stop full

    // Soglie velocità per blendspace
    this._tWalkOn  = 0.25;
    this._tRunOn   = 5.5;
    this._tRunFull = 6.5;

    // Pesi correnti/target
    this._w = { idle: 1, walk: 0, run: 0, fly: 0, sitIdle: 0 };
    this._targetW = { ...this._w };

    // Timer sostegno loco
    this._locoSupportT = 0;

    if (this.mixer) {
      this.mixer.addEventListener('finished', (e) => {
        const a = e?.action;
        if (!a) return;
        // Non azzeriamo brutalmente il peso qui: il fadeOut anticipato l'ha già portato giù
        if (a && this._activeFull === a._clipName) {
          this._activeFull = null;
          this._fullFading = false;
          this._locoSupportT = this._locoHold; // piccolo sostegno nel rientro
        }
      });
    }

    // Avvia sempre le clip di locomozione
    this._ensurePlayLoop('idle', 1);
    this._ensurePlayLoop('walk', 0);
    this._ensurePlayLoop('run',  0);
    this._ensurePlayLoop('fly',  0);
    this._ensurePlayLoop('sitIdle', 0);
  }

  /** Call ogni frame */
  update(dt) {
    if (this.mixer) this.mixer.update(dt);
    const s = this._getState() || {};
    const v = s.speed ?? 0;

    if (this._locoSupportT > 0) this._locoSupportT -= dt;

    // === Target pesi locomozione (stato "desiderato") ===
    if (s.isSitting && this.actions.sitIdle) {
      this._setTargetSolo('sitIdle');
    } else if (s.isFlying && this.actions.fly) {
      this._setTargetSolo('fly');
    } else {
      // 1D blendspace: idle ↔ walk ↔ run
      console.log("Velocity:",v);
      const iw = this._remapClamped(v, 0, this._tWalkOn, 1, 0);
      const wr = this._remapClamped(v, this._tWalkOn, this._tRunOn, 0, 1);
      const rr = this._remapClamped(v, this._tRunOn, this._tRunFull, 0, 1);

      const wRun  = rr;
      const wWalk = Math.max(0, wr * (1 - wRun));
      const wIdle = Math.max(0, 1 - (wWalk + wRun));

      this._targetW.idle = wIdle;
      this._targetW.walk = wWalk;
      this._targetW.run  = wRun;
      this._targetW.fly = 0;
      this._targetW.sitIdle = 0;
    }

  // === Overlay full ===
if (this._activeFull) {
  const a = this.actions[this._activeFull];
  const clip = a?.getClip?.();
  const dur = clip?.duration || 0;
  const t   = a?.time ?? 0;

  // se l'action è ormai spenta, pulizia stati
  const w = a?.getEffectiveWeight?.() ?? 0;
  if (!a?.isRunning?.() || w <= 0.001) {
    this._activeFull = null;
    this._fullFading = false;
    this._isHoldFull = false;
    this._holdReleasing = false;
    this._locoSupportT = this._locoHold;
  } else {
    // Mentre la full è attiva:
    // - se è una HOLD attiva → sopprimi locomozione
    // - se stiamo “rilasciando” la hold → NON sopprimere, lasciamo fondere
    // - se è una full normale → applica antifade standard vicino alla fine clip
    let suppressLoco = false;

    if (this._isHoldFull) {
      suppressLoco = true;
    } else if (this._holdReleasing) {
      suppressLoco = false; // rientro dolce durante la sfumatura
    } else {
      // full “normale” (non hold): rientro negli ultimi istanti
      if (dur > 0 && (dur - t) <= this._fullBackWindow) {
        suppressLoco = false;
        if (!_bool(a, '_antifadeTriggered')) {
          a.fadeOut?.(this._fullFadeOut);
          a._antifadeTriggered = true;
          this._fullFading = true;
          this._locoSupportT = Math.max(this._locoSupportT, this._locoHold);
        }
      } else {
        suppressLoco = true;
      }
    }

    if (suppressLoco) {
      this._targetW.idle = 0;
      this._targetW.walk = 0;
      this._targetW.run  = 0;
      this._targetW.fly = 0;
      this._targetW.sitIdle = 0;
      if (this._locoSupportT <= 0) this._locoSupportT = this._locoHold;
    }
  }
}



    // === Interpola pesi verso target ===
    const k = (this._activeFull ? this._flyBlend : this._blendSpeed) * dt;
    this._w.idle    = this._lerp(this._w.idle,    this._targetW.idle,    k);
    this._w.walk    = this._lerp(this._w.walk,    this._targetW.walk,    k);
    this._w.run     = this._lerp(this._w.run,     this._targetW.run,     k);
    this._w.fly     = this._lerp(this._w.fly,     this._targetW.fly,     k);
    this._w.sitIdle = this._lerp(this._w.sitIdle, this._targetW.sitIdle, k);

    // === Floor anti T-pose ===
    const fullW = this._getActionWeight(this._activeFull);
    const locoSum = this._w.idle + this._w.walk + this._w.run + this._w.fly + this._w.sitIdle;
    const total = (fullW || 0) + locoSum;

    if (total < this._weightFloor) {
      const prefer =
        (this._targetW.run > 0.5) ? 'run' :
        (this._targetW.walk > 0.5) ? 'walk' :
        (this._targetW.fly  > 0.5) ? 'fly' :
        (this._targetW.sitIdle > 0.5) ? 'sitIdle' : 'idle';
      this._w[prefer] = Math.max(this._w[prefer], this._weightFloor);
    }

    if (this._locoSupportT > 0 && locoSum < 0.15) {
      const prefer = (this._targetW.walk + this._targetW.run > 0.5)
        ? (this._w.run > this._w.walk ? 'run' : 'walk')
        : 'idle';
      this._w[prefer] = Math.max(this._w[prefer], 0.15);
    }

    // === Applica pesi ===
    this._applyWeight('idle',    this._w.idle);
    this._applyWeight('walk',    this._w.walk);
    this._applyWeight('run',     this._w.run);
    this._applyWeight('fly',     this._w.fly);
    this._applyWeight('sitIdle', this._w.sitIdle);
  }

  /** Avvia un'azione full-body con overlap: niente T-pose a inizio */
  playAction(name, { fadeIn = this._fullFadeIn, fadeOut = this._fullFadeOut } = {}) {
    const a = this.actions[name];
    if (!a) return false;

    if (this._activeFull && this._activeFull !== name) {
      this.actions[this._activeFull]?.fadeOut?.(fadeOut);
      this._fullFading = true;
    }

    // Assicura che le loco restino in play (peso scenderà gradualmente)
    this._ensurePlayLoop('idle');
    this._ensurePlayLoop('walk');
    this._ensurePlayLoop('run');

    this._safeEnable(a);
    a.setLoop?.(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;

    // piccolo peso iniziale per evitare frame “zero”
    a.setEffectiveWeight?.(Math.max(0.05, a.getEffectiveWeight?.() ?? 0));
    a.reset().fadeIn(fadeIn).play();
    a._clipName = name;

    this._activeFull = name;
    this._fullFading = false;
    this._locoSupportT = this._locoHold; // sostieni loco nei primi ms
    // marca per il fadeOut anticipato (usato in update)
    a._antifadeTriggered = false;

    return true;
  }

  stopAction(name, { fadeOut = this._fullFadeOut } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.fadeOut?.(fadeOut);
    a.stop?.();
    if (this._activeFull === name) {
      this._activeFull = null;
      this._fullFading = false;
      this._locoSupportT = this._locoHold;
    }
  }

  /** Avvia un'azione full-body in modalità HOLD: loop infinito finché non la fermi */
playHold(name, { fadeIn = this._fullFadeIn } = {}) {
  const a = this.actions[name];
  if (!a) return false;

  // Se c'è già una full diversa, sfumala
  if (this._activeFull && this._activeFull !== name) {
    this.actions[this._activeFull]?.fadeOut?.(this._fullFadeOut);
    this._fullFading = true;
  }

  // Mantieni in play le loco (scenderanno di peso)
  this._ensurePlayLoop('idle');
  this._ensurePlayLoop('walk');
  this._ensurePlayLoop('run');

  this._safeEnable(a);
  a.setLoop?.(THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = false;
  a.setEffectiveWeight?.(Math.max(0.05, a.getEffectiveWeight?.() ?? 0));
  a.reset().fadeIn(fadeIn).play();
  a._clipName = name;

  this._activeFull = name;
  this._fullFading = false;
  this._isHoldFull = true;          // <— importante: siamo in modalità hold
  this._locoSupportT = this._locoHold;
  return true;
}

/** Ferma un'azione hold con fade-out pulito */
stopHold(name, { fadeOut = this._fullFadeOut, release = 0.20 } = {}) {
  const a = this.actions[name];
  if (!a) return;

  // sfuma ma NON stoppare subito: mantieni l’overlay finché il peso scende
  a.fadeOut?.(fadeOut);

  // durante il rilascio non sopprimiamo la locomozione
  this._isHoldFull = false;       // <— disattiva soppressione loco
  this._holdReleasing = true;     // <— siamo nella fase di uscita
  this._fullFading = true;

  // tieni attiva la full finché non scende di peso (chiuderemo in update)
  this._activeFull = name;

  // assicura che le loco siano in play per avere qualcosa su cui fondere
  this._ensurePlayLoop('idle');
  this._ensurePlayLoop('walk');
  this._ensurePlayLoop('run');

  // per un po' “aiuta” la locomozione a salire (rampa soft)
  this._locoSupportT = Math.max(this._locoSupportT, release);
}



  // ===== internals =====

  _ensurePlayLoop(name, initialWeight = undefined) {
    const a = this.actions[name];
    if (!a) return;
    a.enabled = true;
    a.setLoop?.(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    a.setEffectiveTimeScale?.(1);
    if (!a.isRunning?.()) a.play();
    if (initialWeight !== undefined) a.setEffectiveWeight?.(initialWeight);
  }

  _applyWeight(name, w) {
    const a = this.actions[name];
    if (!a) return;
    a.enabled = true;
    a.setEffectiveWeight?.(w);
  }

  _getActionWeight(name) {
    const a = name ? this.actions[name] : null;
    return a?.getEffectiveWeight ? a.getEffectiveWeight() : 0;
  }

  _safeEnable(a) {
    a.enabled = true;
    a.setEffectiveWeight?.(1);
    a.setEffectiveTimeScale?.(1);
  }

  _setTargetSolo(name) {
    this._targetW.idle = this._targetW.walk = this._targetW.run = 0;
    this._targetW.fly = this._targetW.sitIdle = 0;
    if (name === 'fly') this._targetW.fly = 1;
    else if (name === 'sitIdle') this._targetW.sitIdle = 1;

    // restano in play per rientro fluido
    this._ensurePlayLoop('idle');
    this._ensurePlayLoop('walk');
    this._ensurePlayLoop('run');
    this._ensurePlayLoop(name);
  }

  _remapClamped(x, a, b, y0, y1) {
    if (b === a) return (x <= a) ? y0 : y1;
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return y0 + (y1 - y0) * t;
  }

  _lerp(a, b, k) { return a + (b - a) * THREE.MathUtils.clamp(k, 0, 1); }
}

function _bool(obj, key){ return !!(obj && obj[key]); }
