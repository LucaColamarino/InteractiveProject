// src/ui/hudCampfireMenu.js
// Overlay stile Soulslike per potenziare HP / Stamina / Mana al falò

import { gameManager } from "../managers/gameManager";

let $root = null;
let escHandler = null;
let prevBodyOverflow = null;

/**
 * Crea (se manca) la struttura DOM del menù.
 * Ritorna l'elemento radice .campfire-menu
 */
function ensureDom() {
  if (!$root) {
    $root = document.createElement('div');
    $root.className = 'campfire-menu';
    $root.innerHTML = `
      <div class="campfire-card" role="dialog" aria-modal="true" aria-label="Campfire Rest">
        <h2 class="campfire-title">Campfire Rest</h2>
        <p>Spend points to grow stronger:</p>

        <div class="campfire-row">
          <button class="campfire-btn" id="cf-btn-hp">+HP</button>
          <button class="campfire-btn" id="cf-btn-stamina">+Stamina</button>
          <button class="campfire-btn" id="cf-btn-mana">+Mana</button>
        </div>

        <p class="campfire-points" id="cf-points">Points left: —</p>
        <div class="campfire-hint">Premi <b>Esc</b> per chiudere</div>
      </div>
    `;
    document.body.appendChild($root);

    // Chiudi cliccando lo sfondo (non la card)
    $root.addEventListener('mousedown', (e) => {
      if (e.target === $root) hideCampfireMenu();
    });
    // Ferma la propagazione di click dentro la card
    $root.querySelector('.campfire-card').addEventListener('mousedown', (e) => e.stopPropagation());
  }
  return $root;
}

/**
 * Mostra il menù e collega i pulsanti allo StatsSystem del player
 * @param {StatsSystem} stats  gameManager.controller.player.stats
 * @param {object} [opt]
 * @param {()=>void} [opt.onClose] callback alla chiusura
 */
export function showCampfireMenu(stats, opt = {}) {
  const root = ensureDom();

  // Esci dal pointer lock: il canvas non ruba più input
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch {}
  }

  // Blocca lo scroll della pagina mentre il menu è aperto
  prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  // Wiring pulsanti
  const btnHP = root.querySelector('#cf-btn-hp');
  const btnST = root.querySelector('#cf-btn-stamina');
  const btnMN = root.querySelector('#cf-btn-mana');
  const $points = root.querySelector('#cf-points');

  const updatePoints = () => {
    const left = stats?.levelPoints ?? 0;
    $points.textContent = `Points left: ${left}`;
    // disabilita quando finiti
    const disable = left <= 0;
    btnHP.disabled = disable;
    btnST.disabled = disable;
    btnMN.disabled = disable;
  };

  btnHP.onclick = () => { stats?.upgrade?.('hp'); updatePoints(); };
  btnST.onclick = () => { stats?.upgrade?.('stamina'); updatePoints(); };
  btnMN.onclick = () => { stats?.upgrade?.('mana'); updatePoints(); };

  updatePoints();

  // ESC per chiudere
  escHandler = (e) => {
    if (e.key === 'Escape') {
      hideCampfireMenu();
      opt?.onClose?.();
    }
  };
  window.addEventListener('keydown', escHandler, { passive: true });

  // Mostra
  root.classList.add('is-open');
  gameManager.campfiremenu = true;
}

/**
 * Nasconde il menù e ripristina lo stato UI
 */
export function hideCampfireMenu() {
  if (!$root) return;
  $root.classList.remove('is-open');
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
}

/**
 * True se il menù è attualmente visibile
 */
export function isCampfireMenuOpen() {
  return !!$root && $root.classList.contains('is-open');
}
