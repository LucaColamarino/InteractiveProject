// Animator.js
import * as THREE from 'three';
import { AnimationComponent } from './AnimationComponent.js';

export class Animator {
  /**
   * @param {{mixer:THREE.AnimationMixer, actions:Object<string,THREE.AnimationAction>}} animCompRaw
   * @param {( )=>Object} stateRefFn  // funzione che ritorna lo stato esterno (speed, isFlying, ecc.)
   */
  constructor(animCompRaw, stateRefFn = () => ({})) {
    // Wrappa l'anim component
    this.comp = (animCompRaw instanceof AnimationComponent)
      ? animCompRaw
      : new AnimationComponent(animCompRaw?.mixer, animCompRaw?.actions);
    this._getState = stateRefFn;

    // Nomi standard (alias risolti automaticamente)
    this.names = {
      idle:    this._resolve(['idle','Idle','Idle_A','Idle_01','Breathing','DefaultIdle']),
      walk:    this._resolve(['walk','Walk','Walk_A','Walking']),
      run:     this._resolve(['run','Run','Run_A','Jog','Jogging']),
      fly:     this._resolve(['fly','Fly','Flying','Glide']),
      sitIdle: this._resolve(['sitIdle','Sit','Sitting','Sit_Idle']),
      back:    this._resolve(['back','Back','WalkBack','Walk_Back']),
      attack:  this._resolve(['attack','Attack','Shoot','Bow_Shoot','Punch','SwordAttack']),
      die:     this._resolve(['die','Death','Die']),
      jump:    this._resolve(['jump','Jump']),
    };

    // Se proprio non c'è idle, prova il primo loopabile come fallback
    if (!this.names.idle) this.names.idle = this._findAnyLoopable();

    // Parametri blending
    this.kLocom = 8.0;        // velocità blending locomotion
    this.kOverlay = 10.0;     // velocità quando c'è overlay
    this.fadeIn = 0.14;
    this.fadeOut = 0.16;
    this.backWindow = 0.20;   // finestra di anti-pop a fine overlay
    this.overlayCtx = { name: null, mode: 'full', once: true, dur: 0, t: 0 };
    // Anti T-pose
    this.floorTotal = 0.05;   // minimo totale
    this.floorIdle  = 0.20;   // minimo idle durante overlay/uscita
    this.keepBaseDuringOverlay = 0.20;  // quanto della base resta anche con overlay

    // Stato pesi
    this.w = { idle:1, walk:0, run:0, fly:0, sit:0, back:0, overlay:0 };
    this.tgt = { ...this.w };

    // Overlay correnti
    this.overlayName = null;   // name clip overlay in corso
    this.overlayOnce = true;

    // Soglie locomotion (m/s arbitrari; adatta in base al tuo gioco)
    this.v_walk_on   = 0.25;
    this.v_run_on    = 5.0;
    this.v_run_full  = 6.5;

    // Prepara loop base
    this._ensureBaseLoops();

    // Evento “finished” del mixer → sgancia overlay se è quello corrente
    this.comp?.mixer?.addEventListener?.('finished', (e) => {
      const act = e?.action;
      const ended = act?._clipName || null;
      if (ended && ended === this.overlayName) {
        // Fine overlay → rientro morbido
        this.stopOverlay();
        // spingi subito un po' di idle
        this._kickIdle(this.floorIdle);
      }
    });
  }

  // ---------- API PUBBLICA ----------

  /** Aggiorna usando lo stato esterno e blend */
  update(dt) {
    this.comp.update(dt);

    // --- overlay ctx (compat) ---
    const oc = this.overlayCtx || (this.overlayCtx = { name: null, mode: 'full', once: true, dur: 0, t: 0 });
    if (oc.name) oc.t += dt; else oc.t = 0;
    this.overlayName = oc.name; // compat con _applyOverlayWeight() esistente

    // Stato esterno
    const s = this._getState() || {};
    const speed       = +s.speed || 0;
    const isFlying    = !!s.isFlying;
    const isSitting   = !!s.isSitting;
    const isBacking   = !!s.isBacking;
    const isSprinting = !!s.isSprinting;

    // 1) Calcola TARGET locomotion
    if (isSitting && this.names.sitIdle) {
      this._soloTarget('sit');
    } else if (isFlying && this.names.fly) {
      this._soloTarget('fly');
    } else {
      this._calcGroundTargets(speed, isSprinting, isBacking);
    }

    // 2) Regole overlay per evitare blend con IDLE
    const hasOverlay = !!oc.name;
    if (hasOverlay) {
      const remaining = Math.max(0, (oc.dur || Infinity) - oc.t);

      if (oc.mode === 'full') {
        if (remaining > this.backWindow) {
          // Corpo dell'overlay: base a ZERO → niente deformazioni da somma con idle
          this.tgt.idle = 0; this.tgt.walk = 0; this.tgt.run = 0;
          this.tgt.fly  = 0; this.tgt.sit  = 0; this.tgt.back = 0;
        } else {
          // Back window: prepara rientro morbido senza T-pose
          this.tgt.idle = Math.max(this.tgt.idle, 0.35);
        }
      } else if (oc.mode === 'upper') {
        // Overlay "upper-body" (es. block): tieni le gambe vive ma leggere
        this.tgt.idle = Math.max(this.tgt.idle, 0.15);
      }

      // opzionale: lerp di un canale "overlay" se lo usi per debug/metriche
      this.w.overlay = this._lerp(this.w.overlay ?? 0, 1, this.kOverlay * dt);
    } else {
      this.w.overlay = this._lerp(this.w.overlay ?? 0, 0, this.kOverlay * dt);
    }

    // 3) Interpolazione pesi BASE
    const k = (hasOverlay ? this.kOverlay : this.kLocom) * dt;
    this.w.idle = this._lerp(this.w.idle, this.tgt.idle, k);
    this.w.walk = this._lerp(this.w.walk, this.tgt.walk, k);
    this.w.run  = this._lerp(this.w.run,  this.tgt.run,  k);
    this.w.fly  = this._lerp(this.w.fly,  this.tgt.fly,  k);
    this.w.sit  = this._lerp(this.w.sit,  this.tgt.sit,  k);
    this.w.back = this._lerp(this.w.back, this.tgt.back, k);

    // 4) Floors anti T-pose
    const sumBase = this.w.idle + this.w.walk + this.w.run + this.w.fly + this.w.sit + this.w.back;
    const total   = sumBase + (this.w.overlay ?? 0);
    if (total < this.floorTotal) {
      this.w.idle = Math.max(this.w.idle, this.floorTotal);
    }

    // Se overlay full è quasi a 0, rialza subito idle per evitare frame vuoto (fine clip)
    if (hasOverlay && oc.mode === 'full') {
      const a = this.comp.get(oc.name);
      const ovW = a?.getEffectiveWeight?.();
      if (ovW !== undefined && ovW < 0.02) this._kickIdle(0.30);
    }

    // 5) Applica pesi alle azioni
    this._applyBaseWeights();
    this._applyOverlayWeight();
  }


  /** Avvia overlay (attack/jump/...) sopra la base */
  playOverlay(name, { loop = 'once', mode = 'full', fadeIn = this.fadeIn } = {}) {
    const clipName = this._resolve([name]) || name;
    const a = this.comp.get(clipName);
    if (!a) return false;

    // disattiva eventuale overlay corrente (crossfade out rapido)
    if (this.overlayCtx.name && this.overlayCtx.name !== clipName) {
      this.comp.get(this.overlayCtx.name)?.fadeOut?.(0.10);
    }

    // assicurati che i loop base siano vivi (anche se poi li azzeriamo)
    this._ensureBaseLoops();

    // setup overlay
    this.overlayCtx.name = clipName;
    this.overlayCtx.mode = mode;                 // 'full' | 'upper'
    this.overlayCtx.once = (loop === 'once');
    this.overlayCtx.dur  = this.comp.duration(clipName) || 0; // può essere 0 se non disponibile
    this.overlayCtx.t    = 0;

    a.enabled = true;
    a.reset();
    if (this.overlayCtx.once) { a.setLoop?.(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    else { a.setLoop?.(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; }
    a.setEffectiveWeight?.(1);
    a.fadeIn?.(fadeIn).play();
    a._clipName = clipName;

    return true;
  }


  /** Ferma l’overlay corrente (fade out + rientro in idle) */
  stopOverlay({ fadeOut = this.fadeOut } = {}) {
    if (!this.overlayCtx.name) return;
    this.comp.get(this.overlayCtx.name)?.fadeOut?.(fadeOut);
    this.overlayCtx.name = null;
    // kick di sicurezza per evitare buco al frame di rilascio
    this._kickIdle(0.35);
  }


  /** Ritorna durata clip */
  getClipDuration(name) { return this.comp.duration(name); }

  // ---------- PRIVATI ----------

  _ensureBaseLoops() {
    // idle deve sempre esistere (fallback già fatto in ctor)
    this.comp.ensureLoop(this.names.idle, 1);
    if (this.names.walk) this.comp.ensureLoop(this.names.walk, 0);
    if (this.names.run)  this.comp.ensureLoop(this.names.run, 0);
    if (this.names.fly)  this.comp.ensureLoop(this.names.fly, 0);
    if (this.names.sitIdle) this.comp.ensureLoop(this.names.sitIdle, 0);
    if (this.names.back) this.comp.ensureLoop(this.names.back, 0);
  }

  _applyBaseWeights() {
    if (this.names.idle)    this.comp.setWeight(this.names.idle,    this.w.idle);
    if (this.names.walk)    this.comp.setWeight(this.names.walk,    this.w.walk);
    if (this.names.run)     this.comp.setWeight(this.names.run,     this.w.run);
    if (this.names.fly)     this.comp.setWeight(this.names.fly,     this.w.fly);
    if (this.names.sitIdle) this.comp.setWeight(this.names.sitIdle, this.w.sit);
    if (this.names.back)    this.comp.setWeight(this.names.back,    this.w.back);
  }

  _applyOverlayWeight() {
    if (!this.overlayName) return;
    const a = this.comp.get(this.overlayName);
    if (!a) return;
    a.setEffectiveWeight?.(1); // overlay a pieno peso (la base ha già il floor)
  }

  _kickIdle(minW) {
    if (!this.names.idle) return;
    const idle = this.comp.ensureLoop(this.names.idle);
    if (!idle) return;
    // set immediato del peso azione + porta target coerente
    idle.setEffectiveWeight?.(Math.max(minW, idle.getEffectiveWeight?.() ?? 0));
    this.w.idle   = Math.max(this.w.idle,   minW);
    this.tgt.idle = Math.max(this.tgt.idle, minW);
  }

  _soloTarget(which) {
    this.tgt = { idle:0, walk:0, run:0, fly:0, sit:0, back:0, overlay:this.tgt.overlay };
    if (which === 'sit') this.tgt.sit = 1;
    else if (which === 'fly') this.tgt.fly = 1;
    else this.tgt.idle = 1; // default
  }

  _calcGroundTargets(v, sprint, backing) {
    // reset
    this.tgt.idle = this.tgt.walk = this.tgt.run = this.tgt.fly = this.tgt.sit = this.tgt.back = 0;

    if (backing && this.names.back) {
      // semplice: retro marcia → usa clip back
      const alpha = THREE.MathUtils.clamp(v / this.v_walk_on, 0, 1);
      this.tgt.back = Math.max(0.35, alpha); // spingila un po'
      this.tgt.idle = 1 - this.tgt.back;
      return;
    }

    if (v < this.v_walk_on) {
      this.tgt.idle = 1;
      return;
    }

    if (v < this.v_run_on) {
      // fascia walk
      const t = (v - this.v_walk_on) / Math.max(1e-6, (this.v_run_on - this.v_walk_on));
      this.tgt.walk = THREE.MathUtils.clamp(t, 0, 1);
      this.tgt.idle = 1 - this.tgt.walk;
      return;
    }

    // run
    let r = (v - this.v_run_on) / Math.max(1e-6, (this.v_run_full - this.v_run_on));
    r = THREE.MathUtils.clamp(r, 0, 1);
    this.tgt.run  = Math.max(r, sprint ? 1 : r);
    this.tgt.walk = 0;
    this.tgt.idle = 1 - this.tgt.run;
  }

  _resolve(candidates) {
    for (const n of candidates) if (this.comp.get(n)) return n;
    return null;
  }

  _findAnyLoopable() {
    // Prova a scegliere la prima action “non attacco” come idle di emergenza
    const keys = Object.keys(this.comp.actions || {});
    // Evita nomi tipici di overlay
    const bad = /attack|shoot|punch|slash|die|death|hit|impact|jump/i;
    const k = keys.find(k => !bad.test(k));
    return k || keys[0] || null;
  }

  _lerp(a,b,k){ return a + (b-a) * THREE.MathUtils.clamp(k,0,1); }
}
