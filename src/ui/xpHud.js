// src/ui/xpHud.js - Sistema XP e Leveling Avanzato
import { hudManager } from './hudManager.js';

// Cache elementi DOM
let elements = null;
let lastValues = { level: 0, xp: 0, progress: 0 };

// Configurazione sistema XP
const XP_CONFIG = {
  animationDuration: 600,
  levelUpEffectDuration: 1500,
  progressAnimationEasing: 'easeOutQuart',
  
  // Colori per diversi livelli
  levelColors: {
    1: '#64c8ff',      // Principiante - Blu
    10: '#2ed573',     // Intermedio - Verde
    25: '#f39c12',     // Avanzato - Arancione
    50: '#e74c3c',     // Esperto - Rosso
    75: '#9b59b6',     // Maestro - Viola
    100: '#f1c40f'     // Leggendario - Oro
  }
};

// Utilità per animazioni XP
const xpAnimations = {
  // Anima il riempimento della barra XP
  animateProgressBar(element, fromWidth, toWidth, duration = XP_CONFIG.animationDuration) {
    if (!element) return Promise.resolve();
    
    return new Promise((resolve) => {
      const startTime = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (easeOutQuart)
        const eased = 1 - Math.pow(1 - progress, 4);
        const currentWidth = fromWidth + (toWidth - fromWidth) * eased;
        
        element.style.width = `${currentWidth}%`;
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      
      requestAnimationFrame(animate);
    });
  },
  
  // Effetto sparkle per level up
  createSparkleEffect(container) {
    if (!container) return;
    
    const sparkles = [];
    const sparkleCount = 12;
    
    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'xp-sparkle';
      sparkle.style.cssText = `
        position: absolute;
        width: 4px;
        height: 4px;
        background: var(--warning-orange-light);
        border-radius: 50%;
        pointer-events: none;
        z-index: 10;
        box-shadow: 0 0 6px var(--warning-orange);
      `;
      
      // Posizione casuale intorno alla barra
      const rect = container.getBoundingClientRect();
      const angle = (i / sparkleCount) * Math.PI * 2;
      const radius = 30 + Math.random() * 20;
      
      sparkle.style.left = `${rect.width / 2 + Math.cos(angle) * radius}px`;
      sparkle.style.top = `${rect.height / 2 + Math.sin(angle) * radius}px`;
      
      container.appendChild(sparkle);
      sparkles.push(sparkle);
      
      // Animazione sparkle
      sparkle.animate([
        { 
          transform: 'scale(0) rotate(0deg)', 
          opacity: 1 
        },
        { 
          transform: 'scale(1.5) rotate(180deg)', 
          opacity: 0.8,
          offset: 0.3
        },
        { 
          transform: 'scale(0) rotate(360deg)', 
          opacity: 0 
        }
      ], {
        duration: 1200,
        easing: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        delay: i * 50
      });
    }
    
    // Cleanup sparkles
    setTimeout(() => {
      sparkles.forEach(sparkle => sparkle.remove());
    }, 1500);
  },
  
  // Effetto pulse per la pill del livello
  levelPulseEffect(element, newLevel) {
    if (!element) return;
    
    const color = this.getLevelColor(newLevel);
    element.style.transition = 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    element.style.transform = 'scale(1.2)';
    element.style.color = color;
    element.style.boxShadow = `0 0 20px ${color}40`;
    
    setTimeout(() => {
      element.style.transform = 'scale(1)';
      element.style.boxShadow = 'var(--glow-subtle)';
    }, 400);
  },
  
  // Ottieni colore basato sul livello
  getLevelColor(level) {
    const thresholds = Object.keys(XP_CONFIG.levelColors)
      .map(Number)
      .sort((a, b) => b - a);
    
    for (const threshold of thresholds) {
      if (level >= threshold) {
        return XP_CONFIG.levelColors[threshold];
      }
    }
    
    return XP_CONFIG.levelColors[1];
  }
};

// Inizializzazione elementi DOM
export function initXPHud() {
  elements = {
    pillLevel: document.getElementById('mm-level'),
    xpBar: document.getElementById('xp-bar'),
    xpText: document.getElementById('xp-text'),
    xpContainer: document.querySelector('.progress-container:has(#xp-bar)'),
    notificationArea: document.getElementById('notifications'),
  };
  
  // Verifica elementi critici
  const criticalElements = ['pillLevel', 'xpBar', 'xpText'];
  const missing = criticalElements.filter(key => !elements[key]);
  
  if (missing.length > 0) {
    console.warn(`[XP HUD] Elementi mancanti: ${missing.join(', ')}`);
    return false;
  }
  
  console.log('[XP HUD] Inizializzazione completata');
  return true;
}

// Rendering principale del sistema XP
export function renderXPHud(levelSystem) {
  if (!elements && !initXPHud()) {
    return;
  }
  
  if (!levelSystem) {
    console.warn('[XP HUD] levelSystem non fornito');
    return;
  }
  
  const { level, xp, xpToNextLevel, progress } = levelSystem;
  const currentProgress = Math.round(progress * 100);
  
  // Aggiorna pill del livello
  if (elements.pillLevel) {
    const levelText = `🧬 LVL ${level}`;
    
    if (lastValues.level !== level) {
      elements.pillLevel.textContent = levelText;
      
      if (lastValues.level > 0 && level > lastValues.level) {
        // Level up effect
        xpAnimations.levelPulseEffect(elements.pillLevel, level);
      }
      
      lastValues.level = level;
    }
  }
  
  // Aggiorna barra XP
  if (elements.xpBar) {
    const lastProgress = lastValues.progress * 100;
    
    if (Math.abs(currentProgress - lastProgress) > 0.1) {
      // Anima la barra se c'è un cambiamento significativo
      xpAnimations.animateProgressBar(
        elements.xpBar, 
        lastProgress, 
        currentProgress,
        XP_CONFIG.animationDuration
      );
      
      lastValues.progress = progress;
    }
  }
  
  // Aggiorna testo XP
  if (elements.xpText) {
    const xpText = `${xp} / ${xpToNextLevel}`;
    
    if (elements.xpText.textContent !== xpText) {
      elements.xpText.textContent = xpText;
      
      // Micro-animazione per feedback visivo
      if (lastValues.xp > 0 && xp > lastValues.xp) {
        elements.xpText.style.transform = 'scale(1.1)';
        setTimeout(() => {
          elements.xpText.style.transform = 'scale(1)';
        }, 150);
      }
      
      lastValues.xp = xp;
    }
  }
}

// Toast di level up avanzato
export function toastLevelUp(newLevel, options = {}) {
  if (!elements?.notificationArea && !hudManager) {
    console.warn('[XP HUD] Sistema notifiche non disponibile');
    return;
  }
  
  // Messaggio personalizzato
  const achievements = {
    1: "Primo passo nell'evoluzione!",
    5: "Stai iniziando a mutare...",
    10: "Le tue capacità si stanno sviluppando!",
    25: "Trasformazione significativa raggiunta!",
    50: "Metamorfosi avanzata in corso!",
    75: "Sei diventato una forma superiore!",
    100: "Evoluzione completa raggiunta!"
  };
  
  const achievement = achievements[newLevel] || "Continua ad evolverti!";
  const message = options.customMessage || `🎉 Level ${newLevel}! ${achievement}`;
  
  // Usa il sistema di notifiche del HUD manager se disponibile
  if (hudManager && typeof hudManager.showNotification === 'function') {
    hudManager.showNotification(message, 'levelup', {
      duration: XP_CONFIG.levelUpEffectDuration
    });
  } else {
    // Fallback al sistema precedente
    if (elements.notificationArea) {
      const notification = document.createElement('div');
      notification.className = 'notification notification-levelup';
      notification.innerHTML = `
        <span class="notification-icon">🎉</span>
        <span class="notification-text">${message}</span>
      `;
      
      // Stili speciali per level up
      notification.style.cssText = `
        background: linear-gradient(135deg, rgba(241, 196, 15, 0.15), rgba(243, 156, 18, 0.1));
        border-left-color: var(--warning-orange);
        transform: translateX(-100%);
        box-shadow: 0 4px 20px rgba(241, 196, 15, 0.3);
      `;
      
      elements.notificationArea.appendChild(notification);
      
      // Animazione entrata
      requestAnimationFrame(() => {
        notification.style.transition = 'all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        notification.style.transform = 'translateX(0)';
      });
      
      // Rimozione automatica
      setTimeout(() => {
        notification.style.transition = 'all 0.3s ease';
        notification.style.transform = 'translateX(-100%)';
        notification.style.opacity = '0';
        
        setTimeout(() => notification.remove(), 300);
      }, XP_CONFIG.levelUpEffectDuration);
    }
  }
  
  // Effetti visivi aggiuntivi
  if (elements.xpContainer) {
    xpAnimations.createSparkleEffect(elements.xpContainer);
  }
  
  // Effetto sulla barra XP
  if (elements.xpBar) {
    elements.xpBar.classList.add('levelup');
    setTimeout(() => {
      elements.xpBar.classList.remove('levelup');
    }, XP_CONFIG.levelUpEffectDuration);
  }
}