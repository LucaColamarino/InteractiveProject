import * as THREE from 'three';

export class HitFeedbackSystem {
  constructor({ camera, playerObj, audio }) {
    this.camera = camera;
    this.playerObj = playerObj;
    this.audio = audio;
    // Camera shake
    this._shakeTime = 0;
    this._shakeAmp = 0;
    this._shakeFreq = 0;
    this._shakeDuration = 0;
    this._origCamPos = new THREE.Vector3();
    this._cameraOffset = new THREE.Vector3(0, 2, 5);
    if (this.camera && this.playerObj) {
      this._cameraOffset.copy(this.camera.position).sub(this.playerObj.position);
      this._origCamPos.copy(this.camera.position);
    } else if (this.camera) {
      this._origCamPos.copy(this.camera.position);
    }
    // Mesh effects
    this._blinkTime = 0;
    this._blinkDuration = 0;
    this._originalMaterials = new Map();
    // Timers 
    this._timers = [];
    // Pool floating damage
    this._damagePool = [];
    this._initDamagePool(10);
  }
  onHit({ dmg = 0, dir = null, type = 'normal' }) {
    const intensity = Math.min(dmg / 100, 1);
    const baseIntensity = Math.max(0.3, intensity);
    this._hudFlash(type, baseIntensity);
    this._cameraShake(type, baseIntensity, dir);
    this._playHurt(type);
    this._meshBlink(type, baseIntensity);
    this._floatingDamage(dmg, type, dir);
    if (dir) this._directionalImpact(dir, baseIntensity);
  }
  update(dt) {
    this._updateCameraShake(dt);
    this._updateMeshBlink(dt);
  }
  // --------- CAMERA SHAKE ----------
  _updateCameraShake(dt) {
    if (!this.camera || this._shakeTime <= 0) return;
    this._shakeTime -= dt;
    const t = Math.max(this._shakeTime, 0);
    if (this.playerObj) {
      const playerPos = this.playerObj.position;
      this._origCamPos.copy(playerPos).add(this._cameraOffset);
    }

    if (t <= 0) {
      this.camera.position.copy(this._origCamPos);
      return;
    }
    const progress = t / this._shakeDuration;     // 1→0
    const easing = this._easeOutQuart(1 - progress);
    const amplitude = this._shakeAmp * easing;
    const elapsed = (this._shakeDuration - t);
    const phase = elapsed * this._shakeFreq;
    const offsetX = Math.sin(phase * 2.1) * amplitude * 0.6;
    const offsetY = Math.cos(phase * 3.2) * amplitude * 0.2;
    const offsetZ = Math.sin(phase * 1.7) * amplitude * 0.4;
    this.camera.position.copy(this._origCamPos);
    this.camera.position.x += offsetX;
    this.camera.position.y += Math.max(offsetY, -amplitude * 0.1);
    const maxZ = Math.max(0.05, amplitude * 0.5);
    this.camera.position.z += THREE.MathUtils.clamp(offsetZ, -maxZ, maxZ);
    const minY = (this.playerObj?.position.y || 0) + 0.5;
    if (this.camera.position.y < minY) this.camera.position.y = minY;
  }

  _cameraShake(type = 'normal', intensity = 1) {
    let duration, amplitude, frequency;
    switch (type) {
      case 'critical': duration = 0.25; amplitude = 0.12; frequency = 20; break;
      case 'heavy':    duration = 0.30; amplitude = 0.15; frequency = 12; break;
      case 'light':    duration = 0.12; amplitude = 0.05; frequency = 25; break;
      default:         duration = 0.18; amplitude = 0.08; frequency = 15;
    }
    this._shakeDuration = duration * Math.min(0.7 + intensity * 0.3, 1.2);
    this._shakeTime = this._shakeDuration;
    this._shakeAmp = amplitude * Math.min(intensity, 1.5);
    this._shakeFreq = frequency;
    if (this.camera && this.playerObj) {
      this._cameraOffset.copy(this.camera.position).sub(this.playerObj.position);
      this._origCamPos.copy(this.playerObj.position).add(this._cameraOffset);
    } else if (this.camera) {
      this._origCamPos.copy(this.camera.position);
    }
  }
  // ---------- MESH BLINK ----------

  _updateMeshBlink(dt) {
    if (this._blinkTime <= 0) return;
    this._blinkTime -= dt;
    if (this._blinkTime <= 0) {
      this._restoreOriginalMaterials();
      return;
    }
    const progress = 1 - (this._blinkTime / this._blinkDuration); 
    const intensity = Math.sin(progress * Math.PI * 6) * 0.5 + 0.5;
    this._forEachMeshMaterial(this.playerObj, (mat) => {
      if (mat.emissive) {
        const r = 0.8 * intensity, g = 0.1 * intensity, b = 0.1 * intensity;
        mat.emissive.setRGB(r, g, b);
      }
    });
  }

  _meshBlink(type = 'normal', intensity = 1) {
    if (!this.playerObj) return;
    this._saveOriginalMaterials();
    const base = (type === 'critical') ? 0.25 : 0.15;
    this._blinkDuration = base * (0.8 + intensity * 0.2);
    this._blinkTime = this._blinkDuration;
  }
  _saveOriginalMaterials() {
    if (this._originalMaterials.size > 0) return;
    this._forEachMeshMaterial(this.playerObj, (mat) => {
      if (mat.emissive && !this._originalMaterials.has(mat.uuid)) {
        this._originalMaterials.set(mat.uuid, mat.emissive.clone());
      }
    });
  }
  _restoreOriginalMaterials() {
    this._forEachMeshMaterial(this.playerObj, (mat) => {
      const col = this._originalMaterials.get(mat.uuid);
      if (mat.emissive && col) mat.emissive.copy(col);
    });
    this._originalMaterials.clear();
  }

  _forEachMeshMaterial(root, cb) {
    if (!root) return;
    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((mi) => mi && cb(mi));
      else cb(m);
    });
  }
  // ---------- HUD FLASH ----------

  _hudFlash(type = 'normal', intensity = 1) {
    const el = document.getElementById('hit-flash');
    if (!el) return;
    el.classList.remove('show');
    el.offsetHeight;
    const rgb = (() => {
      switch (type) {
        case 'critical': return [255, 100, 0];
        case 'poison':   return [100, 255, 50];
        case 'magic':    return [100, 150, 255];
        default:         return [255, 0, 0];
      }
    })();
    const a1 = 0.28 * intensity;
    const a2 = Math.min(a1 * 1.25, 0.5); 
    const [r, g, b] = rgb;
    el.style.background = `
      radial-gradient(farthest-side at 50% 50%,
        rgba(${r},${g},${b},0.00) 45%,
        rgba(${r},${g},${b},${a1.toFixed(2)}) 75%,
        rgba(${r},${g},${b},${a2.toFixed(2)}) 100%)
    `;
    el.classList.add('show');
    this._clearTimer('flash');
    this._timers.push({
      name: 'flash',
      id: setTimeout(() => el.classList.remove('show'), Math.max(120, 160 * intensity))
    });
  }
  // ---------- DIRECTIONS ----------
  _directionalImpact(direction, intensity) {
    if (!this.camera || !direction) return;
    const impact = new THREE.Vector3().copy(direction).multiplyScalar(intensity * 0.04);
    const orig = this.camera.rotation.clone();
    this.camera.rotation.x = orig.x + THREE.MathUtils.clamp(impact.y, -0.03, 0.03);
    this.camera.rotation.y = orig.y + THREE.MathUtils.clamp(impact.x, -0.03, 0.03);
    this._clearTimer('rotation');
    this._timers.push({
      name: 'rotation',
      id: setTimeout(() => { if (this.camera) this.camera.rotation.copy(orig); }, 80)
    });
  }
  _playHurt(type = 'normal') {
    try {
      if (type === 'critical') this.audio?.playCriticalHurt?.();
      else if (type === 'heavy') this.audio?.playHeavyHurt?.();
      else this.audio?.playHurt?.();
    } catch (e) {}
  }
  // ---------- FLOATING DAMAGE ----------
  _floatingDamage(dmg, type = 'normal', direction = null) {
    const root = document.getElementById('floating-damage-root');
    if (!root) return;

    const span = this._getDamageElement();
    if (!span) return;

    let className = 'fd';
    let text = `-${dmg}`;
    if (type === 'critical') { className += ' fd-critical'; text = `CRITICAL! ${text}`; }
    else if (type === 'heavy') className += ' fd-heavy';
    else if (type === 'poison') className += ' fd-poison';

    span.className = className;
    span.textContent = text;

    const dx = (Math.random() - 0.5) * 60; 
    const dy = (Math.random() - 0.5) * 20; 
    span.style.left = `${dx}px`;
    span.style.top = `${dy}px`;

    if (direction) {
      span.style.setProperty('--impact-x', `${direction.x * 20}px`);
    }

    root.appendChild(span);

    setTimeout(() => this._returnDamageElement(span), 800);
  }
  _initDamagePool(size) {
    for (let i = 0; i < size; i++) {
      const span = document.createElement('span');
      span.style.display = 'none';
      this._damagePool.push(span);
    }
  }
  _getDamageElement() {
    const span = this._damagePool.pop();
    if (span) { span.style.display = 'block'; return span; }
    return document.createElement('span');
    }
  _returnDamageElement(span) {
    if (span.parentNode) span.parentNode.removeChild(span);
    span.style.display = 'none';
    span.className = '';
    span.textContent = '';
    span.style.left = '0';
    span.style.top = '0';
    this._damagePool.push(span);
  }
  // ---------- UTILS ----------
  _easeOutQuart(t) { return 1 - (--t) * t * t * t; }
  _easeOutBounce(t) {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
  _clearTimer(name) {
    const i = this._timers.findIndex(t => t.name === name);
    if (i !== -1) {
      clearTimeout(this._timers[i].id);
      this._timers.splice(i, 1);
    }
  }
  destroy() {
    this._timers.forEach(t => clearTimeout(t.id));
    this._timers.length = 0;
    this._originalMaterials.clear();
    this._damagePool.length = 0;
  }
}