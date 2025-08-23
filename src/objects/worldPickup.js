// src/objects/worldPickup.js
import * as THREE from 'three';

/* ------------------------------------------------------------------
   LightPool: mantiene un numero fisso di PointLight visibili in scena.
   I pickup "acquisiscono" una luce e la rilasciano mettendo intensity=0.
   Così il numero di luci visibili NON cambia e gli shader non ricompilano.
------------------------------------------------------------------- */
class LightPool {
  constructor(scene, size = 8, {
    color = 0xc8fff2, intensity = 0, distance = 4, decay = 1.5, yOffset = 0.65,
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'PickupLightsPool';
    scene.add(this.group);

    this._lights = [];
    this._free = [];
    for (let i = 0; i < size; i++) {
      const L = new THREE.PointLight(color, intensity, distance, decay);
      L.castShadow = false;          // niente shadow per evitare allocazioni
      L.position.set(0, yOffset, 0); // altezza "tipica"
      L.visible = true;              // ⚠ visibile TRUE per fissare il conteggio luci
      this.group.add(L);
      this._lights.push(L);
      this._free.push(L);
    }
  }
  acquire() { return this._free.pop() || null; }
  release(light) {
    if (!light) return;
    light.intensity = 0;             // spegni ma resta visibile (conteggio invariato)
    light.position.set(0, light.position.y, 0); // opzionale: reset XZ
    this._free.push(light);
  }
}

let __sharedLightPool = null;
function ensureLightPool(scene, size = 8) {
  if (!__sharedLightPool) __sharedLightPool = new LightPool(scene, size);
  return __sharedLightPool;
}

/* ----------------------------- WorldPickup ----------------------------- */
export class WorldPickup {
  constructor(opts = {}) {
    // ---- config & stato ----
    this.scene        = opts.scene || null;
    this.item         = opts.item || {};
    this.pickupRadius = opts.pickupRadius ?? 1.6;
    this._r2          = this.pickupRadius * this.pickupRadius;
    this.autoPickup   = !!opts.autoPickup;
    this._dead        = false;

    this._hover       = opts.hover ?? true;
    this._hoverAmp    = opts.hoverAmp ?? 0.06;
    this._hoverFreq   = opts.hoverFreq ?? 0.6;   // Hz
    this._rotate      = opts.rotate ?? true;
    this._rotSpeed    = opts.rotateSpeed ?? 0.9; // rad/s

    this._enableRing  = opts.enableRing ?? true;
    this._ringRadius  = opts.ringRadius ?? 0.6;
    this._ringNear    = opts.ringNear ?? 0x77ffcc;
    this._ringFar     = opts.ringFar ?? 0x66ccff;

    this._enableLight = opts.enableLight ?? true;
    this._lightNear   = opts.lightNear ?? 1.15;
    this._lightFar    = opts.lightFar ?? 0.75;

    this.onPicked     = (typeof opts.onPicked === 'function') ? opts.onPicked : null;

    // ---- root & model ----
    this.root = new THREE.Group();
    this.root.name = `WorldPickup_${this.item?.id ?? 'item'}`;

    const model = opts.model || new THREE.Mesh(WorldPickup._icoGeo(), WorldPickup._icoMat());
    model.rotation.set(0, 0, 0);
    this.model = model;
    this.root.add(model);

    if (opts.scale)    model.scale.copy(opts.scale);
    if (opts.position) this.root.position.copy(opts.position);
    this._baseY = this.root.position.y;

    // ---- ring (materiale per-istanza per colore dinamico) ----
    this.ring = null;
    if (this._enableRing) {
      const g = WorldPickup._ringGeo(this._ringRadius);
      const m = WorldPickup._ringMat().clone(); // colore per-istanza
      m.depthWrite = false; m.transparent = true; m.opacity = 0.85;
      this.ring = new THREE.Mesh(g, m);
      this.ring.rotation.x = -Math.PI * 0.5;
      this.ring.position.y = 0.02;
      this.ring.renderOrder = 2;
      this.ring.material.color.set(this._ringFar);
      this.root.add(this.ring);
    }

    // ---- light via pool (nessuna variazione di conteggio luci) ----
    this._light = null;
    if (this._enableLight && this.scene) {
      const pool = ensureLightPool(this.scene, opts.lightPoolSize ?? 8);
      this._light = pool.acquire();   // se finisce, semplicemente non illumina
      if (this._light) this._light.intensity = this._lightFar; // livello base
    }

    if (this.scene) this.scene.add(this.root);

    // ---- runtime cache ----
    this._t = Math.random() * 10;
    this._lastInRange = false;
    this._worldPos = new THREE.Vector3(); // riuso per posizionare la luce
  }

  // === API per interactionManager ===
  getWorldPosition(out) { return out ? out.copy(this.root.position) : this.root.position; }
  canInteract() { return !this._dead; }
  getPrompt() {
    const label = this.item?.label ?? this.item?.id ?? 'Oggetto';
    return { key: 'E', text: `Raccogli ${label}` };
  }

  doPickup() {
    if (this._dead) return;
    this._dead = true;

    const payload = this.item?.getPickupPayload?.() ?? { id: this.item?.id, qty: 1 };
    try { this.onPicked && this.onPicked(payload, this.item); } catch {}

    // nascondi subito
    this.root.visible = false;
    if (this.ring) this.ring.visible = false;

    // rilascia luce al pool (NON cambia il numero di luci visibili)
    if (this._light && __sharedLightPool) {
      __sharedLightPool.release(this._light);
      this._light = null;
    }

    // rimuovi dal scene-graph
    const p = this.root?.parent; if (p) p.remove(this.root);
  }

  // === Update per frame ===
  update(dt, playerPos) {
    if (this._dead) return;

    // animazioni leggere
    this._t += dt;
    if (this._hover) {
      this.root.position.y = this._baseY + Math.sin(this._t * 2 * Math.PI * this._hoverFreq) * this._hoverAmp;
    }
    if (this._rotate) this.model.rotation.y += this._rotSpeed * dt;

    // feedback + pickup
    if (!playerPos) return;

    const d2 = this.root.position.distanceToSquared(playerPos);
    const inRange = d2 <= this._r2;

    if (inRange !== this._lastInRange) {
      if (this.ring)  this.ring.material.color.set(inRange ? this._ringNear : this._ringFar);
      if (this._light) this._light.intensity = inRange ? this._lightNear : this._lightFar;
      this._lastInRange = inRange;
    }

    // posiziona la luce del pool sul pickup (in world space)
    if (this._light) {
      this.root.getWorldPosition(this._worldPos);
      this._light.position.set(this._worldPos.x, this._worldPos.y + 0.65, this._worldPos.z);
    }

    if (this.autoPickup && inRange) this.doPickup();
  }

  setVisible(v) { this.root.visible = !!v; }
  get isDead() { return this._dead; }

  // === risorse condivise ===
  static _icoGeo() {
    if (!WorldPickup.__icoGeo) WorldPickup.__icoGeo = new THREE.IcosahedronGeometry(0.18, 1);
    return WorldPickup.__icoGeo;
  }
  static _icoMat() {
    if (!WorldPickup.__icoMat) {
      WorldPickup.__icoMat = new THREE.MeshStandardMaterial({
        color: 0x9ff7ff,
        roughness: 0.25,
        metalness: 0.1,
        emissive: 0x183a40,
        emissiveIntensity: 0.35,
      });
    }
    return WorldPickup.__icoMat;
  }
  static _ringGeo(radius = 0.6) {
    WorldPickup.__ringGeoCache ??= new Map();
    const key = radius.toFixed(3);
    let g = WorldPickup.__ringGeoCache.get(key);
    if (!g) {
      g = new THREE.RingGeometry(radius * 0.65, radius, 48, 1);
      WorldPickup.__ringGeoCache.set(key, g);
    }
    return g;
  }
  static _ringMat() {
    if (!WorldPickup.__ringMat) {
      WorldPickup.__ringMat = new THREE.MeshBasicMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    }
    return WorldPickup.__ringMat;
  }
}
