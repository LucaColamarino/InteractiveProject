// Decide l'animazione in base alla "velocità" e allo stato (attacco, volo, seduto, ecc.)
export class AnimationSystem {
  constructor(animComp, stateRef) {
    this.anim = animComp;
    this.state = stateRef; // { speed, isFlying, isSitting, isAttacking, ... }
  }
  update() {
    if (!this.anim) return;
    if (this.state.isSitting) { this.anim.play('sitIdle'); return; }
    if (this.state.isAttacking) { /* l'attacco gestisce la propria anim */ return; }
    if (this.state.isFlying) { this.anim.play('fly'); return; }

    const v = this.state.speed ?? 0;
    if (v < 0.1) this.anim.play('idle');
    else if (!this.state.isSprinting) this.anim.play('walk');
    else this.anim.play('run');
  }
}
