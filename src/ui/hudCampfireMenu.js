import { gameManager } from "../managers/gameManager";
let $root = null;
let escHandler = null;
let prevBodyOverflow = null;
let _wasPointerLocked = false;

function _canvasEl() {
  return document.getElementById('three-canvas') || document.querySelector('canvas');
}
function pickStat(obj, keys, fallback = 0) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === 'number') return v;
  }
  return fallback;
}
function readStats(stats) {
  return {
    points:   pickStat(stats, ['levelPoints','points','availablePoints'], 0),
    hpMax:    pickStat(stats, ['hpMax','maxHP','HPMax','hp_max'], 100),
    hp:       pickStat(stats, ['hp','currentHP','HP'], undefined),
    staminaMax: pickStat(stats, ['staminaMax','maxStamina','STAmax','stamina_max'], 100),
    stamina:  pickStat(stats, ['stamina','currentStamina','STA'], undefined),
    manaMax:  pickStat(stats, ['manaMax','maxMana','MPMax','mana_max'], 100),
    mana:     pickStat(stats, ['mana','currentMana','MP'], undefined),
  };
}

function ensureDom() {
  if ($root) return $root;

  $root = document.createElement('div');
  $root.className = 'campfire-menu';
  $root.innerHTML = `
    <div class="cf-backdrop"></div>
    <div class="cf-fog"></div>
    <div class="cf-fog cf-fog-2"></div>

    <div class="campfire-card" role="dialog" aria-modal="true" aria-label="Campfire Rest">
      <div class="cf-title-wrap">
        <h2 class="campfire-title">🔥 Campfire Rest</h2>
        <p class="campfire-sub">Spend points to grow stronger.</p>
      </div>

      <div class="cf-stats">
        <div class="cf-row" data-key="hp">
          <div class="cf-row-left">
            <div class="cf-stat-name">HP</div>
            <div class="cf-bar">
              <div class="cf-bar-fill" id="cf-bar-hp" style="width:0%"></div>
              <div class="cf-bar-text" id="cf-text-hp">—</div>
            </div>
          </div>
          <div class="cf-row-right">
            <button class="cf-btn" id="cf-btn-hp">
              <span class="cf-btn-icon">➕</span>
              <span class="cf-btn-text">Increase</span>
              <div class="cf-btn-ember"></div>
            </button>
          </div>
        </div>

        <div class="cf-row" data-key="stamina">
          <div class="cf-row-left">
            <div class="cf-stat-name">Stamina</div>
            <div class="cf-bar">
              <div class="cf-bar-fill" id="cf-bar-stamina" style="width:0%"></div>
              <div class="cf-bar-text" id="cf-text-stamina">—</div>
            </div>
          </div>
          <div class="cf-row-right">
            <button class="cf-btn" id="cf-btn-stamina">
              <span class="cf-btn-icon">➕</span>
              <span class="cf-btn-text">Increase</span>
              <div class="cf-btn-ember"></div>
            </button>
          </div>
        </div>

        <div class="cf-row" data-key="mana">
          <div class="cf-row-left">
            <div class="cf-stat-name">Mana</div>
            <div class="cf-bar">
              <div class="cf-bar-fill" id="cf-bar-mana" style="width:0%"></div>
              <div class="cf-bar-text" id="cf-text-mana">—</div>
            </div>
          </div>
          <div class="cf-row-right">
            <button class="cf-btn" id="cf-btn-mana">
              <span class="cf-btn-icon">➕</span>
              <span class="cf-btn-text">Increase</span>
              <div class="cf-btn-ember"></div>
            </button>
          </div>
        </div>
      </div>

      <div class="cf-footer">
        <p class="campfire-points" id="cf-points">Points left: —</p>
        <div class="cf-actions">
          <button class="cf-btn ghost" id="cf-close">
            <span class="cf-btn-icon">✖</span>
            <span class="cf-btn-text">Close</span>
          </button>
          <div class="cf-hints">
            <span class="hint">Close <span class="kbd">Esc</span></span>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild($root);

  // Click sfondo chiude
  $root.addEventListener('mousedown', (e) => {
    const card = $root.querySelector('.campfire-card');
    if (!card.contains(e.target)) hideCampfireMenu();
  });

  return $root;
}
/**
 * @param {StatsSystem} stats  
 * @param {{onClose?:()=>void, onUpgrade?: (key:string)=>void}} [opt]
 */
export function showCampfireMenu(stats, opt = {}) {
  const root = ensureDom();

  // Pointer lock: ricordiamo e rilasciamo
  _wasPointerLocked = (document.pointerLockElement === _canvasEl());
  if (document.exitPointerLock) {
    try { document.exitPointerLock(); } catch {}
  }

  // Blocca scroll pagina
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Hook controlli
  const btnHP = root.querySelector('#cf-btn-hp');
  const btnST = root.querySelector('#cf-btn-stamina');
  const btnMN = root.querySelector('#cf-btn-mana');
  const btnClose = root.querySelector('#cf-close');
  const $points = root.querySelector('#cf-points');

  const $barHP = root.querySelector('#cf-bar-hp');
  const $barST = root.querySelector('#cf-bar-stamina');
  const $barMN = root.querySelector('#cf-bar-mana');
  const $txtHP = root.querySelector('#cf-text-hp');
  const $txtST = root.querySelector('#cf-text-stamina');
  const $txtMN = root.querySelector('#cf-text-mana');

  const render = () => {
    const s = readStats(stats);

    // Points + disable
    $points.textContent = `Points left: ${s.points}`;
    const noPts = s.points <= 0;
    btnHP.disabled = noPts;
    btnST.disabled = noPts;
    btnMN.disabled = noPts;

    // Bars
    const hpNow = (s.hp ?? s.hpMax);
    const stNow = (s.stamina ?? s.staminaMax);
    const mnNow = (s.mana ?? s.manaMax);

    const pct = (val, max) => Math.max(0, Math.min(100, (max>0? (val/max)*100 : 0)));

    $barHP.style.width = `${pct(hpNow, s.hpMax)}%`;
    $barST.style.width = `${pct(stNow, s.staminaMax)}%`;
    $barMN.style.width = `${pct(mnNow, s.manaMax)}%`;

    $txtHP.textContent = `${hpNow} / ${s.hpMax}`;
    $txtST.textContent = `${stNow} / ${s.staminaMax}`;
    $txtMN.textContent = `${mnNow} / ${s.manaMax}`;
  };

  const blip = (key) => {
    const row = root.querySelector(`.cf-row[data-key="${key}"]`);
    if (!row) return;
    row.classList.remove('blip');
    // force reflow
    void row.offsetWidth;
    row.classList.add('blip');
  };

  btnHP.onclick = () => {
    stats?.upgrade?.('hp');
    opt?.onUpgrade?.('hp');
    render(); blip('hp');
    root.dispatchEvent(new CustomEvent('campfireUpgrade', { detail: { key: 'hp' }}));
  };
  btnST.onclick = () => {
    stats?.upgrade?.('stamina');
    opt?.onUpgrade?.('stamina');
    render(); blip('stamina');
    root.dispatchEvent(new CustomEvent('campfireUpgrade', { detail: { key: 'stamina' }}));
  };
  btnMN.onclick = () => {
    stats?.upgrade?.('mana');
    opt?.onUpgrade?.('mana');
    render(); blip('mana');
    root.dispatchEvent(new CustomEvent('campfireUpgrade', { detail: { key: 'mana' }}));
  };

  btnClose.onclick = () => { hideCampfireMenu(); opt?.onClose?.(); };

  // ESC per chiudere
  escHandler = (e) => {
    if (e.key === 'Escape') {
      hideCampfireMenu();
      opt?.onClose?.();
    }
  };
  window.addEventListener('keydown', escHandler, { passive: true });

  // Mostra + primo render
  render();
  root.classList.add('is-open');
  root.querySelector('.campfire-card')?.classList.add('show');
  gameManager.campfiremenu = true;
}

export function hideCampfireMenu() {
  if (!$root) return;

  $root.classList.remove('is-open');
  $root.querySelector('.campfire-card')?.classList.remove('show');
  gameManager.campfiremenu = false;

  // Ripristina scroll
  if (prevBodyOverflow !== null) {
    document.body.style.overflow = prevBodyOverflow;
    prevBodyOverflow = null;
  }

  // Rimuovi ESC handler
  if (escHandler) {
    window.removeEventListener('keydown', escHandler);
    escHandler = null;
  }

  // Ripristina pointer lock se serviva
  if (_wasPointerLocked) _canvasEl()?.requestPointerLock?.();
}

export function isCampfireMenuOpen() {
  return !!$root && $root.classList.contains('is-open');
}
