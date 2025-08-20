// Incapsula mixer/azioni e lo "stato" animazione corrente
import * as THREE from 'three';

export class AnimationComponent {
  constructor(mixer, actions) {
    this.mixer = mixer;
    this.actions = actions;
    this.current = null;
  }
  play(name, opts = {}) {
    const next = this.actions?.[name];
    if (!next || next === this.current) return;

    this.current?.fadeOut?.(0.2);
    next.reset().fadeIn(0.2).play();

    const ts = (opts.timeScale ?? 1);
    next.timeScale = ts;
    if (opts.once) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    }
    this.current = next;
  }
  update(dt) { this.mixer?.update(Math.min(dt, 0.05)); }
}
