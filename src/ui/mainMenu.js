// ui/mainMenu.js
export class MainMenu {
  /**
   * @param {{
   *  mode?: 'pause'|'full',
   *  onPlay?: Function,
   *  onResume?: Function,
   *  onQuit?: Function,
   *  getSettings?: Function,
   *  applySettings?: Function,
   * }} opts
   */
  constructor({
    mode = 'pause',
    onPlay,
    onResume,
    onQuit,
    getSettings,
    applySettings,
  } = {}) {
    this.mode = mode;
    this.onPlay = onPlay || (()=>{});
    this.onResume = onResume || (()=>{});
    this.onQuit = onQuit || (()=>{});
    this.getSettings = getSettings || (()=>({}));
    this.applySettings = applySettings || (()=>{});
    this._hasPlayed = (mode === 'pause'); // in pausa è già stato avviato
    this._build();
  }

  _build() {
    this.root = document.createElement('div');
    this.root.id = 'main-menu';
    this.root.innerHTML = `
      <div class="mm-backdrop"></div>
      <div class="mm-card">
        <h1 class="mm-title">My Game</h1>

        <div class="mm-section">
          ${this.mode === 'full' ? `<button id="mm-play" class="mm-btn mm-primary">▶ Play</button>` : ``}
          <button id="mm-resume" class="mm-btn" style="display:none">⏯ Resume</button>
        </div>

        <div class="mm-section">
          <h2 class="mm-subtitle">Settings</h2>

          <label class="mm-row">
            <span>Quality</span>
            <select id="mm-quality">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </label>

          <label class="mm-row">
            <span>Shadows</span>
            <input id="mm-shadows" type="checkbox" checked />
          </label>

          <label class="mm-row">
            <span>Resolution Scale</span>
            <input id="mm-res-scale" type="range" min="0.5" max="1.25" step="0.05" value="1" />
          </label>

          <label class="mm-row">
            <span>Volume</span>
            <input id="mm-volume" type="range" min="0" max="1" step="0.01" value="0.7" />
          </label>
        </div>

        <div class="mm-section">
          <button id="mm-quit" class="mm-btn mm-danger">Quit</button>
        </div>

        <p class="mm-hint">Tip: premi ESC per aprire/chiudere questo menu in gioco.</p>
      </div>
    `;
    document.body.appendChild(this.root);

    // Refs
    this.btnPlay = this.root.querySelector('#mm-play');
    this.btnResume = this.root.querySelector('#mm-resume');
    this.btnQuit = this.root.querySelector('#mm-quit');
    this.selQuality = this.root.querySelector('#mm-quality');
    this.chkShadows = this.root.querySelector('#mm-shadows');
    this.rangeResScale = this.root.querySelector('#mm-res-scale');
    this.rangeVolume = this.root.querySelector('#mm-volume');

    // Wire
    if (this.btnPlay) this.btnPlay.addEventListener('click', () => this._start());
    this.btnResume.addEventListener('click', () => this._resume());
    this.btnQuit.addEventListener('click', () => this.onQuit());

    // Apply settings live
    const apply = () => {
      this.applySettings({
        quality: this.selQuality.value,
        shadows: this.chkShadows.checked,
        resScale: parseFloat(this.rangeResScale.value),
        volume: parseFloat(this.rangeVolume.value),
      });
    };
    this.selQuality.addEventListener('change', apply);
    this.chkShadows.addEventListener('change', apply);
    this.rangeResScale.addEventListener('input', apply);
    this.rangeVolume.addEventListener('input', apply);

    // Init from settings
    const s = this.getSettings();
    if (s.quality) this.selQuality.value = s.quality;
    if (typeof s.shadows === 'boolean') this.chkShadows.checked = s.shadows;
    if (s.resScale) this.rangeResScale.value = s.resScale;
    if (typeof s.volume === 'number') this.rangeVolume.value = s.volume;

    // Parte nascosto (menu pausa)
    this.show(false);
    this._syncButtons();
  }

  _syncButtons() {
    if (this.mode === 'pause') {
      this.btnResume.style.display = 'inline-block';
      if (this.btnPlay) this.btnPlay.style.display = 'none';
    } else {
      this.btnResume.style.display = this._hasPlayed ? 'inline-block' : 'none';
      if (this.btnPlay) this.btnPlay.style.display = 'inline-block';
    }
  }

  setMode(mode='pause') {
    this.mode = mode;
    this._syncButtons();
  }

  show(v) {
    this.root.style.display = v ? 'grid' : 'none';
    if (v) this._syncButtons();
  }

  openPause() {
    this._hasPlayed = true;
    this.setMode('pause');
    this.show(true);
  }

  _unlockAudioIfNeeded() {
    try { if (window.__audioCtx?.state === 'suspended') window.__audioCtx.resume(); } catch {}
  }
  async _requestPointerLockIfAny(canvas) {
    if (!canvas || document.pointerLockElement) return;
    try { await canvas.requestPointerLock(); } catch {}
  }
  _start() {
    this._unlockAudioIfNeeded();
    this._hasPlayed = true;
    window.dispatchEvent(new CustomEvent('mm:play'));
    this.onPlay();
    this._requestPointerLockIfAny(document.querySelector('canvas'));
    this.show(false);
  }
  _resume() {
    this._unlockAudioIfNeeded();
    window.dispatchEvent(new CustomEvent('mm:resume'));
    this.onResume();
    this._requestPointerLockIfAny(document.querySelector('canvas'));
    this.show(false);
  }
}
