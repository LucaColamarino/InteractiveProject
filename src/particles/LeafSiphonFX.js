// src/particles/LeafSiphonFX.js
import * as THREE from 'three';

export class LeafSiphonFX {
  constructor(scene) {
    this.scene = scene;
    this.active = false;

    // Beam: un semplice Cylinder “schiacciato”
    const g = new THREE.CylinderGeometry(0.05, 0.05, 1, 12, 1, true);
    const m = new THREE.MeshBasicMaterial({ color: 0x27e8a7, transparent: true, opacity: 0.8 });
    this.beam = new THREE.Mesh(g, m);
    this.beam.visible = false;
    this.scene.add(this.beam);

    // Particelle foglie: punti che volano verso il player
    const MAX = 180;
    const geo = new THREE.BufferGeometry();
    this._pos = new Float32Array(MAX * 3);
    this._vel = new Float32Array(MAX * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.08, color: 0x7ee6c9, transparent: true, opacity: 0.9 });
    this.points = new THREE.Points(geo, mat);
    this.points.visible = false;
    this.scene.add(this.points);

    this._playerRef = null;
    this._treeRef = null;
    this._timer = 0;
  }

  start(playerObj, treeObj) {
    this._playerRef = playerObj;
    this._treeRef = treeObj;
    this.active = true;
    this._timer = 0;
    this.beam.visible = true;
    this.points.visible = true;
    this._scatterAroundTree();
  }

  stop() {
    this.active = false;
    this.beam.visible = false;
    this.points.visible = false;
    this._playerRef = null;
    this._treeRef = null;
  }

  update(dt) {
    if (!this.active || !this._playerRef || !this._treeRef) return;

    // aggiorna “beam”: posiziona e scala tra player e albero
    const A = new THREE.Vector3().setFromMatrixPosition(this._playerRef.matrixWorld);
    const B = this._treeRef.position.clone().add(new THREE.Vector3(0, 2.0, 0)); // mira alla chioma
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const len = A.distanceTo(B);

    this.beam.position.copy(mid);
    // orienta: Cylinder lungo Y, allinea all’asse AB
    this.beam.scale.set(1, len / 2, 1); // half-height = len/2
    this.beam.lookAt(B);
    this.beam.rotateX(Math.PI / 2); // porta asse Y lungo Z, poi lookAt allinea bene
    this.beam.material.opacity = 0.6 + 0.3 * Math.sin(performance.now() * 0.01);

    // foglioline: volano verso A
    const pos = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this._vel.length; i += 3) {
      // velocità già puntata verso A
      pos[i]     += this._vel[i] * dt;
      pos[i + 1] += this._vel[i + 1] * dt;
      pos[i + 2] += this._vel[i + 2] * dt;

      // lieve attrazione extra verso A
      const px = pos[i], py = pos[i + 1], pz = pos[i + 2];
      const dx = (A.x - px), dy = (A.y - py), dz = (A.z - pz);
      const inv = 0.8 * dt;
      this._vel[i]     += dx * inv * 0.3;
      this._vel[i + 1] += dy * inv * 0.3;
      this._vel[i + 2] += dz * inv * 0.3;

      // se vicinissime al player, respawn attorno all’albero
      if ((dx*dx + dy*dy + dz*dz) < 0.05) {
        this._respawnParticle(i/3);
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  _scatterAroundTree() {
    const T = this._treeRef.position;
    for (let idx = 0; idx < this._vel.length/3; idx++) this._respawnParticle(idx, T);
  }

  _respawnParticle(idx, T = this._treeRef.position) {
    const i3 = idx * 3;
    // spawn random attorno alla chioma
    const r = 1.5 + Math.random() * 1.2;
    const ang = Math.random() * Math.PI * 2;
    const h = 1.2 + Math.random() * 2.0;
    this._pos[i3]     = T.x + Math.cos(ang) * r;
    this._pos[i3 + 1] = T.y + h;
    this._pos[i3 + 2] = T.z + Math.sin(ang) * r;

    // direzione iniziale verso player (debole, poi l’update la corregge)
    const A = new THREE.Vector3().setFromMatrixPosition(this._playerRef.matrixWorld);
    const dir = new THREE.Vector3(A.x - this._pos[i3], A.y - this._pos[i3 + 1], A.z - this._pos[i3 + 2]).normalize();
    const spd = 0.8 + Math.random() * 0.6;
    this._vel[i3]     = dir.x * spd;
    this._vel[i3 + 1] = dir.y * spd;
    this._vel[i3 + 2] = dir.z * spd;

    this.points.geometry.attributes.position.array[i3]     = this._pos[i3];
    this.points.geometry.attributes.position.array[i3 + 1] = this._pos[i3 + 1];
    this.points.geometry.attributes.position.array[i3 + 2] = this._pos[i3 + 2];
  }
}
