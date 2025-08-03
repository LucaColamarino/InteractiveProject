import * as THREE from 'three';

export class Player {
  constructor(model, mixer, animations) {
    this.model = model;
    this.mixer = mixer;
    this.animations = animations;
    this.currentAction = null;
  }

  playAnimation(name) {
    const next = this.animations[name];
    if (!next || next === this.currentAction) return;
    if (this.currentAction) this.currentAction.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    this.currentAction = next;
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }
}