// /src/ui/startMenu.js — Soulslike-inspired start menu
export class StartMenu {
  constructor({ onStart = () => {}, onQuit = () => {} } = {}) {
    this.onStart = onStart;
    this.onQuit = onQuit;
    this.particles = [];
    this.animationId = null;
    this._build();
    this._startParticles();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'start-menu';
    root.innerHTML = `
      <canvas class="sm-particles"></canvas>
      <div class="sm-backdrop">
        <div class="sm-fog"></div>
        <div class="sm-fog sm-fog-2"></div>
      </div>
      <div class="sm-card">
        <div class="sm-flame-border"></div>
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
    `;
    
    document.body.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('.sm-particles');
    this.ctx = this.canvas.getContext('2d');
    
    // Setup canvas
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());

    // Event listeners
    this.btnStart = root.querySelector('#sm-start');
    this.btnContinue = root.querySelector('#sm-continue');
    this.btnSettings = root.querySelector('#sm-settings');
    this.btnQuit = root.querySelector('#sm-quit');

    this.btnStart.addEventListener('click', () => { 
      this._playClickSound();
      this.onStart(); 
      this.show(false); 
    });
    
    this.btnContinue.addEventListener('click', () => {
      this._playClickSound();
      // Implement continue logic
    });
    
    this.btnSettings.addEventListener('click', () => {
      this._playClickSound();
      // Implement settings logic
    });
    
    this.btnQuit.addEventListener('click', () => {
      this._playClickSound();
      this.onQuit();
    });

    // Add hover effects
    [this.btnStart, this.btnContinue, this.btnSettings, this.btnQuit].forEach(btn => {
      btn.addEventListener('mouseenter', () => this._playHoverSound());
    });

    this.show(true);
  }

  _resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  _startParticles() {
    // Initialize particles
    for (let i = 0; i < 150; i++) {
      this.particles.push(this._createParticle());
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
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      // Update position
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      
      // Reset particle if dead or off screen
      if (p.life <= 0 || p.y < -10) {
        this.particles[i] = this._createParticle();
        this.particles[i].y = window.innerHeight + 10;
        continue;
      }
      
      // Draw particle
      const alpha = (p.life / p.maxLife) * p.opacity;
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      
      if (p.type === 'ember') {
        // Draw ember (orange/red)
        const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, '#ff6b35');
        gradient.addColorStop(0.5, '#ff8c42');
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
      } else {
        // Draw ash (gray)
        const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, '#888');
        gradient.addColorStop(0.5, '#555');
        gradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = gradient;
      }
      
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
    
    this.animationId = requestAnimationFrame(() => this._animateParticles());
  }

  _playHoverSound() {
    // Simulate hover sound (you can replace with actual audio)
    console.log('🔥 Hover sound');
  }

  _playClickSound() {
    // Simulate click sound (you can replace with actual audio)
    console.log('⚔️ Click sound');
  }

  show(v) {
    if (v) {
      this.root.style.display = 'block';
      this.root.classList.add('sm-show');
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
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this._resizeCanvas);
    this.btnStart?.removeEventListener('click', this.onStart);
    this.btnQuit?.removeEventListener('click', this.onQuit);
    this.root?.remove();
  }
}