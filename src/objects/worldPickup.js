// WorldPickup.js
import * as THREE from 'three';

/**
 * Un'istanza nel mondo di un GameItem, con:
 * - effetto hover/rotazione
 * - ring pulsante + point light opzionale
 * - logica di pickup (auto o a tasto)
 */
export class WorldPickup {
  constructor({
    scene,
    item,                  // GameItem
    model,                 // THREE.Object3D (già caricato)
    position = new THREE.Vector3(),
    autoPickup = true,
    pickupRadius = 1.5,
    usePointLight = true,
    onPicked = null,       // callback(payload, item)
  }) {
    this.scene = scene;
    this.item = item;
    this.root = new THREE.Group();
    this.root.name = `pickup_${item.id}`;
    this.root.position.copy(position);

    // contenitore del modello (così possiamo aggiungere ring/luce senza sporcare il model)
    this.modelGroup = new THREE.Group();
    this.modelGroup.add(model);

    // ring magico
    const ringGeo = new THREE.RingGeometry(0.35, 0.6, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x66ccff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    this.ring = ring;

    // point light dolce
    if (usePointLight) {
      const light = new THREE.PointLight(0x66ccff, 0.9, 6, 1.5);
      light.position.set(0, 0.8, 0);
      this.light = light;
      this.root.add(light);
    }

    // alza il modello da terra
    this.baseY = 0.6;                 // offset locale
    this.modelGroup.position.y = this.baseY;

    this.root.add(this.modelGroup);
    this.root.add(ring);
    scene.add(this.root);

    this.autoPickup = autoPickup;
    this.pickupRadius = pickupRadius;
    this.onPicked = onPicked;

    this._t = Math.random() * Math.PI * 2;
    this._dead = false;
    this._pulse = Math.random() * Math.PI * 2;
  }

  update(dt, playerPosition, interactPressed = false) {
    if (this._dead) return;

    // animazioni: hover, rotazione, pulsazione ring/emissive
    this._t += dt;
    this._pulse += dt * 3.0;

    const amp = 0.18;
    const speed = 2.0;
    const rotSpeed = 0.6;

    this.modelGroup.position.y = this.baseY + Math.sin(this._t * speed) * amp;
    this.modelGroup.rotation.y += rotSpeed * dt;

    if (this.ring) {
      const s = 0.95 + 0.1 * (0.5 + 0.5 * Math.sin(this._t * 2.2));
      this.ring.scale.set(s, s, s);
      this.ring.material.opacity = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(this._t * 2.2));
    }

    this.modelGroup.traverse(o => {
      if (o.isMesh && o.material && 'emissiveIntensity' in o.material) {
        o.material.emissiveIntensity = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(this._pulse));
      }
    });

    if (!playerPosition) return;

    // check distanza
    const d = this.root.position.distanceTo(playerPosition);
    const inRange = d <= this.pickupRadius;

    // feedback visivo in-range
    if (this.ring) this.ring.material.color.set(inRange ? 0x77ffcc : 0x66ccff);
    if (this.light) this.light.intensity = inRange ? 1.1 : 0.8;

    // pickup
    if ((this.autoPickup && inRange) || (!this.autoPickup && inRange && interactPressed)) {
      this._dead = true;
      const payload = this.item.getPickupPayload();
      if (typeof this.onPicked === 'function') this.onPicked(payload, this.item);
      if (this.root.parent) this.root.parent.remove(this.root);
    }
  }

  dispose() {
    if (this.root && this.root.parent) this.root.parent.remove(this.root);
    this._dead = true;
  }
}
