// /src/ui/xpHud.js – Sistema XP/Level ottimizzato e coerente con hudManager
import { hudManager } from './hudManager.js';

let elements = null;
let lastValues = { level: 0, xp: 0, progress: 0 };

const XP_CONFIG = {
  animationDuration: 600,
  levelUpEffectDuration: 1500,
  progressThreshold: 0.5, // aggiorna barra solo se differenza > 0.5%
  levelColors: {
    1: '#64c8ff', 10: '#2ed573', 25: '#f39c12', 50: '#e74c3c', 75: '#9b59b6', 100: '#f1c40f'
  }
};

const xpAnimations = {
  animateProgressBar(el, fromPct, toPct, duration = XP_CONFIG.animationDuration) {
    if (!el) return Promise.resolve();
    return new Promise((resolve) => {
      const t0 = performance.now();
      const ease = (t) => 1 - Math.pow(1 - t, 4); // easeOutQuart
      const loop = (t) => {
        const k = Math.min((t - t0) / duration, 1);
        const v = fromPct + (toPct - fromPct) * ease(k);
        el.style.width = `${v}%`;
        if (k < 1) requestAnimationFrame(loop); else resolve();
      };
      requestAnimationFrame(loop);
    });
  },

  createSparkleEffect(container) {
    if (!container) return;
    const frag = document.createDocumentFragment();
    const sparkles = [];
    const N = 12;
    const rect = container.getBoundingClientRect();

    for (let i = 0; i < N; i++) {
      const s = document.createElement('div');
      s.className = 'xp-sparkle';
      s.style.cssText = `
        position:absolute;width:4px;height:4px;border-radius:50%;
        background:var(--warning-orange-light);pointer-events:none;z-index:10;
        box-shadow:0 0 6px var(--warning-orange);
      `;
      const ang = (i / N) * Math.PI * 2;
      const R = 30 + Math.random() * 20;
      s.style.left = `${rect.width / 2 + Math.cos(ang) * R}px`;
      s.style.top  = `${rect.height / 2 + Math.sin(ang) * R}px`;
      frag.appendChild(s); sparkles.push(s);

      s.animate([
        { transform: 'scale(0) rotate(0deg)', opacity: 1 },
        { transform: 'scale(1.5) rotate(180deg)', opacity: 0.8, offset: 0.3 },
        { transform: 'scale(0) rotate(360deg)', opacity: 0 }
      ], { duration: 1200, easing: 'cubic-bezier(0.68,-0.55,0.265,1.55)', delay: i * 50 });
    }
    container.appendChild(frag);
    setTimeout(() => sparkles.forEach(s => s.remove()), 1500);
  },

  levelPulseEffect(el, level) {
    if (!el) return;
    const color = this.getLevelColor(level);
    el.style.transition = 'all .35s cubic-bezier(0.68,-0.55,0.265,1.55)';
    el.style.transform = 'scale(1.2)';
    el.style.color = color;
    el.style.boxShadow = `0 0 20px ${color}40`;
    setTimeout(() => {
      el.style.transform = 'scale(1)'; el.style.boxShadow = 'var(--glow-subtle)';
    }, 350);
  },

  getLevelColor(level) {
    const keys = Object.keys(XP_CONFIG.levelColors).map(Number).sort((a,b)=>b-a);
    for (const k of keys) if (level >= k) return XP_CONFIG.levelColors[k];
    return XP_CONFIG.levelColors[1];
  }
};

export function initXPHud() {
  elements = {
    pillLevel: document.getElementById('mm-level'),
    xpBar: document.getElementById('xp-bar'),
    xpText: document.getElementById('xp-text'),
    xpContainer: document.querySelector('.progress-container:has(#xp-bar)'),
    notificationArea: document.getElementById('notifications'),
  };
  const missing = ['pillLevel','xpBar','xpText'].filter(k => !elements[k]);
  if (missing.length) {
    console.warn('[XP HUD] Mancano:', missing.join(', '));
    return false;
  }
  return true;
}

export function renderXPHud(levelSystem) {
  if (!elements && !initXPHud()) return;
  if (!levelSystem) return;

  const { level, xp, xpToNextLevel, progress } = levelSystem;
  const pct = Math.round(progress * 100);

  // Level pill
  if (elements.pillLevel) {
    const txt = `🧬 LVL ${level}`;
    if (lastValues.level !== level) {
      elements.pillLevel.textContent = txt;
      if (lastValues.level > 0 && level > lastValues.level) {
        xpAnimations.levelPulseEffect(elements.pillLevel, level);
      }
      lastValues.level = level;
    }
  }

  // XP bar (aggiorna se differenza > threshold)
  if (elements.xpBar) {
    const lastPct = Math.round(lastValues.progress * 100);
    if (Math.abs(pct - lastPct) > XP_CONFIG.progressThreshold) {
      xpAnimations.animateProgressBar(elements.xpBar, lastPct, pct, XP_CONFIG.animationDuration);
      lastValues.progress = progress;
    }
  }

  // XP text
  if (elements.xpText) {
    const txt = `${xp} / ${xpToNextLevel}`;
    if (elements.xpText.textContent !== txt) {
      elements.xpText.textContent = txt;
      elements.xpText.style.transform = 'scale(1.1)';
      setTimeout(() => { elements.xpText.style.transform = 'scale(1)'; }, 140);
      lastValues.xp = xp;
    }
  }
}

export function toastLevelUp(newLevel, options = {}) {
  const message = options.customMessage ||
    `🎉 Level ${newLevel}! ${({
      1: "Primo passo nell'evoluzione!",
      5: "Stai iniziando a mutare...",
      10: "Le tue capacità si stanno sviluppando!",
      25: "Trasformazione significativa raggiunta!",
      50: "Metamorfosi avanzata in corso!",
      75: "Sei diventato una forma superiore!",
      100: "Evoluzione completa raggiunta!"
    }[newLevel] || "Continua ad evolverti!")}`;

  if (typeof hudManager?.showNotification === 'function') {
    hudManager.showNotification(message, 'levelup', { duration: XP_CONFIG.levelUpEffectDuration });
  } else if (elements?.notificationArea) {
    const n = document.createElement('div');
    n.className = 'notification notification-levelup';
    n.innerHTML = `<span class="notification-icon">🎉</span><span class="notification-text">${message}</span>`;
    n.style.background = 'linear-gradient(135deg, rgba(241,196,15,.15), rgba(243,156,18,.1))';
    n.style.borderLeftColor = 'var(--warning-orange)';
    n.style.transform = 'translateX(-100%)';
    n.style.boxShadow = '0 4px 20px rgba(241,196,15,.3)';
    elements.notificationArea.appendChild(n);
    requestAnimationFrame(() => {
      n.style.transition = 'all .45s cubic-bezier(0.68,-0.55,0.265,1.55)';
      n.style.transform = 'translateX(0)';
    });
    setTimeout(() => {
      n.style.transition = 'all .25s ease';
      n.style.transform = 'translateX(-100%)'; n.style.opacity = '0';
      setTimeout(() => n.remove(), 250);
    }, XP_CONFIG.levelUpEffectDuration);
  }

  if (elements?.xpContainer) xpAnimations.createSparkleEffect(elements.xpContainer);
  if (elements?.xpBar) {
    elements.xpBar.classList.add('levelup');
    setTimeout(() => elements.xpBar.classList.remove('levelup'), XP_CONFIG.levelUpEffectDuration);
  }
}
