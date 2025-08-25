// ui/startMenu.js
export class StartMenu {
  constructor({ onStart, onQuit } = {}) {
    this.onStart = onStart || (() => {});
    this.onQuit = onQuit || (() => {});
    this._build();
  }

  _build() {
    this.root = document.createElement('div');
    this.root.id = 'start-menu';
    this.root.innerHTML = `
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
    document.body.appendChild(this.root);

    this.btnStart = this.root.querySelector('#sm-start');
    this.btnQuit = this.root.querySelector('#sm-quit');

    this.btnStart.addEventListener('click', () => { this.onStart(); this.show(false); });
    this.btnQuit.addEventListener('click', () => this.onQuit());

    this.show(true);
  }

  show(v) { this.root.style.display = v ? 'grid' : 'none'; }
}
