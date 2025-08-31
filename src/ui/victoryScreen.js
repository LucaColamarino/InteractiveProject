// ui/victoryScreen.js — Soulslike Victory Screen
import { gameManager } from '../managers/gameManager.js';

class VictoryScreen {
  constructor() {
    this.el = null;
    this.titleEl = null;
    this.subEl = null;
    this._onKey = this._onKey.bind(this);
    this._inited = false;
  }

  init(opts = {}) {
    if (this._inited) return;
    this._inited = true;

    this.onContinue = opts.onContinue || null;   // es. “Ricomincia dal checkpoint”
    this.onQuit     = opts.onQuit     || null;   // es. “Torna al menu iniziale”
    this._ensureDom();
  }

  _ensureDom() {
    if (this.el) return;

    // Stili (simile alla death screen, palette oro/ambra)
    const styleId = 'vs-style';
    if (!document.getElementById(styleId)) {
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = `
      :root { --vs-gold:#d4af37; --vs-amber:#ffcc66; --vs-bg:#0a0a0a; --vs-text:#f5e9c9; }
      .vs { position:fixed; inset:0; z-index:20000; display:none; align-items:center; justify-content:center; }
      .vs[aria-hidden="false"] { display:flex; }
      .vs.hidden { display:none; }
      .vs-bg { position:absolute; inset:0; background:
        radial-gradient(ellipse 80% 60% at 50% 100%, rgba(255,220,120,.12) 0%, transparent 50%),
        linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%);
        filter: blur(0px);
        opacity: 0; transition: opacity .45s ease;
      }
      .vs-card {
        position:relative;
        width: min(720px, 92vw);
        border: 2px solid var(--vs-gold);
        border-radius: 16px;
        padding: 28px 24px;
        background: rgba(10,10,10,.85);
        box-shadow: 0 10px 40px rgba(0,0,0,.6), inset 0 0 40px rgba(212,175,55,.08);
        transform: translateY(12px);
        opacity: 0;
        transition: opacity .45s ease, transform .45s ease;
      }
      .vs.active .vs-bg { opacity: 1; }
      .vs.active .vs-card { opacity: 1; transform: translateY(0); }
      .vs-title {
        margin:0 0 8px 0;
        font-family: "Cinzel", "Trajan Pro", serif;
        letter-spacing: 0.2em;
        text-align:center;
        font-size: clamp(36px, 6vw, 64px);
        color: var(--vs-text);
        text-shadow: 0 0 12px rgba(212,175,55,.45), 0 0 40px rgba(255,220,120,.25);
      }
      .vs-title::after{
        content:"";
        display:block; margin:14px auto 0 auto; width:160px; height:2px;
        background: linear-gradient(90deg, transparent, var(--vs-gold), transparent);
        opacity:.8;
      }
      .vs-sub {
        margin: 10px auto 16px auto;
        max-width: 52ch;
        text-align:center;
        color: var(--vs-amber);
        font-family: "Orbitron", monospace;
        font-size: 1.05rem;
        line-height:1.6;
        opacity: .95;
      }
      .vs-btns{
        display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-top:8px;
      }
      .vs-btn{
        padding:10px 16px; border:1px solid var(--vs-gold); color:var(--vs-text);
        background: rgba(15,15,15,.6);
        border-radius: 10px; cursor:pointer; font-family:"Orbitron", monospace;
        transition: transform .12s ease, box-shadow .2s ease, background .2s ease;
      }
      .vs-btn:hover{
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(212,175,55,.25), inset 0 0 24px rgba(212,175,55,.08);
        background: rgba(25,25,25,.75);
      }
      body.victory-open { overflow:hidden; }
      `;
      document.head.appendChild(st);
    }

    // DOM
    this.el = document.createElement('div');
    this.el.id = 'victory-screen';
    this.el.className = 'vs hidden';
    this.el.setAttribute('aria-hidden', 'true');

    const bg = document.createElement('div');
    bg.className = 'vs-bg';

    const card = document.createElement('div');
    card.className = 'vs-card';

    this.titleEl = document.createElement('h1');
    this.titleEl.className = 'vs-title';
    this.titleEl.textContent = 'YOU ESCAPED';

    this.subEl = document.createElement('p');
    this.subEl.className = 'vs-sub';
    this.subEl.textContent = 'Hai attraversato il portale. Il tuo viaggio continua altrove…';

    const btns = document.createElement('div');
    btns.className = 'vs-btns';

    const continueBtn = document.createElement('button');
    continueBtn.className = 'vs-btn';
    continueBtn.textContent = 'Continua';
    continueBtn.addEventListener('click', () => this._continue());

    const quitBtn = document.createElement('button');
    quitBtn.className = 'vs-btn';
    quitBtn.textContent = 'Torna al menu';
    quitBtn.addEventListener('click', () => this._quit());

    btns.appendChild(continueBtn);
    btns.appendChild(quitBtn);

    card.appendChild(this.titleEl);
    card.appendChild(this.subEl);
    card.appendChild(btns);

    this.el.appendChild(bg);
    this.el.appendChild(card);
    document.body.appendChild(this.el);
  }

show({ title = 'YOU ESCAPED', sub = 'Hai attraversato il portale. Il tuo viaggio continua altrove…', playSound = true } = {}) {
  this._ensureDom();
  if (this.titleEl) this.titleEl.textContent = title;
  if (this.subEl) this.subEl.textContent = sub;

  if (gameManager) gameManager.isPaused = true;

  // 🔒 forza la visibilità a prescindere dal CSS globale
  this.el.style.display = 'flex';
  this.el.classList.remove('hidden');
  this.el.classList.add('active');
  this.el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('victory-open');

  document.addEventListener('keydown', this._onKey);
  if (playSound) this._playSound();
}

hide() {
  if (!this.el) return;

  // 🔓 forza l’occultamento a prescindere dal CSS globale
  this.el.classList.remove('active');
  this.el.classList.add('hidden');
  this.el.setAttribute('aria-hidden', 'true');
  this.el.style.display = 'none';

  document.body.classList.remove('victory-open');
  document.removeEventListener('keydown', this._onKey);
}


  _playSound() {
    // opzionale: breve shimmer/choir – qui lasciamo il placeholder
    // const audio = new Audio('/audio/victory.ogg'); audio.volume = 0.6; audio.play().catch(()=>{});
  }

  _onKey(e) {
    // ENTER/SPACE → continua, ESC → menu
    if (e.code === 'Enter' || e.code === 'Space') {
      this._continue();
    } else if (e.code === 'Escape') {
      this._quit();
    }
  }

  _continue() {
    this.hide();
    // Riprendi gioco oppure respawn/teletrasporto a nuova area
    if (typeof this.onContinue === 'function') {
      this.onContinue();
    } else if (gameManager) {
      // default: riprende
      gameManager.isPaused = false;
    }
  }

  _quit() {
    this.hide();
    if (typeof this.onQuit === 'function') {
      this.onQuit();
    } else {
      // default: torna al menu iniziale (evento o redirect)
      window.dispatchEvent(new Event('game:quit'));
    }
  }
}

export const victoryScreen = new VictoryScreen();
