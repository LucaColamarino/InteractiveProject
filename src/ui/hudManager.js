// /src/ui/hudManager.js – Minimap North-Up con freccia heading
import * as THREE from 'three';

function $(id) { return /** @type {HTMLElement|null} */(document.getElementById(id)); }

const els = {
  mmEnemies: null, mmTime: null, mmCoords: null,
  minimapGrid: null, minimapPlayer: null, compassEl: null,
  notificationBar: null, promptBox: null, promptKey: null, promptText: null,
};

const radar = {
  range: 150,                // raggio mondo rappresentato dal bordo del radar
  dotMap: new Map(),         // enemyObj -> DOM dot (iterabile per cleanup)
  headingEl: null,           // freccia che indica la direzione del giocatore
  northBadge: null,          // etichetta "N" in alto
  inited: false,
};

function toCardinal(deg) {
  const dirs = ['N','NE','E','SE','S','SW','W','NW','N'];
  return dirs[Math.round(((-deg % 360)+360)%360 / 45)];
}

function initMinimap() {
  els.minimapGrid   = document.querySelector('.minimap-grid') || document.querySelector('#minimap-grid');
  els.minimapPlayer = document.querySelector('.minimap-player') || document.querySelector('#minimap-player');
  els.compassEl     = document.getElementById('compass-dir') || document.querySelector('.minimap-wrap .compass');
  if (els.compassEl) els.compassEl.textContent = 'N'; // fisso

  if (!els.minimapGrid) {
    console.warn('[HUD] Nessuna .minimap-grid trovata. Radar disattivo.');
    return;
  }

  // pulisci marker demo hardcoded
  els.minimapGrid.querySelectorAll('.minimap-enemy').forEach(n => n.remove());
  // freccia dichiarata in HTML/CSS
  radar.headingEl = document.querySelector('.minimap-heading');
  if (!radar.headingEl) {
    console.warn('[HUD] .minimap-heading mancante: la freccia non ruoterà.');
  }

  if (els.compassEl) els.compassEl.textContent = 'N';
  radar.inited = true;
  console.log('[HUD] Minimap pronta (North-Up + Heading)');
}

function upsertEnemyDot(enemy) {
  let dot = radar.dotMap.get(enemy);
  if (!dot) {
    dot = document.createElement('div');
    dot.className = 'minimap-enemy';
    Object.assign(dot.style, {
      position: 'absolute',
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: 'rgba(255,64,64,0.95)',
      boxShadow: '0 0 4px rgba(0,0,0,0.6)',
      transform: 'translate(-50%, -50%)',
      zIndex: '1',
      pointerEvents: 'none',
    });
    els.minimapGrid.appendChild(dot);
    radar.dotMap.set(enemy, dot);
  }
  return dot;
}

function updateRadar(player, enemies, camera) {
  if (!radar.inited || !els.minimapGrid || !player?.model || !camera) return;

  const rect = els.minimapGrid.getBoundingClientRect();
  const w = rect.width  || 120;
  const h = rect.height || 120;
  const halfW = w * 0.5, halfH = h * 0.5;
  const maxRadius = Math.min(halfW, halfH);

  // Yaw della camera: 0° = Nord (Z+). Serve per ruotare la freccia del player.
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir);
  const yaw = Math.atan2(viewDir.x, viewDir.z);
  const deg = THREE.MathUtils.radToDeg(yaw);

  const px = player.model.position.x;
  const pz = player.model.position.z;

  const stillThere = new Set();

  // --- ENEMY DOTS (mappa North-Up: N = top, E = destra) ---
  for (const enemy of (enemies || [])) {
    if (!enemy?.alive || !enemy?.model) continue;
    const ex = enemy.model.position.x;
    const ez = enemy.model.position.z;

    // delta in mondo
    const dx = ex - px;   // +dx = Est
    const dz = ez - pz;   // +dz = Nord

    // mondo -> pixel radar (N su = -dz)
    let xPix =  (-dx / radar.range) * maxRadius;   // destra +
    let yPix =  (-dz / radar.range) * maxRadius;   // alto  +

    // clamp al bordo del radar
    const len = Math.hypot(xPix, yPix);
    if (len > maxRadius) {
      const k = maxRadius / len;
      xPix *= k; yPix *= k;
    }

    // posiziona nel DOM (origine centro 50/50)
    const leftPct = 50 + (xPix / w) * 100;
    const topPct  = 50 + (yPix / h) * 100;

    const dot = upsertEnemyDot(enemy);
    dot.style.left = `${leftPct}%`;
    dot.style.top  = `${topPct}%`;

    // leggero fade con distanza (solo estetica)
    const fade = Math.max(0.35, 1 - (len / maxRadius) * 0.6);
    dot.style.opacity = `${fade}`;

    stillThere.add(dot);
  }

  // cleanup dots orfani
  for (const [enemy, dot] of radar.dotMap.entries()) {
    if (!stillThere.has(dot)) {
      dot.remove();
      radar.dotMap.delete(enemy);
    }
  }

  // --- HEADING ARROW (freccia del player) ---
  if (radar.headingEl) {
    // freccia punta sempre dove guarda la camera; base centrata
    radar.headingEl.style.transform = `translate(-50%, -100%) rotate(${-deg}deg)`;
  }


}

export const hudManager = {
  init() {
    // prompt/notify
    els.notificationBar = $('notifications');
    els.promptBox = $('interaction-prompts');
    els.promptKey = $('interaction-key');
    els.promptText = $('interaction-text');

    // minimap pills
    els.mmEnemies = $('mm-enemies');
    els.mmTime    = $('mm-time');
    els.mmCoords  = $('mm-coords');

    initMinimap();
    radar.range = 150; // zoom della minimappa (più basso = più zoom)

    console.log('[HUD] init ok');
  },

  /**
   * @param {*} player
   * @param {*} controller
   * @param {THREE.Camera} camera
   * @param {Array=} enemies
   */
  update(player, controller, camera, enemies = []) {
    // coordinate
    if (els.mmCoords && player?.model) {
      const p = player.model.position;
      els.mmCoords.textContent = `📍 ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`;
    }

    // nemici entro 80u
    if (els.mmEnemies && player?.model && enemies?.length) {
      const pos = player.model.position;
      const near = enemies.filter(e => e?.model?.position?.distanceTo?.(pos) < 80).length;
      els.mmEnemies.textContent = `🎯 ${near}`;
    }

    // “orologio” fittizio
    if (els.mmTime) {
      const now = performance.now() / 1000;
      const minutes = Math.floor(now % 60).toString().padStart(2, '0');
      const hours = (6 + Math.floor((now / 10) % 18)).toString().padStart(2, '0');
      els.mmTime.textContent = `⏰ ${hours}:${minutes}`;
    }

    // radar
    updateRadar(player, enemies, camera);
  },

  showNotification(text) {
    if (!els.notificationBar) return;
    const div = document.createElement('div');
    div.className = 'notification';
    div.textContent = text;
    els.notificationBar.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  },

  showPrompt(key = 'E', text = 'Interact') {
    if (!els.promptBox) return;
    if (els.promptKey)  els.promptKey.textContent = key.toUpperCase();
    if (els.promptText) els.promptText.textContent = text;
    els.promptBox.hidden = false;
  },

  hidePrompt() {
    if (!els.promptBox) return;
    els.promptBox.hidden = true;
  },
};
