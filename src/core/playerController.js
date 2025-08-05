import * as THREE from 'three';
import { camera } from '../scene.js';
import { getTerrainHeightAt } from '../map.js';

let inputState = {
  moveVec: new THREE.Vector3(),
  isShiftPressed: false,
  isJumpPressed: false,
};

export function setInputState(state) {
  inputState = state;
}

export class PlayerController {
  constructor(player, abilities) {
    this.player = player;
    this.abilities = abilities;

    this.velocityY = 0;
    this.isFlying = false;
    this.isOnGround = false;
    this.flyTimer = 0;

    this.smoothedDirection = new THREE.Vector3();
    this.currentVelocity = new THREE.Vector3();
    this.acceleration = 30;
    this.deceleration = 20;
  }

  update(delta) {
    const { moveVec, isShiftPressed, isJumpPressed } = inputState;

    if (this.isFlying) {
      this.handleFlight(delta, moveVec, isShiftPressed, isJumpPressed);
    } else {
      this.handleGroundMovement(delta, moveVec, isShiftPressed);
    }

    this.handleVerticalMovement(delta, isJumpPressed, isShiftPressed);

    const pos = this.player.model.position;
    const terrainY = getTerrainHeightAt(pos.x, pos.z);
    if (pos.y < terrainY) {
      pos.y = terrainY;
      this.velocityY = 0;
      this.isOnGround = true;

      if (this.isFlying) {
        this.isFlying = false;
        const euler = new THREE.Euler().setFromQuaternion(this.player.model.quaternion);
        euler.x = 0;
        euler.z = 0;
        this.player.model.quaternion.setFromEuler(euler);
      }
    }
  }

  handleGroundMovement(delta, inputVec, isShiftPressed) {
    const targetSpeed = isShiftPressed ? this.abilities.speed * 1.5 : this.abilities.speed;
    const desiredVelocity = inputVec.clone().normalize().multiplyScalar(targetSpeed);
    const accel = inputVec.lengthSq() > 0 ? this.acceleration : this.deceleration;
    this.currentVelocity.lerp(desiredVelocity, accel * delta);

    const moveStep = this.currentVelocity.clone().multiplyScalar(delta);
    this.player.model.position.add(moveStep);

    if (this.currentVelocity.lengthSq() > 0.001) {
      const yaw = Math.atan2(this.currentVelocity.x, this.currentVelocity.z);
      const currentYaw = this.player.model.rotation.y;
      let deltaYaw = yaw - currentYaw;
      if (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
      if (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
      this.player.model.rotation.y += deltaYaw * 0.15;
    }

    const speed = this.currentVelocity.length();
    if (speed < 0.1) {
      this.player.playAnimation('idle');
    } else if (speed < targetSpeed * 0.6) {
      this.player.playAnimation('walk');
    } else {
      this.player.playAnimation('run');
    }
  }

  handleFlight(delta, inputVec, isShiftPressed, isJumpPressed) {
    const speed = this.abilities.flyspeed || 10;

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir).normalize();

    const moveDir = camDir.clone().multiplyScalar(speed * delta);
    this.player.model.position.add(moveDir);

    const target = this.player.model.position.clone().add(camDir);
    const dummy = new THREE.Object3D();
    dummy.position.copy(this.player.model.position);
    dummy.lookAt(target);
    this.player.model.quaternion.slerp(dummy.quaternion, 0.1);

    this.player.playAnimation('fly');
  }

  handleVerticalMovement(delta, isJumpPressed, isShiftPressed) {
    if (this.abilities.canFly && this.isFlying) {
      if (isJumpPressed) this.velocityY += 30 * delta;
      if (isShiftPressed) this.velocityY -= 30 * delta;
      this.velocityY += this.abilities.gravity * 0.2 * delta;
    } else {
      this.velocityY += this.abilities.gravity * delta;
    }

    this.player.model.position.y += this.velocityY * delta;
  }

  jump() {
    if (this.isOnGround && !this.abilities.canFly) {
      this.velocityY = this.abilities.jumpForce;
      this.isOnGround = false;
      this.player.playAnimation('jump');
    }
  }

  fly() {
    const minHeight = 0.01;
    const terrainY = getTerrainHeightAt(this.player.model.position.x, this.player.model.position.z);
    const isOnGroundNow = this.player.model.position.y <= terrainY + minHeight;
    if (this.abilities.canFly && isOnGroundNow) {
      this.isFlying = true;
      this.velocityY = 10;
      this.flyTimer = this.abilities.maxFlyTime || 999;
      this.player.playAnimation('fly');
    }
  }
}
