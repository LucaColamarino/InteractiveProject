// Animator.js
import * as THREE from 'three';
import { AnimationComponent } from './AnimationComponent.js';

export class Animator {
  constructor(animCompRaw, stateRefFn = () => ({})) {
    this.comp = (animCompRaw instanceof AnimationComponent)
      ? animCompRaw
      : new AnimationComponent(animCompRaw?.mixer, animCompRaw?.actions);
    this._getState = stateRefFn; //{ speed, isFlying, isSitting, isBacking, isSprinting }
    this.names = {
      idle:    this._resolve(['idle','Idle','Idle_A','Idle_01','Breathing','DefaultIdle']),
      walk:    this._resolve(['walk','Walk','Walking','Walk_A']),
      run:     this._resolve(['run','Run','Jog','Jogging']),
      fly:     this._resolve(['flying','flaping','fly','Fly','Glide']),
      takeoff: this._resolve(['takeoff','Jump','jump','Leap']),
      attack:  this._resolve(['fire','Fire','Attack','Bite','Punch','SwordAttack']),
      sitIdle: this._resolve(['sitIdle','Sit','Sitting','Sit_Idle']),
      back:    this._resolve(['back','Back','WalkBack','Walk_Back']),
      die:     this._resolve(['die','Death','Die']),
    };

    if (!this.names.idle) this.names.idle = this._findAnyLoopable();
    this.kLocom  = 8.0;
    this.kOverlay = 10.0;
    this.fadeIn  = 0.14;
    this.fadeOut = 0.16;
    this.backWindow = 0.20;
    this.overlayCtx = { name: null, mode: 'full', once: true, dur: 0, t: 0 };

    this.floorTotal = 0.05;
    this.floorIdle  = 0.20;
    this.keepBaseDuringOverlay = 0.20;

    this.w   = { idle:1, walk:0, run:0, fly:0, sit:0, back:0, overlay:0 };
    this.tgt = { ...this.w };

    this.overlayName = null;

    this.v_walk_on   = 0.25;
    this.v_run_on    = 5.0;
    this.v_run_full  = 6.5;

    this._ensureBaseLoops();

    this.comp?.mixer?.addEventListener?.('finished', (e) => {
      const ended = e?.action?._clipName || null;
      if (!ended) return;
      const isDeath = ended === (this.names?.die || 'die');
      if (ended === this.overlayName && !isDeath) {
        this.stopOverlay();
        this._kickIdle(this.floorIdle);
      }
    });
  }

  update(dt) {
    this.comp.update(dt);

    const oc = this.overlayCtx || (this.overlayCtx = { name: null, mode: 'full', once: true, dur: 0, t: 0 });
    if (oc.name) oc.t += dt; else oc.t = 0;
    this.overlayName = oc.name;

    const s = this._getState() || {};
    const speed       = +s.speed || 0;
    const isFlying    = !!s.isFlying;
    const isSitting   = !!s.isSitting;
    const isBacking   = !!s.isBacking;
    const isSprinting = !!s.isSprinting;

    if (isSitting && this.names.sitIdle) {
      this._soloTarget('sit');
    } else if (isFlying && this.names.fly) {
      this._soloTarget('fly');
    } else {
      this._calcGroundTargets(speed, isSprinting, isBacking);
    }

    const hasOverlay = !!oc.name;
    const dieName = this.names?.die || 'die';
    const isDeath  = hasOverlay && oc.name === dieName;

    if (hasOverlay) {
      const remaining = Math.max(0, (oc.dur || Infinity) - oc.t);
      if (oc.mode === 'full') {
        if (isDeath) {
          this.tgt.idle = 0; this.tgt.walk = 0; this.tgt.run = 0;
          this.tgt.fly  = 0; this.tgt.sit  = 0; this.tgt.back = 0;
        } else if (remaining > this.backWindow) {
          this.tgt.idle = 0; this.tgt.walk = 0; this.tgt.run = 0;
          this.tgt.fly  = 0; this.tgt.sit  = 0; this.tgt.back = 0;
        } else {
          this.tgt.idle = Math.max(this.tgt.idle, 0.35);
        }
      } else if (oc.mode === 'upper') {
        this.tgt.idle = Math.max(this.tgt.idle, 0.15);
      }
      this.w.overlay = this._lerp(this.w.overlay ?? 0, 1, this.kOverlay * dt);
    } else {
      this.w.overlay = this._lerp(this.w.overlay ?? 0, 0, this.kOverlay * dt);
    }

    const k = (hasOverlay ? this.kOverlay : this.kLocom) * dt;
    this.w.idle = this._lerp(this.w.idle, this.tgt.idle, k);
    this.w.walk = this._lerp(this.w.walk, this.tgt.walk, k);
    this.w.run  = this._lerp(this.w.run,  this.tgt.run,  k);
    this.w.fly  = this._lerp(this.w.fly,  this.tgt.fly,  k);
    this.w.sit  = this._lerp(this.w.sit,  this.tgt.sit,  k);
    this.w.back = this._lerp(this.w.back, this.tgt.back, k);

    if (!isDeath) {
      const sumBase = this.w.idle + this.w.walk + this.w.run + this.w.fly + this.w.sit + this.w.back;
      const total   = sumBase + (this.w.overlay ?? 0);
      if (total < this.floorTotal) this.w.idle = Math.max(this.w.idle, this.floorTotal);
    }

    if (hasOverlay && oc.mode === 'full' && !isDeath) {
      const a = this.comp.get(oc.name);
      const ovW = a?.getEffectiveWeight?.();
      if (ovW !== undefined && ovW < 0.02) this._kickIdle(0.30);
    }

    this._applyBaseWeights();
    this._applyOverlayWeight();
  }

  playOverlay(name, { loop = 'once', mode = 'full', fadeIn = this.fadeIn } = {}) {
    const clipName = this._resolve([name]) || name;
    const a = this.comp.get(clipName);
    if (!a) return false;

    if (this.overlayCtx.name && this.overlayCtx.name !== clipName) {
      this.comp.get(this.overlayCtx.name)?.fadeOut?.(0.10);
    }

    this._ensureBaseLoops();

    this.overlayCtx.name = clipName;
    this.overlayCtx.mode = mode;
    this.overlayCtx.once = (loop === 'once');
    this.overlayCtx.dur  = this.comp.duration(clipName) || 0;
    this.overlayCtx.t    = 0;

    a.enabled = true;
    a.reset();
    if (this.overlayCtx.once) { a.setLoop?.(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    else                      { a.setLoop?.(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; }
    a.setEffectiveWeight?.(1);
    a.fadeIn?.(fadeIn).play();
    a._clipName = clipName;
    return true;
  }

  stopOverlay({ fadeOut = this.fadeOut } = {}) {
    if (!this.overlayCtx.name) return;
    const isDeath = this.overlayCtx.name === (this.names?.die || 'die');
    if (isDeath) return;
    this.comp.get(this.overlayCtx.name)?.fadeOut?.(fadeOut);
    this.overlayCtx.name = null;
    this._kickIdle(0.35);
  }

  getClipDuration(name) { return this.comp.duration(this._resolve([name]) || name); }

  _ensureBaseLoops() {
    this.comp.ensureLoop(this.names.idle, 1);
    if (this.names.walk)    this.comp.ensureLoop(this.names.walk, 0);
    if (this.names.run)     this.comp.ensureLoop(this.names.run, 0);
    if (this.names.fly)     this.comp.ensureLoop(this.names.fly, 0);
    if (this.names.sitIdle) this.comp.ensureLoop(this.names.sitIdle, 0);
    if (this.names.back)    this.comp.ensureLoop(this.names.back, 0);
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
    a.setEffectiveWeight?.(1);
  }
  _kickIdle(minW) {
    if (!this.names.idle) return;
    const idle = this.comp.ensureLoop(this.names.idle);
    if (!idle) return;
    idle.setEffectiveWeight?.(Math.max(minW, idle.getEffectiveWeight?.() ?? 0));
    this.w.idle   = Math.max(this.w.idle,   minW);
    this.tgt.idle = Math.max(this.tgt.idle, minW);
  }
  _soloTarget(which) {
    this.tgt = { idle:0, walk:0, run:0, fly:0, sit:0, back:0, overlay:this.tgt.overlay };
    if (which === 'sit') this.tgt.sit = 1;
    else if (which === 'fly') this.tgt.fly = 1;
    else this.tgt.idle = 1;
  }
  _calcGroundTargets(v, sprint, backing) {
    this.tgt.idle = this.tgt.walk = this.tgt.run = this.tgt.fly = this.tgt.sit = this.tgt.back = 0;
    if (backing && this.names.back) {
      const alpha = THREE.MathUtils.clamp(v / this.v_walk_on, 0, 1);
      this.tgt.back = Math.max(0.35, alpha);
      this.tgt.idle = 1 - this.tgt.back;
      return;
    }
    if (v < this.v_walk_on) { this.tgt.idle = 1; return; }
    if (v < this.v_run_on) {
      const t = (v - this.v_walk_on) / Math.max(1e-6, (this.v_run_on - this.v_walk_on));
      this.tgt.walk = THREE.MathUtils.clamp(t, 0, 1);
      this.tgt.idle = 1 - this.tgt.walk;
      return;
    }
    let r = (v - this.v_run_on) / Math.max(1e-6, (this.v_run_full - this.v_run_on));
    r = THREE.MathUtils.clamp(r, 0, 1);
    this.tgt.run  = Math.max(r, sprint ? 1 : r);
    this.tgt.walk = 0;
    this.tgt.idle = 1 - this.tgt.run;
  }
  _resolve(candidates) { for (const n of candidates) if (this.comp.get(n)) return n; return null; }
  _findAnyLoopable() {
    const keys = Object.keys(this.comp.actions || {});
    const bad = /attack|shoot|punch|slash|die|death|hit|impact|jump|takeoff|fire/i;
    const k = keys.find(k => !bad.test(k));
    return k || keys[0] || null;
  }
  _lerp(a,b,k){ return a + (b-a) * THREE.MathUtils.clamp(k,0,1); }
}
