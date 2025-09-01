// AnimationComponent.js
import * as THREE from 'three';
export class AnimationComponent {
  constructor(mixer, actions = {}) {
    this.mixer = mixer || null;
    this.actions = actions || {};
  }
  get(name) {
    return this.actions?.[name] || null;
  }
  ensureLoop(name, initialWeight = undefined) {
    const a = this.get(name);
    if (!a) return null;
    a.enabled = true;
    a.setLoop?.(THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = false;
    a.setEffectiveTimeScale?.(1);
    if (!a.isRunning?.()) a.play();
    if (initialWeight !== undefined) a.setEffectiveWeight?.(initialWeight);
    return a;
  }
  xfade(fromName, toName, t = 0.2) {
    const from = this.get(fromName);
    const to   = this.get(toName);
    if (!to) return false;
    to.reset().fadeIn(t).play();
    if (from) from.fadeOut?.(t);
    return true;
  }
  setWeight(name, w) {
    const a = this.get(name);
    if (!a) return;
    a.enabled = true;
    a.setEffectiveWeight?.(w);
  }
  duration(name) {
    const a = this.get(name);
    return (a?.getClip?.()?.duration) || 0;
  }
  update(dt) {
    if (!this.mixer) return;
    this.mixer.update(Math.min(dt, 1/20));
  }
}
