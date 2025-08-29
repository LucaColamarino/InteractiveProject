// /src/ui/startMenu.js — Soulslike-inspired start menu (with Settings)
export class StartMenu {
  /**
   * @param {{
   *   onStart?: Function,
   *   onQuit?: Function,
   *   onSettingsChange?: (settings)=>void,
   *   initialSettings?: Partial<{
   *     musicVolume:number, sfxVolume:number,
   *     fullscreen:boolean, quality:'Low'|'Medium'|'High'|'Ultra',
   *     shadows:boolean, resolution:string
   *   }>
   * }} opts
   */
  constructor({
    onStart = () => {},
    onQuit = () => {},
    onSettingsChange = () => {},
    initialSettings = {}
  } = {}) {
    this.onStart = onStart;
    this.onQuit = onQuit;
    this.onSettingsChange = onSettingsChange;

    this._settingsKey = 'metamorphosis_settings_v1';
    this.settings = this._loadSettings(initialSettings);

    this.particles = [];
    this.animationId = null;

    this._build();
    this._startParticles();
  }

  _loadSettings(overrides = {}) {
    let fromStore = {};
    try {
      const raw = localStorage.getItem(this._settingsKey);
      if (raw) fromStore = JSON.parse(raw);
    } catch {}
    const defaults = {
      musicVolume: 70,
      sfxVolume: 80,
      fullscreen: false,
      quality: 'High',
      shadows: true,
      resolution: 'Auto'
    };
    return { ...defaults, ...fromStore, ...overrides };
  }

  _saveSettings() {
    try {
      localStorage.setItem(this._settingsKey, JSON.stringify(this.settings));
    } catch {}
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'start-menu';
    root.innerHTML = `
      <canvas class="sm-particles"></canvas>
      <div class="sm-fog"></div>
      <div class="sm-fog sm-fog-2"></div>
      <div class="sm-card">
        <div class="sm-title-container">
          <h1 class="sm-title">
            <span class="sm-title-main">METAMORPHOSIS</span>
            <span class="sm-title-sub">EVOLVE BEYOND</span>
          </h1>
          <div class="sm-title-glow"></div>
        </div>
        
        <div class="sm-menu">
          <button id="sm-start" class="sm-btn sm-primary">
            <span class="sm-btn-icon">⚔</span>
            <span class="sm-btn-text">BEGIN JOURNEY</span>
            <div class="sm-btn-ember"></div>
          </button>
          
          <button id="sm-continue" class="sm-btn">
            <span class="sm-btn-icon">🔥</span>
            <span class="sm-btn-text">CONTINUE</span>
            <div class="sm-btn-ember"></div>
          </button>
          
          <button id="sm-settings" class="sm-btn">
            <span class="sm-btn-icon">⚙</span>
            <span class="sm-btn-text">SETTINGS</span>
            <div class="sm-btn-ember"></div>
          </button>
          
          <button id="sm-quit" class="sm-btn sm-danger">
            <span class="sm-btn-icon">💀</span>
            <span class="sm-btn-text">ABANDON HOPE</span>
            <div class="sm-btn-ember"></div>
          </button>
        </div>
        
        <div class="sm-quote">
          <p>"In the depths of darkness, only the worthy shall prevail..."</p>
        </div>
      </div>

      <!-- Settings Modal -->
      <div class="sm-settings" id="sm-settings-panel" aria-hidden="true">
        <div class="sm-settings-card" role="dialog" aria-modal="true" aria-labelledby="sm-settings-title">
          <h2 id="sm-settings-title">⚙ Settings</h2>

          <div class="sm-settings-group">
            <h3>Audio</h3>
            <label class="sm-field">
              <span>Music Volume</span>
              <input id="sm-vol-music" type="range" min="0" max="100" value="${this.settings.musicVolume}">
              <span class="sm-range-val" id="sm-vol-music-val">${this.settings.musicVolume}%</span>
            </label>
            <label class="sm-field">
              <span>SFX Volume</span>
              <input id="sm-vol-sfx" type="range" min="0" max="100" value="${this.settings.sfxVolume}">
              <span class="sm-range-val" id="sm-vol-sfx-val">${this.settings.sfxVolume}%</span>
            </label>
          </div>

          <div class="sm-settings-group">
            <h3>Graphics</h3>
            <label class="sm-field sm-field-row">
              <span>Fullscreen</span>
              <label class="sm-switch">
                <input id="sm-opt-fullscreen" type="checkbox" ${this.settings.fullscreen ? 'checked' : ''}>
                <span class="sm-slider"></span>
              </label>
            </label>

            <label class="sm-field sm-field-row">
              <span>Quality</span>
              <select id="sm-opt-quality">
                ${['Low','Medium','High','Ultra'].map(q => `<option value="${q}" ${this.settings.quality===q?'selected':''}>${q}</option>`).join('')}
              </select>
            </label>

            <label class="sm-field sm-field-row">
              <span>Shadows</span>
              <label class="sm-switch">
                <input id="sm-opt-shadows" type="checkbox" ${this.settings.shadows ? 'checked' : ''}>
                <span class="sm-slider"></span>
              </label>
            </label>

            <label class="sm-field sm-field-row">
              <span>Resolution</span>
              <select id="sm-opt-res">
                ${['Auto','3840x2160','2560x1440','1920x1080','1600x900','1280x720'].map(r => `<option value="${r}" ${this.settings.resolution===r?'selected':''}>${r}</option>`).join('')}
              </select>
            </label>
          </div>

          <div class="sm-settings-actions">
            <button id="sm-settings-apply" class="sm-btn sm-primary">
              <span class="sm-btn-icon">💾</span>
              <span class="sm-btn-text">Apply</span>
              <div class="sm-btn-ember"></div>
            </button>
            <button id="sm-settings-close" class="sm-btn">
              <span class="sm-btn-icon">✖</span>
              <span class="sm-btn-text">Close</span>
              <div class="sm-btn-ember"></div>
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('.sm-particles');
    this.ctx = this.canvas.getContext('2d');
    
    // Setup canvas
    this._boundResize = () => this._resizeCanvas();
    this._resizeCanvas();
    window.addEventListener('resize', this._boundResize);

    // Buttons
    this.btnStart = root.querySelector('#sm-start');
    this.btnContinue = root.querySelector('#sm-continue');
    this.btnSettings = root.querySelector('#sm-settings');
    this.btnQuit = root.querySelector('#sm-quit');

    // Settings elements
    this.settingsPanel = root.querySelector('#sm-settings-panel');
    this.settingsClose = root.querySelector('#sm-settings-close');
    this.settingsApply = root.querySelector('#sm-settings-apply');

    // Inputs
    this.inMusic = root.querySelector('#sm-vol-music');
    this.inMusicVal = root.querySelector('#sm-vol-music-val');
    this.inSfx = root.querySelector('#sm-vol-sfx');
    this.inSfxVal = root.querySelector('#sm-vol-sfx-val');

    this.inFullscreen = root.querySelector('#sm-opt-fullscreen');
    this.inQuality = root.querySelector('#sm-opt-quality');
    this.inShadows = root.querySelector('#sm-opt-shadows');
    this.inRes = root.querySelector('#sm-opt-res');

    // Events
    this.btnStart.addEventListener('click', () => { 
      this._playClickSound();
      this.onStart(); 
      this.show(false); 
    });
    
    this.btnContinue.addEventListener('click', () => {
      this._playClickSound();
      // Hook your "continue" logic here (e.g., load last save)
      console.log('[StartMenu] Continue clicked');
    });
    
    this.btnSettings.addEventListener('click', () => {
      this._playClickSound();
      this._toggleSettings(true);
    });
    
    this.settingsClose.addEventListener('click', () => {
      this._playClickSound();
      this._toggleSettings(false);
    });

    this.settingsApply.addEventListener('click', () => {
      this._playClickSound();
      this._applySettings();
    });

    // Live value display for ranges
    this.inMusic.addEventListener('input', () => {
      this.inMusicVal.textContent = `${this.inMusic.value}%`;
    });
    this.inSfx.addEventListener('input', () => {
      this.inSfxVal.textContent = `${this.inSfx.value}%`;
    });

    // ESC to close settings
    this._onKeyDown = (e) => {
      if (e.key === 'Escape' && this._settingsOpen()) this._toggleSettings(false);
    };
    window.addEventListener('keydown', this._onKeyDown);

    // Hover SFX
    [this.btnStart, this.btnContinue, this.btnSettings, this.btnQuit, this.settingsApply, this.settingsClose].forEach(btn => {
      btn.addEventListener('mouseenter', () => this._playHoverSound());
    });

    // If settings want fullscreen on start
    if (this.settings.fullscreen && !document.fullscreenElement) {
      // avoid auto-request without user gesture; we rely on next user click
      console.log('[StartMenu] Fullscreen preferred; will apply on next user gesture.');
    }

    this.show(true);
  }

  _settingsOpen() {
    return this.settingsPanel?.classList.contains('open');
  }

  _resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _startParticles() {
    if (this.animationId) return;
    // Initialize particles
    if (this.particles.length === 0) {
      for (let i = 0; i < 150; i++) {
        this.particles.push(this._createParticle());
      }
    }
    this._animateParticles();
  }

  _createParticle() {
    return {
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.5,
      vy: Math.random() * -0.8 - 0.2,
      life: Math.random() * 200 + 50,
      maxLife: 250,
      size: Math.random() * 3 + 1,
      type: Math.random() > 0.7 ? 'ember' : 'ash',
      opacity: Math.random() * 0.8 + 0.2
    };
  }

  _animateParticles() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      if (p.life <= 0 || p.y < -10) {
        this.particles[i] = this._createParticle();
        this.particles[i].y = window.innerHeight + 10;
        continue;
      }
      const alpha = (p.life / p.maxLife) * p.opacity;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      if (p.type === 'ember') {
        gradient.addColorStop(0, '#ff6b35');
        gradient.addColorStop(0.5, '#ff8c42');
      } else {
        gradient.addColorStop(0, '#888');
        gradient.addColorStop(0.5, '#555');
      }
      gradient.addColorStop(1, 'transparent');
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
    
    this.animationId = requestAnimationFrame(() => this._animateParticles());
  }

  _playHoverSound() {
    // Hook your audio system here
    // Example: audio.play('ui_hover', this.settings.sfxVolume/100);
    // For now:
    // console.log('🔥 Hover sound');
  }

  _playClickSound() {
    // Hook your audio system here
    // Example: audio.play('ui_click', this.settings.sfxVolume/100);
    // For now:
    // console.log('⚔️ Click sound');
  }

  _toggleSettings(open) {
    if (!this.settingsPanel) return;
    if (open) {
      this.settingsPanel.classList.add('open');
      this.settingsPanel.setAttribute('aria-hidden', 'false');
    } else {
      this.settingsPanel.classList.remove('open');
      this.settingsPanel.setAttribute('aria-hidden', 'true');
    }
  }

  async _applySettings() {
    // Read current UI
    const next = {
      musicVolume: Number(this.inMusic.value),
      sfxVolume: Number(this.inSfx.value),
      fullscreen: !!this.inFullscreen.checked,
      quality: this.inQuality.value,
      shadows: !!this.inShadows.checked,
      resolution: this.inRes.value
    };

    // Fullscreen handling
    try {
      if (next.fullscreen && !document.fullscreenElement) {
        // Requires user gesture; we're in a click handler, so ok
        await document.documentElement.requestFullscreen();
      } else if (!next.fullscreen && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen request failed:', e);
      // If denied, keep the toggle in sync with actual state
      next.fullscreen = !!document.fullscreenElement;
      this.inFullscreen.checked = next.fullscreen;
    }

    // Store + update
    this.settings = { ...this.settings, ...next };
    this._saveSettings();

    // Notify outside
    const detail = { settings: { ...this.settings } };
    this.root.dispatchEvent(new CustomEvent('settingsChanged', { detail }));
    this.onSettingsChange({ ...this.settings });

    // Close panel
    this._toggleSettings(false);
  }

  show(v) {
    if (v) {
      this.root.style.display = 'block';
      this.root.classList.add('sm-show');
      this.root.classList.remove('sm-hide');
      if (!this.animationId) {
        this._startParticles();
      }
    } else {
      this.root.classList.remove('sm-show');
      this.root.classList.add('sm-hide');
      setTimeout(() => {
        this.root.style.display = 'none';
      }, 800);
    }
  }

  destroy() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this._boundResize);
    window.removeEventListener('keydown', this._onKeyDown);
    this.root?.remove();
  }
}
