import * as THREE from 'three';
import { AnimationComponent } from '../components/AnimationComponent.js'; // o 

export class Player {
  constructor(model, mixer, actions) {
    this.model = model;
    this.anim = new AnimationComponent(mixer, actions);
    this.state = { speed:0, isFlying:false, isSitting:false, isAttacking:false, isSprinting:false };
    // dentro Player constructor
    this.swordHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1, 1.5), // un box davanti al player
      new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false }) // visibile per debug
    );
    this.model.add(this.swordHitbox);
    this.swordHitbox.position.set(0, 1, 1); // posizionala davanti alla mano

  }
  update(dt) { this.anim.update(dt); }
}