// components/Animator.js
import * as THREE from 'three';

export class Animator {
  /**
   * @param {{mixer: THREE.AnimationMixer, actions: Record<string, THREE.AnimationAction>}} animComp
   * @param {{get: () => any}} stateRefFn  // function che ritorna player.state
   */
  constructor(animComp, stateRefFn) {
    this.mixer = animComp?.mixer || null;
    this.actions = animComp?.actions || {};
    this._getState = stateRefFn || (() => ({}));

    // Layer semplici: 'loco' (idle/walk/run/fly/sit), 'full' (attacco, jump, die, block...)
    this._active = { loco: null, full: null };

    // config fade
    this._fadeIn = 0.12;
    this._fadeOut = 0.12;

    // normalizza loop e ripuliamo peso quando un non-loop termina
    if (this.mixer) {
      this.mixer.addEventListener('finished', (e) => {
        const a = e?.action;
        if (a) a.setEffectiveWeight?.(0);
        // se finisce un'azione "full", rilascia il layer
        if (a && this._active.full === a._clipName) {
          this._active.full = null;
        }
      });
    }

    // Flag per evitare replay a ogni frame
    this._lastDesiredLoco = null;

    // Avvio idle se esiste
    if (this.actions.idle) {
      this._safeEnable(this.actions.idle);
      this._playOnLayer('loco', 'idle', { force: true, noStopOthers: false });
    }
  }

  /** chiamare a ogni frame con dt */
  update(dt) {
    if (this.mixer) this.mixer.update(Math.min(dt, 1/30));

    const s = this._getState() || {};

    // Se è in corso un'azione 'full', non tocchiamo la locomozione?
    // No: la locomozione resta *preparata* sotto, ma con weight=0 durante il full.
    const desiredLoco =
      s.isSitting ? 'sitIdle' :
      s.isFlying  ? 'fly' :
      (s.speed ?? 0) < 0.1 ? 'idle' :
      s.isSprinting ? 'run' : 'walk';

    if (desiredLoco !== this._lastDesiredLoco) {
      // Accendi la locomozione desiderata, spegnendo altre locomozioni
      this._playOnLayer('loco', desiredLoco, { noStopOthers: false });
      this._lastDesiredLoco = desiredLoco;
    }

    // Se c’è un’azione full attiva, abbassa il peso della locomozione (fadeOut dolce)
    if (this._active.full) {
      this._setGroupWeight(['idle','walk','run','fly','sitIdle'], 0.0);
    } else {
      // rialza peso loco: la _playOnLayer l’ha già accesa, qui assicuriamo che le altre siano a 0
      this._setExclusive(['idle','walk','run','fly','sitIdle'], desiredLoco);
    }
  }

  /** API di alto livello per le azioni "full body" (attacchi, jump, die, block...) */
  playAction(name, { fadeIn = 0.1, fadeOut = 0.08 } = {}) {
    const a = this.actions[name];
    if (!a) return false;

    // spegni eventuale full in corso
    if (this._active.full && this._active.full !== name) {
      const cur = this.actions[this._active.full];
      cur?.fadeOut?.(fadeOut);
    }

    // alza questa
    this._safeEnable(a);
    a.reset().fadeIn(fadeIn).play();
    a._clipName = name;

    // abbassa locomozione
    this._setGroupWeight(['idle','walk','run','fly','sitIdle'], 0.0);

    this._active.full = name;
    return true;
  }

  /** Spegni manualmente un'azione full (se serve) */
  stopAction(name, { fadeOut = 0.08 } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.fadeOut?.(fadeOut);
    a.stop?.();
    if (this._active.full === name) this._active.full = null;
  }

  // -------- internals ----------

  _safeEnable(a) {
    a.enabled = true;
    if (typeof a.setEffectiveWeight === 'function') a.setEffectiveWeight(1);
    if (typeof a.setEffectiveTimeScale === 'function') a.setEffectiveTimeScale(1);
  }

  _playOnLayer(layer, name, { force = false, noStopOthers = false } = {}) {
    const a = this.actions[name];
    if (!a) return;

    if (!force && this._active[layer] === name && a.isRunning?.()) return;

    // accendi
    this._safeEnable(a);
    a.reset().fadeIn(this._fadeIn).play();
    a._clipName = name;

    // spegni le altre del layer
    if (!noStopOthers) {
      const group = (layer === 'loco')
        ? ['idle','walk','run','fly','sitIdle']
        : Object.keys(this.actions);

      for (const k of group) {
        if (k === name) continue;
        const other = this.actions[k];
        if (!other) continue;
        if (layer === 'loco' && !['idle','walk','run','fly','sitIdle'].includes(k)) continue; // solo locomozione
        if (other.isRunning?.()) other.fadeOut?.(this._fadeOut);
      }
    }
    this._active[layer] = name;
  }

  _setGroupWeight(names, targetW) {
    for (const n of names) {
      const a = this.actions[n];
      if (a) a.setEffectiveWeight?.(targetW);
    }
  }

  _setExclusive(group, onName) {
    for (const n of group) {
      const a = this.actions[n];
      if (!a) continue;
      a.setEffectiveWeight?.(n === onName ? 1 : 0);
    }
  }
}
