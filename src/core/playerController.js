import * as THREE from 'three';
import { camera } from '../scene.js';
import { getTerrainHeightAt } from '../map.js';


export class PlayerController {
  constructor(player, abilities) {
    this.player = player;
    this.abilities = abilities;

    this.velocityY = 0;
    this.isFlying = false;
    this.isOnGround = false;
    this.flyTimer = 0;
  }

  update(delta, inputVec, isShiftPressed, isJumpPressed) {
    if (this.isFlying) {
      this.handleFlight(delta, inputVec, isShiftPressed, isJumpPressed);
    } else {
      this.handleGroundMovement(delta, inputVec, isShiftPressed);
    }

    this.handleVerticalMovement(delta, isJumpPressed, isShiftPressed);

    const pos = this.player.model.position;
    console.log(`Player position: ${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`);
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

  handleFlight(delta) {
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

  handleGroundMovement(delta, inputVec, isShiftPressed) {
    if (inputVec.lengthSq() === 0) {
      this.player.playAnimation('idle');
      return;
    }

    const speed = isShiftPressed ? this.abilities.speed * 1.5 : this.abilities.speed;
    const moveDir = inputVec.clone().normalize().multiplyScalar(speed * delta);
    this.player.model.position.add(moveDir);

    const yaw = Math.atan2(inputVec.x, inputVec.z);
    const targetRot = new THREE.Euler(0, yaw, 0);
    const currentRot = this.player.model.rotation;
    currentRot.y = THREE.MathUtils.lerp(currentRot.y, targetRot.y, 0.15);

    this.player.playAnimation(isShiftPressed ? 'run' : 'walk');
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

  applyRotation(moveDir) {
    if (moveDir.lengthSq() === 0) return;

    const yaw = Math.atan2(moveDir.x, moveDir.z);
    const pitch = Math.atan2(-moveDir.y, Math.sqrt(moveDir.x ** 2 + moveDir.z ** 2));
    const roll = 0;

    const targetRot = new THREE.Euler(pitch, yaw, roll);
    this.player.model.rotation.x = THREE.MathUtils.lerp(this.player.model.rotation.x, targetRot.x, 0.1);
    this.player.model.rotation.y = THREE.MathUtils.lerp(this.player.model.rotation.y, targetRot.y, 0.1);
    this.player.model.rotation.z = THREE.MathUtils.lerp(this.player.model.rotation.z, targetRot.z, 0.1);
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
