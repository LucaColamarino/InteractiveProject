// src/managers/PickableManager.js
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { WorldPickup } from '../objects/worldPickup.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js';

export class PickableManager {
  constructor({
    scene,
    inventory = null,     // se passato, aggiunge automaticamente all'inventario
    onPickup = null,      // callback(payload, item)
    enableLight = true,   // ⬅️ allineato a WorldPickup
  } = {}) {
    this.scene = scene;
    this.inventory = inventory;
    this.onPickup = onPickup;
    this.enableLight = enableLight;

    this.loader = new FBXLoader();
    this.itemsInWorld = []; // WorldPickup[]
  }

  async _loadModel(path) {
    const model = await this.loader.loadAsync(path);
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (!o.material.emissive) o.material.emissive = new THREE.Color(0x000000);
      }
    });

    // scala "comoda" e appoggia a y=0
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetHeight = 0.9;
    const h = Math.max(size.y, 1e-3);
    const s = targetHeight / h;
    model.scale.setScalar(s);

    const box2 = new THREE.Box3().setFromObject(model);
    model.position.y -= box2.min.y;

    return model;
  }

  /**
   * Spawna un GameItem nel mondo come pickup e lo registra all'interactionManager.
   * @param {GameItem} item
   * @param {THREE.Vector3} position
   * @param {Object} opts { autoPickup, pickupRadius, enableLight, hover, rotate, ... }
   */
  async spawnItem(item, position, opts = {}) {
    const {
      autoPickup = false,         // default: manuale con "E"
      pickupRadius = 1.5,
      enableLight = this.enableLight,
      hover = true,
      rotate = true,
    } = opts;
    position.y+=0.6;
    const model = await this._loadModel(item.modelPath);
    const pickup = new WorldPickup({
      scene: this.scene,
      item,
      model,
      position,
      autoPickup,
      pickupRadius,
      enableLight,
      hover,
      rotate,
      onPicked: (payload, gameItem) => {
        if (this.inventory?.addItem) this.inventory.addItem(payload);
        if (typeof this.onPickup === 'function') this.onPickup(payload, gameItem);
        hudManager.showNotification?.(`+ ${gameItem?.label ?? gameItem?.id ?? 'Item'}`);
      }
    });

    // --- registra l'interactable per il tasto E ---
    const interactable = {
      getWorldPosition: out => pickup.getWorldPosition(out),
      canInteract: () => pickup.canInteract(),
      getPrompt: () => pickup.getPrompt(),
      onInteract: (controller) => {
        pickup.doPickup();
        interactionManager.unregister(interactable);
      },
    };
    interactionManager.register(interactable);

    // cleanup automatico quando muore
    const removeOnDead = () => {
      if (pickup.isDead) {
        const idx = this.itemsInWorld.indexOf(pickup);
        if (idx >= 0) this.itemsInWorld.splice(idx, 1);
        interactionManager.unregister(interactable);
      }
    };

    this.itemsInWorld.push(pickup);
    // piccola guardia in update globale
    pickup._onDeadCheck = removeOnDead;

    return pickup;
  }

  /** Da chiamare nel game loop */
  update(dt, playerPosition) {
    for (const p of this.itemsInWorld) {
      p.update(dt, playerPosition);
      if (p.isDead) p._onDeadCheck?.();
    }
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

  /** Pulisce tutto (cambio scena, ecc.) */
  dispose() {
    for (const p of this.itemsInWorld) p.dispose();
    this.itemsInWorld.length = 0;
    interactionManager.clear();
  }
}
