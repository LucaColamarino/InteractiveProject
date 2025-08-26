// fx/PlayerBurnFX.js
import * as THREE from 'three';

export class PlayerBurnFX {
  /**
   * @param {THREE.Object3D} playerModel  Radice del modello player
   */
  constructor(playerModel){
    this.root = playerModel;
    this.enabled = false;
    this._time = 0;

    // ---------- Texture radiale generata a runtime (no asset) ----------
    this._spriteTex = this._makeRadialSprite(128);

    // ---------- Particelle ----------
    const COUNT = 120;               // leggero ma visibile
    this._lifeMinMax = [0.6, 1.4];   // vita in secondi
    this._velYMinMax = [1.5, 3.5];   // salita media
    this._radius = 0.45;             // raggio “torso”

    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const life = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);
    for (let i=0;i<COUNT;i++){
      pos[i*3+0] = 0;
      pos[i*3+1] = 1.1;  // altezza torace
      pos[i*3+2] = 0;
      life[i] = Math.random(); // 0..1, lo uso come fase
      seed[i] = Math.random();
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('life',     new THREE.BufferAttribute(life, 1));
    geom.setAttribute('seed',     new THREE.BufferAttribute(seed, 1));
    this._pGeom = geom;

    const mat = new THREE.PointsMaterial({
      map: this._spriteTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      size: 0.22,
      sizeAttenuation: true,
      opacity: 0.95
    });
    this._pMat = mat;

    this.particles = new THREE.Points(geom, mat);
    this.particles.frustumCulled = false;
    // li attacco al modello, così seguono il player
    this.root.add(this.particles);

    // ---------- Luce che sfarfalla ----------
    this.light = new THREE.PointLight(0xff7a2a, 0, 6); // intensità 0 iniziale
    this.light.position.set(0, 1.1, 0);
    this.root.add(this.light);

    // ---------- Emissive tint ----------
    // raccolgo i materiali del player per tingerli mentre brucia
    this._emissiveTargets = [];
    this.root.traverse(o=>{
      if (o.isMesh && o.material && 'emissive' in o.material) {
        this._emissiveTargets.push(o.material);
      }
    });

    // pool dati per update
    this._tmp = {
      rand01: () => Math.random(),
    };

    this.setEnabled(false); // parte spento
  }

  setEnabled(on){
    this.enabled = on;
    this.particles.visible = on;
    this.light.intensity = on ? 1.2 : 0.0;  // base; poi la modula l’update
    if (!on){
      // reset tinta emissiva
      for (const m of this._emissiveTargets){
        if (m.userData.__burnEmissiveOrig === undefined){
          // salta: non avevamo mai salvato
        } else {
          m.emissive.copy(m.userData.__burnEmissiveOrig);
        }
      }
    } else {
      // salva emissive originale solo la prima volta
      for (const m of this._emissiveTargets){
        if (m.userData.__burnEmissiveOrig === undefined){
          m.userData.__burnEmissiveOrig = m.emissive.clone();
        }
      }
    }
  }

  update(dt){
    this._time += dt;

    // ------ se disabilitato, niente anim ------
    if (!this.enabled) return;
    console.log("PLAYER FBX UPDATING");
    const pos = this._pGeom.getAttribute('position');
    const life = this._pGeom.getAttribute('life');
    const seed = this._pGeom.getAttribute('seed');

    // Aggiorna particelle: rispawning semplice “torch”
    for (let i=0;i<life.count;i++){
      let l = life.getX(i) + dt / this._lerp(this._lifeMinMax[0], this._lifeMinMax[1], seed.getX(i));
      if (l >= 1.0){
        // respawn: nuova fase
        l = 0.0;
        // nuova posizione base sul “cerchio” del torso
        const ang = seed.getX(i) * Math.PI * 2;
        const r = this._radius * (0.35 + 0.65 * Math.random());
        pos.setXYZ(i, Math.cos(ang)*r, 1.05 + 0.15*Math.random(), Math.sin(ang)*r);
      }
      life.setX(i, l);

      // alza lungo Y con un po’ di turbolenza
      const vy = this._lerp(this._velYMinMax[0], this._velYMinMax[1], seed.getX(i));
      const y = pos.getY(i) + vy * dt * (0.5 + 0.5*l); // più su verso fine vita
      pos.setY(i, y);

      // leggera espansione radiale + drift
      const x = pos.getX(i) * (1.0 + 0.35*dt);
      const z = pos.getZ(i) * (1.0 + 0.35*dt);
      pos.setX(i, x + (seed.getX(i)-0.5)*0.02);
      pos.setZ(i, z + (seed.getX(i)-0.5)*0.02);
    }
    pos.needsUpdate = true;
    life.needsUpdate = true;

    // modula trasparenza con “respiro”
    this._pMat.opacity = 0.85 + 0.15 * Math.sin(this._time*6.0);

    // ------ luce flicker ------
    const flick = 1.2 + 0.6*Math.sin(this._time*9.3) + 0.3*Math.sin(this._time*17.7);
    this.light.intensity = Math.max(0, flick);

    // ------ emissive tint ------
    // arancio fuoco, miscelato in base al flicker
    const k = 0.25 + 0.35 * (Math.sin(this._time*8.1)*0.5+0.5);
    for (const m of this._emissiveTargets){
      const base = m.userData.__burnEmissiveOrig || new THREE.Color(0x000000);
      // blend verso arancione
      const target = base.clone().lerp(new THREE.Color(0xff6a00), k);
      m.emissive.copy(target);
    }
  }

  // Texture circolare soft (RGBA)
  _makeRadialSprite(size=64){
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    // centro caldo → bordo trasparente
    g.addColorStop(0.0, 'rgba(255,200,80,1.0)');
    g.addColorStop(0.4, 'rgba(255,120,20,0.9)');
    g.addColorStop(0.7, 'rgba(180,50,10,0.35)');
    g.addColorStop(1.0, 'rgba(0,0,0,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,size,size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  _lerp(a,b,t){ return a + (b-a)*t; }
}
