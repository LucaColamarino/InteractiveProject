import * as THREE from 'three';

export class Player {
  constructor(model, mixer, animations) {
    this.model = model;
    this.mixer = mixer;
    this.animations = animations;
    this.currentAction = null;
  }

playAnimation(name, options = {}) {
  const next = this.animations[name];
  if (!next || next === this.currentAction) return;

  if (this.currentAction) this.currentAction.fadeOut(0.2);

  next.reset().fadeIn(0.2).play();

  if (options.timeScale !== undefined) {
    next.timeScale = options.timeScale;
  } else {
    next.timeScale = 1; // reset di default
  }

  this.currentAction = next;
}


  update(delta) {
    if (this.mixer) this.mixer.update(Math.min(delta, 0.05));
  }
}