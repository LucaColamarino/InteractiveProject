// BaseEnemy.js
import * as THREE from 'three';
import { getTerrainHeightAt } from '../../map/map.js';
import { gameManager } from '../../managers/gameManager.js';

export class BaseEnemy {
  /**
   * @param {{
   *  type: 'archer'|'werewolf'|'wyvern'|string,
   *  model: THREE.Object3D,
   *  mixer?: THREE.AnimationMixer,
   *  actions?: Record<string, THREE.AnimationAction|any>,
   *  animator?: any,                  // il tuo Animator custom
   *  yOffset?: number,
   *  speed?: number,
   *  maxUpdateDistance?: number,
   * }} opt
   */
  constructor(opt = {}) {
    this.type = opt.type ?? 'enemy';
    this.model = opt.model;
    this.mixer = opt.mixer || null;
    this.actions = opt.actions || {};
    this.animator = opt.animator || null;
    this.forwardYawOffsetDeg = opt.forwardYawOffsetDeg ?? 0; // NEW
    this.alive = true;
    this.state = {
      speed: 0,
      isFlying: false,
      isSitting: false,
      isAttacking: false,
      isSprinting: false,
    };

    this._tmpV = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3(1, 0, 0);

    this.yOffset = opt.yOffset ?? 0;
    this.speed = opt.speed ?? 1.0;
    this.maxUpdateDistance = opt.maxUpdateDistance ?? 250;

    this.target = null; // di default: player, se disponibile
  }

  get player() {
    return gameManager.controller?.player || null;
  }

  setTarget(obj3D) {
    this.target = obj3D;
  }

  /** Facoltativo: chiamato dal manager prima della logica */
  preUpdate(_dt) {}

  /** Punto di estensione principale: AI + locomozione */
  update(dt) {
    // default: gira a vuoto sul terreno
    this.wanderOnGround(dt);
    this.applyGroundHeightSnap(dt);
    this.applyLookForward();
    this.updateAnimFromMove();
  }

  /** Facoltativo: chiamato dal manager dopo la logica */
  postUpdate(_dt) {}

  // ---------- Utility comuni ----------

// In BaseEnemy.js

faceDirection(dir, turnSpeed = 6.0) {
  if (!this.model) return;

  // calcola il punto "davanti" nella direzione voluta
  this._tmpV.copy(this.model.position).add(dir);

  // orientamento corrente
  const curQuat = this.model.quaternion.clone();

  // lookAt produce l’orientamento standard: -Z è forward
  this.model.lookAt(this._tmpV);
  const targetQuat = this.model.quaternion.clone();

  // ---- FIX: offset di yaw per combaciare il forward del modello ----
  // usa this.forwardYawOffsetDeg (default 0) per ruotare il target
  const yawRad = (this.forwardYawOffsetDeg ?? 0) * Math.PI / 180;
  if (yawRad !== 0) {
    const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), yawRad);
    targetQuat.multiply(fix);
  }

  // slerp morbido verso il target
  this.model.quaternion.copy(curQuat).slerp(
    targetQuat,
    Math.min(1, turnSpeed * (1 / 60)) // dt-independent
  );
}



  moveForward(speed, dt) {
    if (!this.model) return;
    // forward nel piano XZ
    this.model.getWorldDirection(this._tmpDir);
    this._tmpDir.y = 0; this._tmpDir.normalize();
    this.model.position.addScaledVector(this._tmpDir, speed * dt);
  }

  applyGroundHeightSnap(dt, lerpSpeed = 10) {
    if (!this.model) return;
    const x = this.model.position.x, z = this.model.position.z;
    const targetY = getTerrainHeightAt(x, z) + this.yOffset;
    this.model.position.y = THREE.MathUtils.lerp(this.model.position.y, targetY, Math.min(1, dt * lerpSpeed));
    this.state.isFlying = false;
  }

  applyLookForward() {
    if (!this.model) return;
    // guarda un punto "avanti" nella direzione corrente del modello
    this.model.getWorldDirection(this._tmpDir);
    const target = this._tmpV.copy(this.model.position).add(this._tmpDir);
    this.model.lookAt(target);
  }

  updateAnimFromMove() {
    // Mappa minima per il tuo Animator (adatta ai nomi clip che usi)
    if (!this.animator) return;
    // Imposta parametri locomozione: speed / isFlying ecc.
    this.animator.setLocomotion?.({
      speed: this.state.speed || 0,
      isFlying: !!this.state.isFlying,
      isSprinting: !!this.state.isSprinting,
    });
  }

  wanderOnGround(dt, angularSpeed = 0.8) {
    // piccolo wander procedural
    this._wanderAngle = (this._wanderAngle ?? Math.random() * Math.PI * 2) + dt * angularSpeed;
    const dir = this._tmpDir.set(Math.cos(this._wanderAngle), 0, Math.sin(this._wanderAngle)).normalize();

    // ruota dolcemente verso dir e avanza
    this.faceDirection(dir);
    const v = this.speed;
    this.moveForward(v, dt);

    this.state.speed = v;
  }

  // Hook di morte: chiamato da EnemyManager.killEnemy
  onKilled() {
    // opzionale: effetti, suoni, drop, ecc.
  }
}
