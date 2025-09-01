import { gameManager } from "../managers/gameManager";
export class MainMenu {
  constructor({
    onResume = () => {},
    onQuit = () => {},
    getSettings = () => ({}),
    applySettings = () => {},
    pointerLockTarget = null,
  } = {}) {
    this.onResume = onResume;
    this.onQuit = onQuit;
    this.getSettings = getSettings;
    this.applySettings = applySettings;
    this.pointerLockTarget = pointerLockTarget;
    this._build();
  }
  _build() {
    const root = document.createElement('div');
    root.id = 'main-menu';
    root.innerHTML = `
      <div class="mm-fog"></div>
      <div class="mm-fog mm-fog-2"></div>
      <div class="mm-card" role="dialog" aria-modal="true" aria-labelledby="mm-title">
        <div class="mm-title-wrap">
          <h1 id="mm-title" class="mm-title">
            <span class="mm-title-main">METAMORPHOSIS</span>
            <span class="mm-title-sub">PAUSE MENU</span>
          </h1>
          <div class="mm-title-glow"></div>
        </div>

        <div class="mm-section">
          <button id="mm-resume" class="mm-btn mm-primary">
            <span class="mm-btn-icon">⏯</span>
            <span class="mm-btn-text">RESUME</span>
            <div class="mm-btn-ember"></div>
          </button>
        </div>

        <div class="mm-section">
          <h2 class="mm-subtitle">Settings</h2>

          <label class="mm-row mm-row-grid">
            <span>Quality</span>
            <select id="mm-quality">
              ${['Low','Medium','High','Ultra'].map(q => `<option value="${q}">${q}</option>`).join('')}
            </select>
          </label>

          <label class="mm-row mm-row-grid">
            <span>Shadows</span>
            <label class="mm-switch">
              <input id="mm-shadows" type="checkbox" checked />
              <span class="mm-slider"></span>
            </label>
          </label>

          <label class="mm-row mm-row-grid">
            <span>Resolution Scale</span>
            <div class="mm-range-wrap">
              <input id="mm-res-scale" type="range" min="0.5" max="1.25" step="0.05" value="1" />
              <span id="mm-res-scale-val" class="mm-range-val">100%</span>
            </div>
          </label>

          <label class="mm-row mm-row-grid">
            <span>Master Volume</span>
            <div class="mm-range-wrap">
              <input id="mm-volume" type="range" min="0" max="1" step="0.01" value="0.7" />
              <span id="mm-volume-val" class="mm-range-val">70%</span>
            </div>
          </label>

          <div class="mm-actions">
            <button id="mm-apply" class="mm-btn mm-primary">
              <span class="mm-btn-icon">💾</span>
              <span class="mm-btn-text">APPLY</span>
              <div class="mm-btn-ember"></div>
            </button>
          </div>
        </div>

        <div class="mm-section">
          <button id="mm-quit" class="mm-btn mm-danger">
            <span class="mm-btn-icon">💀</span>
            <span class="mm-btn-text">SAVE AND QUIT</span>
            <div class="mm-btn-ember"></div>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.btnResume     = root.querySelector('#mm-resume');
    this.btnQuit       = root.querySelector('#mm-quit');
    this.btnApply      = root.querySelector('#mm-apply');
    this.selQuality    = root.querySelector('#mm-quality');
    this.chkShadows    = root.querySelector('#mm-shadows');
    this.rangeResScale = root.querySelector('#mm-res-scale');
    this.resScaleVal   = root.querySelector('#mm-res-scale-val');
    this.rangeVolume   = root.querySelector('#mm-volume');
    this.volumeVal     = root.querySelector('#mm-volume-val');
    this._onKeyDown = (e) => {
      if (this.isVisible()) {
        if (e.key === 'Escape') {
          this._resume();
        }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    this.btnResume.addEventListener('click', () => this._resume());
    this.btnQuit.addEventListener('click', () => this.onQuit());
    this.btnApply.addEventListener('click', () => this._apply());
    this.rangeResScale.addEventListener('input', () => {
      const pct = Math.round(parseFloat(this.rangeResScale.value) * 100);
      this.resScaleVal.textContent = `${pct}%`;
    });
    this.rangeVolume.addEventListener('input', () => {
      const pct = Math.round(parseFloat(this.rangeVolume.value) * 100);
      this.volumeVal.textContent = `${pct}%`;
    });
    this._syncFromSettings();
    this.show(false);
  }

  // --- UI helpers ---
  isVisible() {
    return this.root.classList.contains('mm-show');
  }

  show(v) {
    if (v) {
      this._syncFromSettings();
      this.root.style.display = 'block';
      this.root.classList.add('mm-show');
      this.root.classList.remove('mm-hide');
    } else {
      this.root.classList.remove('mm-show');
      this.root.classList.add('mm-hide');
      setTimeout(() => {
        if (!this.isVisible()) this.root.style.display = 'none';
      }, 300);
    }
  }

  toggleMenu() {
    if (this.isVisible()) {
      this._resume();
    } else {
      gameManager.isPaused=true;
      this.show(true);
    }
  }

  _syncFromSettings() {
    const s = this.getSettings?.() || {};
    const qual = (s.quality || 'High');
    const normalizedQ = typeof qual === 'string'
      ? qual[0].toUpperCase() + qual.slice(1).toLowerCase()
      : 'High';

    if (['Low','Medium','High','Ultra'].includes(normalizedQ)) {
      this.selQuality.value = normalizedQ;
    } else {
      this.selQuality.value = 'High';
    }
    this.chkShadows.checked = (typeof s.shadows === 'boolean') ? s.shadows : true;
    const rs = (typeof s.resScale === 'number') ? s.resScale : 1;
    this.rangeResScale.value = String(rs);
    this.resScaleVal.textContent = `${Math.round(rs * 100)}%`;
    const vol = (typeof s.volume === 'number') ? s.volume : 0.7;
    this.rangeVolume.value = String(vol);
    this.volumeVal.textContent = `${Math.round(vol * 100)}%`;
  }

  _apply() {
    const settings = {
      quality: this.selQuality.value,
      shadows: !!this.chkShadows.checked,
      resScale: parseFloat(this.rangeResScale.value),
      volume: parseFloat(this.rangeVolume.value),
    };
    this.applySettings?.(settings);
    this.root.dispatchEvent(new CustomEvent('settingsChanged', { detail: { settings } }));
  }

  async _requestPointerLockIfAny(el) {
    if (!el || document.pointerLockElement) return;
    try { await el.requestPointerLock(); } catch {}
  }

  _resume() {
    this.onResume?.();
    this.show(false);
    gameManager.isPaused=false;
    this._requestPointerLockIfAny(this.pointerLockTarget);
  }
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.root?.remove();
  }
}
