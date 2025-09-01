import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { WorldPickup } from '../objects/worldPickup.js';
import { interactionManager } from '../systems/interactionManager.js';
import { hudManager } from '../ui/hudManager.js';

function _hasSkinnedMesh(root) {
  let found = false;
  root.traverse(o => { if (o.isSkinnedMesh) found = true; });
  return found;
}

export class PickableManager {
  constructor({
    scene,
    inventory = null,
    onPickup = null,
    enableLight = true,
    lightPoolSize = 8,
  } = {}) {
    this.scene = scene;
    this.inventory = inventory;
    this.onPickup = onPickup;
    this.enableLight = enableLight;

    this.loader = new FBXLoader();
    this.itemsInWorld = [];
    this.lightPoolSize = lightPoolSize;
    this.modelCache = new Map();
    this._didFirstSpawn = false;
    try { WorldPickup.warmLightPool?.(this.scene, this.lightPoolSize); } catch {}
  }

  async _loadModel(path) {
    if (this.modelCache.has(path)) {
      const prefab = this.modelCache.get(path);
      return prefab.clone(true);
    }

    const raw = await this.loader.loadAsync(path);

    raw.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (!o.material.emissive) o.material.emissive = new THREE.Color(0x000000);
      }
    });

    const box = new THREE.Box3().setFromObject(raw);
    const size = new THREE.Vector3(); box.getSize(size);
    const targetHeight = 0.9;
    const h = Math.max(size.y, 1e-3);
    const s = targetHeight / h;
    raw.scale.setScalar(s);

    const box2 = new THREE.Box3().setFromObject(raw);
    raw.position.y -= box2.min.y;

    raw.updateMatrixWorld(true);

    const prefab = _hasSkinnedMesh(raw) ? raw.clone(true) : raw;
    this.modelCache.set(path, prefab);
    return prefab.clone(true);
  }

  async prewarm(itemsOrPaths = []) {
    const paths = itemsOrPaths.map(x => typeof x === 'string' ? x : x?.modelPath).filter(Boolean);
    const unique = [...new Set(paths)];
    await Promise.all(unique.map(p => this._loadModel(p).catch(() => {})));
    try { WorldPickup.warmLightPool?.(this.scene, this.lightPoolSize); } catch {}
  }

  spawnItem(item, position, opts = {}) {
    const {
      autoPickup = false,
      pickupRadius = 1.5,
      enableLight = this.enableLight,
      hover = true,
      rotate = true,
      enableRing = true,
    } = opts;

    return new Promise((resolve) => {
      const doSpawn = async () => {
        const pos = position.clone();
        pos.y += 0.6;

        const model = await this._loadModel(item.modelPath);

        const pickup = new WorldPickup({
          scene: this.scene,
          item,
          model,
          position: pos,
          autoPickup,
          pickupRadius,
          enableLight,
          hover,
          rotate,
          enableRing,
          onPicked: (payload, gameItem) => {
            try { this.inventory?.addItem?.(payload); gameItem.specialPickup?.(); } catch {}
            try { typeof this.onPickup === 'function' && this.onPickup(payload, gameItem); } catch {}
            hudManager.showNotification?.(`+ ${gameItem?.label ?? gameItem?.id ?? 'Item'}`);
          }
        });

        const interactable = {
          getWorldPosition: out => pickup.getWorldPosition(out),
          canInteract: () => pickup.canInteract(),
          getPrompt: () => pickup.getPrompt(),
          onInteract: () => {
            pickup.doPickup();
            interactionManager.unregister(interactable);
          },
        };
        interactionManager.register(interactable);

        const removeOnDead = () => {
          if (pickup.isDead) {
            const idx = this.itemsInWorld.indexOf(pickup);
            if (idx >= 0) this.itemsInWorld.splice(idx, 1);
            interactionManager.unregister(interactable);
          }
        };

        this.itemsInWorld.push(pickup);
        pickup._onDeadCheck = removeOnDead;

        resolve(pickup);
      };

      requestAnimationFrame(doSpawn);
    });
  }

  update(dt, playerPosition) {
    for (const p of this.itemsInWorld) {
      p.update(dt, playerPosition);
      if (p.isDead) p._onDeadCheck?.();
    }
  }

  async spawnMany(items, positions, perItemOptions = {}) {
    const res = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const pos  = positions[i];
      const opt  = perItemOptions[item.id] || {};
      res.push(await this.spawnItem(item, pos, opt));
    }
    return res;
  }

  dispose() {
    for (const p of this.itemsInWorld) p.dispose();
    this.itemsInWorld.length = 0;
    interactionManager.clear();
  }
}
