// PickableManager.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { WorldPickup } from '../objects/worldPickup.js';

export class PickableManager {
  constructor({
    scene,
    inventory = null,       // se passato, aggiunge automaticamente al pickup
    onPickup = null,        // callback(payload, item)
    usePointLight = true,
    interactKey = 'KeyE',
  } = {}) {
    this.scene = scene;
    this.inventory = inventory;
    this.onPickup = onPickup;
    this.usePointLight = usePointLight;
    this.interactKey = interactKey;

    this.loader = new FBXLoader();
    this.itemsInWorld = [];    // WorldPickup[]

    this._keys = new Set();
    window.addEventListener('keydown', e => this._keys.add(e.code));
    window.addEventListener('keyup',   e => this._keys.delete(e.code));
  }

  get interactPressed() {
    return this._keys.has(this.interactKey);
  }

  async _loadModel(path) {
    const model = await this.loader.loadAsync(path);
    // materiali base “safe”
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (!o.material.emissive) {
          // alcuni FBX possono non avere emissive definita
          // Three la crea comunque come Color, ma mettiamo un fallback
          o.material.emissive = new THREE.Color(0x000000);
        }
      }
    });


    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);

    const targetHeight = 0.9;                  // ~90 cm per un pickup “grande”
    const h = Math.max(size.y, 1e-3);
    const s = targetHeight / h;
    model.scale.setScalar(s);

    // ricomputa bbox dopo lo scaling e appoggia a y=0
    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;

    return model;
  }

  /**
   * Spawna un GameItem nel mondo come pickup con effetti
   * @param {GameItem} item
   * @param {THREE.Vector3} position
   * @param {Object} opts { autoPickup, pickupRadius }
   */
  async spawnItem(item, position, opts = {}) {
    const {
      autoPickup = true,
      pickupRadius = 1.5,
    } = opts;

    const model = await this._loadModel(item.modelPath);
    const pickup = new WorldPickup({
      scene: this.scene,
      item,
      model,
      position,
      autoPickup,
      pickupRadius,
      usePointLight: this.usePointLight,
      onPicked: (payload, gameItem) => {
        // 1) inventario (se presente)
        if (this.inventory) {
          this.inventory.addItem(payload);
        }
        // 2) callback utente (UI, suoni, log, ecc.)
        if (typeof this.onPickup === 'function') this.onPickup(payload, gameItem);
      }
    });

    this.itemsInWorld.push(pickup);
    return pickup;
  }

  /** Update da chiamare nel tuo game loop */
  update(dt, playerPosition) {
    const pressed = this.interactPressed;
    this.itemsInWorld = this.itemsInWorld.filter(p => !p._dead);
    for (const p of this.itemsInWorld) p.update(dt, playerPosition, pressed);
  }

  /** Utility per spawnare molti oggetti */
  async spawnMany(items, positions, perItemOptions = {}) {
    const res = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const pos = positions[i];
      const opt = perItemOptions[item.id] || {};
      res.push(await this.spawnItem(item, pos, opt));
    }
    return res;
  }
}
