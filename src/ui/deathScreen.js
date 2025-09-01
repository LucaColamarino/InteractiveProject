import { gameManager } from '../managers/gameManager.js';
import './css/deathscreen.css';

class DeathScreen {
  constructor() {
    this.el = null;
    this.titleEl = null;
    this.causeEl = null;
    this.audio = null;
    this.callbacks = { onRespawn: null, onLoad: null, onQuit: null };
    this._onKey = this._onKey.bind(this);
    this._onClick = this._onClick.bind(this);
  }
  mount() {
    if (this.el) return;
    const wrap = document.createElement('div');
    wrap.id = 'death-screen';
    wrap.className = 'ds hidden';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `
      <div class="ds-bg"></div>
      <div class="ds-card">
        <h1 class="ds-title">YOU DIED</h1>
        <p class="ds-sub" id="ds-cause"></p>
        <div class="ds-actions">

          <button class="ds-btn ghost" data-action="quit" title="Q">Quit</button>
        </div>
      </div>
    `;
    //          <button class="ds-btn" data-action="respawn" title="E">Respawn (E)</button>
    //      <button class="ds-btn" data-action="load" title="L">Carica ultimo salvataggio (L)</button>
    document.body.appendChild(wrap);

    this.el = wrap;
    this.titleEl = wrap.querySelector('.ds-title');
    this.causeEl = wrap.querySelector('#ds-cause');

    this.el.addEventListener('click', this._onClick);
  }
  /**
   * @param {{onRespawn?:Function,onLoad?:Function,onQuit?:Function}} callbacks
   */
  init(callbacks = {}) {
    this.mount();
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  /**
   * @param {{cause?:string, playSound?:boolean}} opts
   */
  show(opts = {}) {
    const { cause = '', playSound = true } = opts;
    this.mount();
    if (this.causeEl) this.causeEl.textContent = cause;
    if (gameManager) gameManager.isPaused = true;
    this.el.classList.remove('hidden');
    this.el.setAttribute('aria-hidden', 'false');
    document.addEventListener('keydown', this._onKey);
    document.body.classList.add('deathscreen-open');
    if (playSound) this._playSound();
  }
  hide() {
    if (!this.el) return;
    this.el.classList.add('hidden');
    this.el.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this._onKey);
    document.body.classList.remove('deathscreen-open');
  }
  _onKey(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'e' || k === 'enter') { e.preventDefault(); this._do('respawn'); }
    else if (k === 'l') { e.preventDefault(); this._do('load'); }
    else if (k === 'q') { e.preventDefault(); this._do('quit'); }
  }
  _onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    this._do(btn.getAttribute('data-action'));
  }
  _do(action) {
    if (action === 'respawn' && typeof this.callbacks.onRespawn === 'function') {
      this.callbacks.onRespawn();
      return;
    }
    if (action === 'load' && typeof this.callbacks.onLoad === 'function') {
      this.callbacks.onLoad();
      return;
    }
    if (action === 'quit' && typeof this.callbacks.onQuit === 'function') {
      this.callbacks.onQuit();
      return;
    }
  }
  _playSound() {
    try {
      if (!this.audio) {
        this.audio = new Audio('/assets/audio/you_died.ogg');
        this.audio.preload = 'auto';
        this.audio.volume = 0.65;
      }
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
    } catch (_) {}
  }
}
export const deathScreen = new DeathScreen();
