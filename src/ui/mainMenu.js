// /src/ui/mainMenu.js – Menu principale/pausa ottimizzato
export class MainMenu {
  /**
   * @param {{onPlay?: Function, onResume?: Function, onQuit?: Function, getSettings?: Function, applySettings?: Function }} opts
   */
  constructor({
    onResume = () => {},
    onQuit = () => {},
    getSettings = () => ({}),
    applySettings = () => {},
  } = {}) {
    this.onResume = onResume;
    this.onQuit = onQuit;
    this.getSettings = getSettings;
    this.applySettings = applySettings;
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'main-menu';
    root.innerHTML = `
      <div class="mm-backdrop"></div>
      <div class="mm-card">
        <h1 class="mm-title">Metamorphosis</h1>

        <div class="mm-section">
          <button id="mm-resume" class="mm-btn" style="display = 'inline-block'">⏯ Resume</button>
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
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;


    this.btnResume    = root.querySelector('#mm-resume');
    this.btnQuit      = root.querySelector('#mm-quit');
    this.selQuality   = root.querySelector('#mm-quality');
    this.chkShadows   = root.querySelector('#mm-shadows');
    this.rangeResScale= root.querySelector('#mm-res-scale');
    this.rangeVolume  = root.querySelector('#mm-volume');


    this.btnResume.addEventListener('click', () => this._resume());
    this.btnQuit.addEventListener('click', () => this.onQuit());

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

    // Init settings
    const s = this.getSettings() || {};
    if (s.quality) this.selQuality.value = s.quality;
    if (typeof s.shadows === 'boolean') this.chkShadows.checked = s.shadows;
    if (s.resScale) this.rangeResScale.value = s.resScale;
    if (typeof s.volume === 'number') this.rangeVolume.value = s.volume;
    // Start hidden
    this.show(false);
  }
  show(v) {
    this.root.style.display = v ? 'grid' : 'none';
  }

  toggleMenu() {
    if(this.root.style.display=='grid'){
      console.log("Closing Main Menu");
      this._resume();
    }else{
      console.log("Opening Main Menu");
      this.show(true);
    }
  }

  async _requestPointerLockIfAny(canvas) {
    if (!canvas || document.pointerLockElement) return;
    try { await canvas.requestPointerLock(); } catch {}
  }

  _resume() {
    this.onResume();
    this.show(false);
  }
}
