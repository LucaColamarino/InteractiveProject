// mainMenu.js
export class MainMenu {
  constructor({
    onPlay,
    onResume,
    onQuit,
    getSettings,
    applySettings,
  }) {
    this.onPlay = onPlay || (()=>{});
    this.onResume = onResume || (()=>{});
    this.onQuit = onQuit || (()=>{});
    this.getSettings = getSettings || (()=>({}));
    this.applySettings = applySettings || (()=>{});
    this._build();
  }

  _build() {
    // Container overlay
    this.root = document.createElement('div');
    this.root.id = 'main-menu';
    this.root.innerHTML = `
      <div class="mm-backdrop"></div>
      <div class="mm-card">
        <h1 class="mm-title">My Game</h1>

        <div class="mm-section">
          <button id="mm-play" class="mm-btn mm-primary">▶ Play</button>
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

        <p class="mm-hint">Tip: il puntatore verrà bloccato quando premi Play (Pointer Lock).</p>
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
    this.btnPlay.addEventListener('click', () => this._start());
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

    // Init from current settings
    const s = this.getSettings();
    if (s.quality) this.selQuality.value = s.quality;
    if (typeof s.shadows === 'boolean') this.chkShadows.checked = s.shadows;
    if (s.resScale) this.rangeResScale.value = s.resScale;
    if (typeof s.volume === 'number') this.rangeVolume.value = s.volume;

    // Start visible as main menu
    this.show(true);
  }

  // Show/hide overlay
  show(v) {
    console.log(`[MainMenu] ${v ? 'Showing' : 'Hiding'} main menu`);
    this.root.style.display = v ? 'grid' : 'none';
    // Toggle Resume button after first Play
    this.btnResume.style.display = v && this._hasPlayed ? 'inline-block' : 'none';
  }

  // Call when game is paused to bring menu back
  openPause() {
    this._hasPlayed = true;
    this.show(true);
  }

  _unlockAudioIfNeeded() {
    // Sblocca AudioContext su gesture utente
    try {
      if (window.__audioCtx && window.__audioCtx.state === 'suspended') {
        window.__audioCtx.resume();
      }
    } catch(e) {}
  }

  async _requestPointerLockIfAny(canvas) {
    if (!canvas) return;
    if (document.pointerLockElement) return;
    try {
      await canvas.requestPointerLock();
    } catch(e) {
      // alcuni browser richiedono gesture esplicita; è ok se fallisce
    }
  }

  _start() {
    this._unlockAudioIfNeeded();
    this._hasPlayed = true;
    // app chiede il canvas tramite evento personalizzato,
    // oppure passa il canvas nel costruttore se preferisci.
    const ev = new CustomEvent('mm:play');
    window.dispatchEvent(ev);
    this.onPlay();
    // tenta pointer lock sul primo canvas trovato
    const canvas = document.querySelector('canvas');
    this._requestPointerLockIfAny(canvas);
    this.show(false);
  }

  _resume() {
    this._unlockAudioIfNeeded();
    const ev = new CustomEvent('mm:resume');
    window.dispatchEvent(ev);
    this.onResume();
    const canvas = document.querySelector('canvas');
    this._requestPointerLockIfAny(canvas);
    this.show(false);
  }
}
