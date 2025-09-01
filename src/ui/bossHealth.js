class BossHealthUI {
  constructor() {
    this.el = null;
    this.nameEl = null;
    this.fillEl = null;
    this.hpTextEl = null;
    this._activeId = null;
    this._max = 1;
    this._cur = 1;
    this._inited = false;
    this._onEngage = this._onEngage.bind(this);
    this._onUpdate = this._onUpdate.bind(this);
    this._onDisengage = this._onDisengage.bind(this);
  }
  init() {
    if (this._inited) return;
    this._inited = true;
    const styleId = 'bossbar-style';
    if (!document.getElementById(styleId)) {
      const st = document.createElement('style');
      st.id = styleId;
      st.textContent = `
      :root { --boss-gold:#d4af37; --boss-amber:#ffcc66; --boss-bg:#0b0b0b; --boss-red:#a31919; --boss-red-dim:#6e1111; }
      .bossbar-wrap {
        position: fixed; top: 32px; left: 50%; transform: translateX(-50%);
        width: min(820px, 94vw); z-index: 15000;
        opacity: 0; pointer-events: none; transition: opacity .35s ease, transform .35s ease;
      }
      .bossbar-wrap.active { opacity: 1; transform: translateX(-50%) translateY(0); }
      .bossbar-card {
        position: relative; padding: 10px 14px 12px 14px; border: 2px solid var(--boss-gold);
        border-radius: 12px; background: rgba(10,10,10,.85);
        box-shadow: 0 10px 40px rgba(0,0,0,.5), inset 0 0 30px rgba(212,175,55,.08);
        backdrop-filter: blur(2px);
      }
      .bossbar-name {
        margin: 0 0 8px 0; text-align: center; letter-spacing: 0.14em;
        font-family: "Cinzel","Trajan Pro",serif; color: #f5e9c9;
        text-shadow: 0 0 10px rgba(212,175,55,.35);
        font-size: clamp(18px, 3.4vw, 26px);
      }
      .bossbar-bar {
        position: relative; width: 100%; height: 18px; border: 1px solid var(--boss-gold);
        border-radius: 10px; overflow: hidden; background: linear-gradient(180deg,#1a1a1a,#0c0c0c);
      }
      .bossbar-fill {
        position: absolute; inset: 0; width: 100%; height: 100%;
        background: linear-gradient(180deg, var(--boss-red), var(--boss-red-dim));
        box-shadow: inset 0 0 12px rgba(0,0,0,.6);
        transform-origin: left center; transform: scaleX(1);
        transition: transform .25s ease;
      }
      .bossbar-hptext {
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        font-family: "Orbitron", monospace; color: #f1d9a8; font-size: 0.85rem; opacity: .9;
        text-shadow: 0 0 8px rgba(212,175,55,.25);
      }
      `;
      document.head.appendChild(st);
    }

    this.el = document.createElement('div');
    this.el.className = 'bossbar-wrap';
    this.el.style.transform = 'translateX(-50%) translateY(-6px)';
    const card = document.createElement('div');
    card.className = 'bossbar-card';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'bossbar-name';
    this.nameEl.textContent = 'AZHARYX, ASH VORTEX';
    const bar = document.createElement('div');
    bar.className = 'bossbar-bar';
    this.fillEl = document.createElement('div');
    this.fillEl.className = 'bossbar-fill';
    this.hpTextEl = document.createElement('div');
    this.hpTextEl.className = 'bossbar-hptext';
    this.hpTextEl.textContent = '— / —';
    bar.appendChild(this.fillEl);
    bar.appendChild(this.hpTextEl);
    card.appendChild(this.nameEl);
    card.appendChild(bar);
    this.el.appendChild(card);
    document.body.appendChild(this.el);
    window.addEventListener('boss:engage', this._onEngage);
    window.addEventListener('boss:update', this._onUpdate);
    window.addEventListener('boss:disengage', this._onDisengage);
  }
  _onEngage(e) {
    const { id, name, max, cur } = e.detail || {};
    this._activeId = id ?? 'boss';
    this._max = Math.max(1, Number(max ?? 1));
    this._cur = Math.max(0, Math.min(this._max, Number(cur ?? this._max)));
    if (this.nameEl && name) this.nameEl.textContent = name;
    this._render();
    this.show();
  }
  _onUpdate(e) {
    const { id, cur } = e.detail || {};
    if (!this._activeId || id !== this._activeId) return;
    this._cur = Math.max(0, Math.min(this._max, Number(cur ?? this._cur)));
    this._render();
  }
  _onDisengage(e) {
    const { id } = e.detail || {};
    if (!this._activeId || (id && id !== this._activeId)) return;
    this.hide();
    this._activeId = null;
  }
  _render() {
    const ratio = this._max > 0 ? (this._cur / this._max) : 0;
    if (this.fillEl) this.fillEl.style.transform = `scaleX(${ratio})`;
    if (this.hpTextEl) this.hpTextEl.textContent = `${Math.ceil(this._cur)} / ${Math.ceil(this._max)}`;
  }
  show()  { this.el?.classList.add('active'); }
  hide()  { this.el?.classList.remove('active'); }
}
export const bossHealth = new BossHealthUI();
