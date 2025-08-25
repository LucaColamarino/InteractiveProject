// /src/ui/hudManager.js – HUD ottimizzato con animazioni coerenti e meno reflow
import * as THREE from 'three';

// ---------- Utils DOM ----------
const $  = (id) => /** @type {HTMLElement|null} */(document.getElementById(id));
const $$ = (sel) => /** @type {NodeList} */(document.querySelectorAll(sel));

function withBaseTransform(el) {
  if (!el) return;
  if (!el.dataset.baseTransform) el.dataset.baseTransform = el.style.transform || '';
}
function setTransform(el, extra = '') {
  if (!el) return;
  withBaseTransform(el);
  el.style.transform = `${el.dataset.baseTransform || ''} ${extra}`.trim();
}

// ---------- Math utils ----------
const M = {
  clamp(v, a, b) { return Math.min(Math.max(v, a), b); },
  lerp(a, b, t) { return a + (b - a) * t; },
  toDeg(rad) { return rad * 180 / Math.PI; },
};

// ---------- Animations (coese) ----------
const EASING = {
  linear: t => t,
  easeOutQuart: t => 1 - Math.pow(1 - t, 4),
  easeInOutBack: t => (t < 0.5)
    ? (Math.pow(2 * t, 2) * (2.7 * 2 * t - 1.7)) / 2
    : (2 - Math.pow(2 - 2 * t, 2) * (2.7 * (2 - 2 * t) + 1.7)) / 2,
};

function rafValue({ from, to, duration = 300, easing = 'easeOutQuart', onUpdate }) {
  const ease = EASING[easing] || EASING.easeOutQuart;
  const t0 = performance.now();
  function step(t) {
    const k = Math.min((t - t0) / duration, 1);
    const v = M.lerp(from, to, ease(k));
    onUpdate?.(v, k);
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

const animations = {
  animateValue: (from, to, duration, cb, easing = 'easeOutQuart') =>
    rafValue({ from, to, duration, easing, onUpdate: cb }),

  pulseElement(el, intensity = 1.2, duration = 600) {
    if (!el) return;
    withBaseTransform(el);
    el.style.transition = `transform ${duration}ms cubic-bezier(0.68,-0.55,0.265,1.55)`;
    setTransform(el, `scale(${intensity})`);
    setTimeout(() => {
      setTransform(el);
      setTimeout(() => { el.style.transition = ''; }, duration);
    }, duration / 2);
  },

  shakeElement(el, intensity = 5, duration = 400) {
    if (!el) return;
    withBaseTransform(el);
    let i = 0, n = 6, dt = duration / n;
    (function tick() {
      if (i < n) {
        const dx = (Math.random() - 0.5) * intensity * 2;
        const dy = (Math.random() - 0.5) * intensity * 2;
        setTransform(el, `translate(${dx}px, ${dy}px)`);
        i++; setTimeout(tick, dt);
      } else { setTransform(el); }
    })();
  }
};

// ---------- Cache elementi ----------
const elements = {
  mmEnemies: null, mmTime: null, mmCoords: null, mmLevel: null,
  minimapGrid: null, minimapPlayer: null, compass: null,
  notificationArea: null, promptBox: null, promptKey: null, promptText: null,
  healthBar: null, healthText: null, manaBar: null, manaText: null,
  staminaBar: null, staminaText: null, xpBar: null, xpText: null
};

// ---------- Radar ----------
const radar = {
  initialized: false,
  range: 120,
  dotMap: new Map(), // enemy -> DOT
  headingArrow: null,
  compassElement: null,
  gridElement: null,
  config: {
    maxRadius: 90,
    enemyDotSize: 5,
    playerDotSize: 10,
    fadeDistance: 0.7,
    pulseInterval: 1500,
  }
};

function initializeRadarSystem() {
  elements.minimapGrid = document.querySelector('.minimap-grid');
  elements.minimapPlayer = document.querySelector('.minimap-player');
  elements.compass = document.querySelector('.compass');

  if (!elements.minimapGrid) {
    console.warn('[HUD] Minimap assente: radar disabilitato');
    return false;
  }

  // Pulisci eventuali demo
  elements.minimapGrid.querySelectorAll('.minimap-enemy').forEach(el => el.remove());

  radar.headingArrow = document.querySelector('.minimap-heading') || null;
  if (elements.compass) {
    elements.compass.textContent = 'N';
    elements.compass.setAttribute('aria-label', 'Direzione: Nord');
  }

  radar.gridElement = elements.minimapGrid;
  radar.compassElement = elements.compass;
  radar.initialized = true;
  return true;
}

function createEnemyDot() {
  const dot = document.createElement('div');
  dot.className = 'minimap-enemy';
  Object.assign(dot.style, {
    position: 'absolute',
    width: `${radar.config.enemyDotSize}px`,
    height: `${radar.config.enemyDotSize}px`,
    borderRadius: '50%',
    background: 'var(--danger-red)',
    boxShadow: '0 0 8px rgba(255,71,87,0.6)',
    transform: 'translate(-50%, -50%) scale(0.75)',
    zIndex: '2', pointerEvents: 'none', transition: 'transform .2s, opacity .2s'
  });
  return dot;
}

function updateRadarSystem(player, enemies, camera) {
  if (!radar.initialized || !elements.minimapGrid || !player?.model || !camera) return;

  // Dim minimap
  const rect = elements.minimapGrid.getBoundingClientRect();
  const size = Math.min(rect.width || 180, rect.height || 180);
  const maxR = size * 0.5;

  // Yaw camera
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const yawDeg = M.toDeg(Math.atan2(dir.x, dir.z));

  // Pos player
  const p = player.model.position;
  const active = new Set();

  // Aggiorna dots
  const frag = document.createDocumentFragment();
  for (const enemy of (enemies || [])) {
    if (!enemy?.alive || !enemy?.model) continue;

    const e = enemy.model.position;
    const dx = e.x - p.x, dz = e.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist > radar.range) continue;

    // N-up: +Z su
    let rx = (-dx / radar.range) * maxR;
    let ry = (-dz / radar.range) * maxR;
    const rr = Math.hypot(rx, ry);
    if (rr > maxR) { const s = maxR / rr; rx *= s; ry *= s; }

    const left = 50 + (rx / size) * 100;
    const top  = 50 + (ry / size) * 100;

    let dot = radar.dotMap.get(enemy);
    if (!dot) {
      dot = createEnemyDot();
      elements.minimapGrid.appendChild(dot); // pochi elementi → ok append diretto
      radar.dotMap.set(enemy, dot);
      requestAnimationFrame(() => { dot.style.transform = 'translate(-50%, -50%) scale(1)'; dot.style.opacity = '0.85'; });
    }

    dot.style.left = `${left}%`;
    dot.style.top  = `${top}%`;

    const fadeD = radar.range * radar.config.fadeDistance;
    const op = dist > fadeD ? M.lerp(0.85, 0.35, (dist - fadeD) / (radar.range - fadeD)) : 0.85;
    dot.style.opacity = `${op}`;

    const scale = M.lerp(1.1, 0.85, dist / radar.range);
    setTransform(dot, `translate(-50%, -50%) scale(${scale})`);

    active.add(dot);
  }

  // Rimuovi orfani
  for (const [enemy, dot] of radar.dotMap.entries()) {
    if (!active.has(dot)) {
      dot.style.opacity = '0';
      setTransform(dot, 'translate(-50%, -50%) scale(0)');
      setTimeout(() => { dot.remove(); radar.dotMap.delete(enemy); }, 200);
    }
  }

  // Freccia direzione
  if (radar.headingArrow) {
    withBaseTransform(radar.headingArrow);
    setTransform(radar.headingArrow, `translate(-50%, -60%) rotate(${-yawDeg}deg)`);
  }
}

// ---------- Notifiche ----------
const notificationSystem = {
  maxVisible: 5,
  show(text, type = 'info', opt = {}) {
    if (!elements.notificationArea) return null;

    const types = {
      info:    { icon: 'ℹ️', cls: 'notification-info',    duration: 4000 },
      success: { icon: '✅', cls: 'notification-success',  duration: 3000 },
      warning: { icon: '⚠️', cls: 'notification-warning',  duration: 5000 },
      error:   { icon: '❌', cls: 'notification-error',    duration: 6000 },
      levelup: { icon: '🎉', cls: 'notification-levelup',  duration: 4000 },
    };
    const cfg = types[type] || types.info;

    const el = document.createElement('div');
    el.className = `notification ${cfg.cls}`;
    el.innerHTML = `
      <span class="notification-icon">${cfg.icon}</span>
      <span class="notification-text">${text}</span>
    `;
    el.style.transform = 'translateX(-100%)';
    el.style.opacity = '0';
    elements.notificationArea.appendChild(el);

    requestAnimationFrame(() => {
      el.style.transition = 'all .35s cubic-bezier(0.68,-0.55,0.265,1.55)';
      el.style.transform = 'translateX(0)'; el.style.opacity = '1';
    });

    const duration = opt.duration ?? cfg.duration;
    setTimeout(() => this.remove(el), duration);

    // cleanup extra
    this.cleanup();
    return el;
  },
  remove(el) {
    if (!el || !el.parentNode) return;
    el.style.transition = 'all .25s ease';
    el.style.transform = 'translateX(-100%)'; el.style.opacity = '0'; el.style.marginBottom = '0';
    setTimeout(() => { el.remove?.(); }, 250);
  },
  cleanup() {
    const nodes = elements.notificationArea?.querySelectorAll('.notification') || [];
    const overflow = nodes.length - this.maxVisible;
    for (let i = 0; i < overflow; i++) this.remove(nodes[i]);
  }
};

// ---------- Prompt ----------
const interactionSystem = {
  isVisible: false, currentPrompt: null,
  show(key = 'E', text = 'Interagisci', opt = {}) {
    if (!elements.promptBox || !elements.promptKey || !elements.promptText) return;

    elements.promptKey.textContent = key.toUpperCase();
    elements.promptText.textContent = text;
    elements.promptBox.style.borderLeftColor = opt.color || '';
    if (opt.urgent) {
      elements.promptBox.classList.add('urgent');
      animations.pulseElement(elements.promptBox, 1.06, 260);
    } else elements.promptBox.classList.remove('urgent');

    if (!this.isVisible) {
      elements.promptBox.hidden = false;
      elements.promptBox.style.opacity = '0';
      elements.promptBox.style.transform = 'translate(-50%, -20px)';
      requestAnimationFrame(() => {
        elements.promptBox.style.transition = 'all .28s cubic-bezier(0.68,-0.55,0.265,1.55)';
        elements.promptBox.style.opacity = '1';
        elements.promptBox.style.transform = 'translate(-50%, 0)';
      });
      this.isVisible = true;
    }
    this.currentPrompt = { key, text, opt };
  },
  hide() {
    if (!elements.promptBox || !this.isVisible) return;
    elements.promptBox.style.transition = 'all .22s ease';
    elements.promptBox.style.opacity = '0';
    elements.promptBox.style.transform = 'translate(-50%, -20px)';
    setTimeout(() => {
      elements.promptBox.hidden = true;
      elements.promptBox.classList.remove('urgent');
      this.isVisible = false;
      this.currentPrompt = null;
    }, 220);
  },
  pulse() { if (this.isVisible) animations.pulseElement(elements.promptBox, 1.04, 200); }
};

// ---------- Vitals ----------
const vitalsSystem = {
  last: { health: -1, mana: -1, stamina: -1, xp: -1 },
  updateBar(type, curr, max) {
    const bar = elements[`${type}Bar`];
    const txt = elements[`${type}Text`];
    if (!bar || !txt) return;

    const pct = M.clamp((curr / max) * 100, 0, 100);
    txt.textContent = `${Math.round(curr)} / ${Math.round(max)}`;

    if (this.last[type] !== pct) {
      animations.animateValue(this.last[type] >= 0 ? this.last[type] : pct, pct, 280, v => {
        bar.style.width = `${v}%`;
      });

      const delta = pct - this.last[type];
      if (this.last[type] >= 0 && Math.abs(delta) > 5) {
        if (delta > 0) animations.pulseElement(bar, 1.04, 320);
        else animations.shakeElement(bar.parentElement, 3, 260);
      }

      if (type === 'health') {
        if (pct < 25) { bar.classList.add('critical'); bar.style.animation = (pct < 15) ? 'healthCritical 1s infinite' : ''; }
        else { bar.classList.remove('critical'); bar.style.animation = ''; }
      }

      this.last[type] = pct;
    }

    const cont = bar.parentElement;
    if (cont && cont.getAttribute('role') === 'progressbar') {
      cont.setAttribute('aria-valuenow', String(Math.round(pct)));
    }
  }
};

// ---------- API ----------
export const hudManager = {
  init() {
    Object.assign(elements, {
      mmEnemies: $('mm-enemies'), mmTime: $('mm-time'), mmCoords: $('mm-coords'), mmLevel: $('mm-level'),
      notificationArea: $('notifications'),
      promptBox: $('interaction-prompts'), promptKey: $('interaction-key'), promptText: $('interaction-text'),
      healthBar: $('health-bar'), healthText: $('health-text'),
      manaBar: $('mana-bar'), manaText: $('mana-text'),
      staminaBar: $('stamina-bar'), staminaText: $('stamina-text'),
      xpBar: $('xp-bar'), xpText: $('xp-text')
    });

    initializeRadarSystem();
    radar.range = 120;
    return true;
  },

  update(player, controller, camera, enemies = [], gameState = {}) {
    try {
      // Coords
      if (elements.mmCoords && player?.model) {
        const pos = player.model.position;
        const txt = `📍 ${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}`;
        if (elements.mmCoords.textContent !== txt) {
          elements.mmCoords.textContent = txt;
          animations.pulseElement(elements.mmCoords, 1.02, 180);
        }
      }

      // Enemies near
      if (elements.mmEnemies && player?.model && enemies?.length) {
        const p = player.model.position;
        let near = 0;
        for (const e of enemies) {
          const ep = e?.model?.position;
          if (ep && ep.distanceTo?.(p) < 80) near++;
        }
        const txt = `🎯 ${near}`;
        if (elements.mmEnemies.textContent !== txt) {
          elements.mmEnemies.textContent = txt;
          if (near > 0) animations.pulseElement(elements.mmEnemies, 1.08, 260);
        }
      }

      // Fake clock (mantieni comportamento)
      if (elements.mmTime) {
        const gameTime = performance.now() / 1000;
        const minutes = Math.floor(gameTime % 60).toString().padStart(2, '0');
        const hours = (6 + Math.floor((gameTime / 60) % 24)).toString().padStart(2, '0');
        const txt = `⏰ ${hours}:${minutes}`;
        if (elements.mmTime.textContent !== txt) elements.mmTime.textContent = txt;
      }

      // Radar
      updateRadarSystem(player, enemies, camera);

      // Vitals
      if (gameState.vitals) {
        const { health, mana, stamina, xp } = gameState.vitals;
        if (health)  vitalsSystem.updateBar('health',  health.current,  health.max);
        if (mana)    vitalsSystem.updateBar('mana',    mana.current,    mana.max);
        if (stamina) vitalsSystem.updateBar('stamina', stamina.current, stamina.max);
        if (xp)      vitalsSystem.updateBar('xp',      xp.current,      xp.max);
      }
    } catch (err) {
      console.error('[HUD] update error:', err);
    }
  },

  showNotification: (text, type, options) => notificationSystem.show(text, type, options),

  showPrompt: (key, text, options) => interactionSystem.show(key, text, options),
  hidePrompt: () => interactionSystem.hide(),
  pulsePrompt: () => interactionSystem.pulse(),

  updateVitals(vitals) {
    for (const [type, data] of Object.entries(vitals || {})) {
      if (data && typeof data.current === 'number' && typeof data.max === 'number') {
        vitalsSystem.updateBar(type, data.current, data.max);
      }
    }
  },

  animations,
  getRadarConfig: () => radar.config,
  setRadarRange: (range) => { radar.range = M.clamp(range, 50, 300); },
};
export async function loadHudVitals() {
  const container = document.getElementById("hud-vitals-container");
  const response = await fetch("./src/ui/vitals.html");
  container.innerHTML = await response.text();
}
export async function loadHudMap() {
  const container = document.getElementById("hud-map-container");
  const response = await fetch("./src/ui/map.html");
  container.innerHTML = await response.text();
}
export async function loadHudPills() {
  const container = document.getElementById("hud-pills-container");
  const response = await fetch("./src/ui/pills.html");
  container.innerHTML = await response.text();
}


