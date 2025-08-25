// /src/ui/startMenu.js – Start menu semplice con possibilità di animare show/hide
export class StartMenu {
  constructor({ onStart = () => {}, onQuit = () => {} } = {}) {
    this.onStart = onStart;
    this.onQuit = onQuit;
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'start-menu';
    root.innerHTML = `
      <div class="sm-backdrop"></div>
      <div class="sm-card">
        <h1 class="sm-title">My Game</h1>
        <div class="sm-section">
          <button id="sm-start" class="sm-btn sm-primary">▶ Start Game</button>
        </div>
        <div class="sm-section">
          <button id="sm-quit" class="sm-btn sm-danger">Quit</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;

    this.btnStart = root.querySelector('#sm-start');
    this.btnQuit  = root.querySelector('#sm-quit');

    this.btnStart.addEventListener('click', () => { this.onStart(); this.show(false); });
    this.btnQuit.addEventListener('click', () => this.onQuit());

    this.show(true);
  }

  show(v) {
    // Se vuoi animare: aggiungi/togli classe, poi display
    this.root.style.display = v ? 'grid' : 'none';
  }

  destroy() {
    this.btnStart?.removeEventListener('click', this.onStart);
    this.btnQuit?.removeEventListener('click', this.onQuit);
    this.root?.remove();
  }
}
