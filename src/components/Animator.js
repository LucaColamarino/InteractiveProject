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

    // Overlay: 'full' (attack/jump/die/block...)
    this._activeFull = null;

    // Config
    this._blendSpeed = 8.0;      // reattività del blending (↑ = più snappy)
    this._flyBlend   = 10.0;     // reattività su fly/sit
    this._fullFadeIn = 0.16;
    this._fullFadeOut= 0.16;

    // Soglie velocità per il blendspace (m/s)
    this._tWalkOn  = 0.25;  // inizio transizione idle→walk
    this._tRunOn   = 5.5;   // inizio transizione walk→run
    this._tRunFull = 7.0;   // run piena

    // Pesi correnti (loco)
    this._w = { idle: 1, walk: 0, run: 0, fly: 0, sitIdle: 0 };
    this._targetW = { ...this._w };

    if (this.mixer) {
      this.mixer.addEventListener('finished', (e) => {
        const a = e?.action;
        if (a) a.setEffectiveWeight?.(0);
        if (a && this._activeFull === a._clipName) this._activeFull = null;
      });
    }

    // Avvio locomotive: tieni idle/walk/run sempre in play
    this._ensurePlayLoop('idle', 1);
    this._ensurePlayLoop('walk', 0);
    this._ensurePlayLoop('run',  0);
    // opzionali
    this._ensurePlayLoop('fly',     0);
    this._ensurePlayLoop('sitIdle', 0);
  }

  /** Call every frame */
  update(dt) {
    if (this.mixer) this.mixer.update(Math.min(dt, 1/30));
    const s = this._getState() || {};
    const v = s.speed ?? 0;

    // Decidi target weights
    if (s.isSitting && this.actions.sitIdle) {
      this._setTargetSolo('sitIdle');
    } else if (s.isFlying && this.actions.fly) {
      this._setTargetSolo('fly');
    } else {
      // 1D blendspace: idle↔walk↔run
      const iw = this._remapClamped(v, 0,   this._tWalkOn, 1, 0); // idle piena a v=0 → 0 a v>=tWalkOn
      const wr = this._remapClamped(v, this._tWalkOn, this._tRunOn, 0, 1); // walk sale tra soglie
      const rr = this._remapClamped(v, this._tRunOn, this._tRunFull, 0, 1); // run sale dopo runOn

      // Normalizza morbido: idle prende quel che resta
      const wRun  = rr;
      const wWalk = Math.max(0, wr * (1 - wRun));
      const wIdle = Math.max(0, 1 - (wWalk + wRun));

      this._targetW.idle = wIdle;
      this._targetW.walk = wWalk;
      this._targetW.run  = wRun;
      this._targetW.fly = 0;
      this._targetW.sitIdle = 0;
    }

    // Se una full action è attiva, porta a 0 i pesi loco ma lentamente (niente snap)
    if (this._activeFull) {
      this._targetW.idle = 0;
      this._targetW.walk = 0;
      this._targetW.run  = 0;
    }

    // Interpola i pesi verso il target
    const k = (this._activeFull ? this._flyBlend : this._blendSpeed) * dt;
    this._w.idle    = this._lerp(this._w.idle,    this._targetW.idle,    k);
    this._w.walk    = this._lerp(this._w.walk,    this._targetW.walk,    k);
    this._w.run     = this._lerp(this._w.run,     this._targetW.run,     k);
    this._w.fly     = this._lerp(this._w.fly,     this._targetW.fly,     k);
    this._w.sitIdle = this._lerp(this._w.sitIdle, this._targetW.sitIdle, k);

    // Applica i pesi alle actions (se esistono)
    this._applyWeight('idle',    this._w.idle);
    this._applyWeight('walk',    this._w.walk);
    this._applyWeight('run',     this._w.run);
    this._applyWeight('fly',     this._w.fly);
    this._applyWeight('sitIdle', this._w.sitIdle);
  }

  /** Avvia un'azione full‑body (attacco/jump/die...) lasciando girare la locomozione sotto (peso→0) */
  playAction(name, { fadeIn = this._fullFadeIn, fadeOut = this._fullFadeOut } = {}) {
    const a = this.actions[name];
    if (!a) return false;

    if (this._activeFull && this._activeFull !== name) {
      this.actions[this._activeFull]?.fadeOut?.(fadeOut);
    }

    // tieni idle/walk/run in play, ma il loro peso bersaglio scende a 0 (gestito in update)
    this._ensurePlayLoop('idle');
    this._ensurePlayLoop('walk');
    this._ensurePlayLoop('run');

    this._safeEnable(a);
    a.reset().fadeIn(fadeIn).play();
    a._clipName = name;
    this._activeFull = name;
    return true;
  }

  stopAction(name, { fadeOut = this._fullFadeOut } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.fadeOut?.(fadeOut);
    a.stop?.();
    if (this._activeFull === name) this._activeFull = null;
  }

  // ===== internals =====

  _ensurePlayLoop(name, initialWeight = 0) {
    const a = this.actions[name];
    if (!a) return;
    a.enabled = true;
    a.setLoop?.(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    a.setEffectiveTimeScale?.(1);
    if (!a.isRunning?.()) a.play();
    a.setEffectiveWeight?.(initialWeight);
  }

  _applyWeight(name, w) {
    const a = this.actions[name];
    if (!a) return;
    a.enabled = true;
    a.setEffectiveWeight?.(w);
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

    // assicurati che siano in play così il rientro è fluido
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
