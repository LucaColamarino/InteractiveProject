// fx/PlayerBurnFX.js
import * as THREE from 'three';

export class PlayerBurnFX {
  /**
   * @param {THREE.Object3D} playerModel
   * @param {{yOffset?:number, maxRise?:number, radius?:number, count?:number}} opts
   */
  constructor(playerModel, opts = {}){
    this.root = playerModel;
    this.enabled = false;
    this._time = 0;

    // === NUOVI PARAMETRI PER ALTEZZA & POSIZIONE ===
    this._yOffset = opts.yOffset ?? 0.75;   // abbassa/alza l'effetto
    this._maxRise = opts.maxRise ?? 0.50;   // altezza colonna (bassa!)
    this._radius  = opts.radius  ?? 0.30;   // raggio alla base (più stretto)
    const COUNT   = opts.count   ?? 100;

    // Anchor locale così il posizionamento è comodo
    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, this._yOffset, 0);
    this.root.add(this.anchor);

    // Sprite runtime
    this._spriteTex = this._makeRadialSprite(128);

    // Particelle
    this._lifeMinMax = [0.5, 1.0];      // vita più corta
    this._velYMinMax = [0.8, 1.6];      // salita più lenta

    const geom = new THREE.BufferGeometry();
    const pos  = new Float32Array(COUNT * 3);
    const life = new Float32Array(COUNT);
    const seed = new Float32Array(COUNT);

    for (let i=0;i<COUNT;i++){
      // spawn intorno all'anchor, y ~ 0 (base)
      const a = Math.random() * Math.PI * 2;
      const r = this._radius * (0.35 + 0.65 * Math.random());
      pos[i*3+0] = Math.cos(a)*r;
      pos[i*3+1] = 0.02 + Math.random()*0.05;
      pos[i*3+2] = Math.sin(a)*r;
      life[i] = Math.random();
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
      size: 0.18,           // leggermente più piccolo
      sizeAttenuation: true,
      opacity: 0.95
    });
    this._pMat = mat;

    this.particles = new THREE.Points(geom, mat);
    this.particles.frustumCulled = false;
    this.anchor.add(this.particles); // <-- attaccato all'anchor basso

    // Luce (ancorata e più vicina al corpo)
    this.light = new THREE.PointLight(0xff7a2a, 0, 4.5);
    this.light.position.set(0, 0.12, 0);
    this.anchor.add(this.light);

    // Emissive tint
    this._emissiveTargets = [];
    this.root.traverse(o=>{
      if (o.isMesh && o.material && 'emissive' in o.material) {
        this._emissiveTargets.push(o.material);
      }
    });

    this.setEnabled(false);
  }

  setEnabled(on){
    this.enabled = on;
    this.particles.visible = on;
    this.light.intensity = on ? 1.0 : 0.0;
    if (!on){
      for (const m of this._emissiveTargets){
        if (m.userData.__burnEmissiveOrig) m.emissive.copy(m.userData.__burnEmissiveOrig);
      }
    } else {
      for (const m of this._emissiveTargets){
        if (!m.userData.__burnEmissiveOrig) m.userData.__burnEmissiveOrig = m.emissive.clone();
      }
    }
  }

  // 👉 puoi chiamarla a runtime per rifinire l’altezza/offset
  configure({ yOffset, maxRise, radius }={}){
    if (yOffset !== undefined){ this._yOffset = yOffset; this.anchor.position.y = yOffset; }
    if (maxRise !== undefined){ this._maxRise = maxRise; }
    if (radius  !== undefined){ this._radius  = radius;  }
  }

  update(dt){
    this._time += dt;
    if (!this.enabled) return;

    const pos  = this._pGeom.getAttribute('position');
    const life = this._pGeom.getAttribute('life');
    const seed = this._pGeom.getAttribute('seed');

    for (let i=0;i<life.count;i++){
      // progressione vita
      const lifeDur = this._lerp(this._lifeMinMax[0], this._lifeMinMax[1], seed.getX(i));
      let l = life.getX(i) + dt / lifeDur;

      // posizione attuale
      let px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);

      // salita (cap a maxRise)
      const vy = this._lerp(this._velYMinMax[0], this._velYMinMax[1], seed.getX(i));
      py += vy * dt * (0.4 + 0.6*l);

      // leggera espansione e drift
      px *= (1.0 + 0.22*dt);
      pz *= (1.0 + 0.22*dt);
      px += (seed.getX(i)-0.5)*0.016;
      pz += (seed.getX(i)-0.5)*0.016;

      // LIMITA ALTEZZA: se supera la colonna, respawn immediato e basso
      if (py > this._maxRise || l >= 1.0){
        l = 0.0;
        const a = seed.getX(i) * Math.PI * 2;
        const r = this._radius * (0.35 + 0.65 * Math.random());
        px = Math.cos(a)*r;
        py = 0.02 + Math.random()*0.05;
        pz = Math.sin(a)*r;
      }

      life.setX(i, l);
      pos.setXYZ(i, px, py, pz);
    }

    pos.needsUpdate  = true;
    life.needsUpdate = true;

    // respirazione opacità + luce
    this._pMat.opacity = 0.82 + 0.14 * Math.sin(this._time*6.0);
    const flick = 1.0 + 0.5*Math.sin(this._time*9.3) + 0.25*Math.sin(this._time*17.7);
    this.light.intensity = Math.max(0, flick);

    // emissive tint contenuta (meno invadente)
    const k = 0.18 + 0.22 * (Math.sin(this._time*8.1)*0.5+0.5);
    for (const m of this._emissiveTargets){
      const base = m.userData.__burnEmissiveOrig || new THREE.Color(0x000000);
      const target = base.clone().lerp(new THREE.Color(0xff6a00), k);
      m.emissive.copy(target);
    }
  }

  _makeRadialSprite(size=64){
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    g.addColorStop(0.0, 'rgba(255,200,80,1.0)');
    g.addColorStop(0.45,'rgba(255,120,20,0.9)');
    g.addColorStop(0.75,'rgba(160,40,10,0.28)');
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
