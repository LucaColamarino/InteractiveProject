// /src/ui/hudManager.js – Sistema HUD Avanzato con Animazioni
import * as THREE from 'three';

// Utility per selezione elementi
const $ = (id) => /** @type {HTMLElement|null} */(document.getElementById(id));
const $$ = (selector) => /** @type {NodeList} */(document.querySelectorAll(selector));

// Cache elementi DOM
const elements = {
  // Minimap pills
  mmEnemies: null,
  mmTime: null, 
  mmCoords: null,
  mmLevel: null,
  
  // Minimap components
  minimapGrid: null,
  minimapPlayer: null,
  compass: null,
  
  // Notifications & prompts
  notificationArea: null,
  promptBox: null,
  promptKey: null,
  promptText: null,
  
  // Progress bars
  healthBar: null,
  healthText: null,
  manaBar: null,
  manaText: null,
  staminaBar: null,
  staminaText: null,
  xpBar: null,
  xpText: null
};

// Sistema radar migliorato
const radar = {
  range: 120,                    // Raggio rappresentato (unità mondo)
  dotMap: new Map(),            // enemy -> DOM element
  headingArrow: null,           // Freccia direzione giocatore
  compassElement: null,         // Elemento bussola
  gridElement: null,            // Container griglia
  initialized: false,
  
  // Configurazione visuale
  config: {
    maxRadius: 90,              // Pixel massimi dal centro
    enemyDotSize: 5,            // Dimensione dot nemici
    playerDotSize: 10,          // Dimensione dot giocatore
    fadeDistance: 0.7,          // Inizio fade basato su distanza
    pulseInterval: 1500,        // Intervallo pulse nemici
  }
};

// Utilità matematiche
const mathUtils = {
  clamp: (value, min, max) => Math.min(Math.max(value, min), max),
  
  lerp: (a, b, t) => a + (b - a) * t,
  
  toRadians: (degrees) => degrees * Math.PI / 180,
  
  toDegrees: (radians) => radians * 180 / Math.PI,
  
  // Converti direzione cardinale
  getCardinalDirection: (degrees) => {
    const normalized = ((degrees % 360) + 360) % 360;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(normalized / 45) % 8;
    return directions[index];
  }
};

// Sistema animazioni avanzate
const animations = {
  activeAnimations: new Map(),
  
  // Anima valore numerico con callback
  animateValue: (from, to, duration, callback, easing = 'easeOutQuart') => {
    const start = performance.now();
    const easingFunctions = {
      linear: t => t,
      easeOutQuart: t => 1 - Math.pow(1 - t, 4),
      easeInOutBack: t => t < 0.5 
        ? (Math.pow(2 * t, 2) * (2.7 * 2 * t - 1.7)) / 2
        : (2 - Math.pow(2 - 2 * t, 2) * (2.7 * (2 - 2 * t) + 1.7)) / 2
    };
    
    const easeFn = easingFunctions[easing] || easingFunctions.easeOutQuart;
    
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeFn(progress);
      const currentValue = mathUtils.lerp(from, to, easedProgress);
      
      callback(currentValue, progress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    requestAnimationFrame(animate);
  },
  
  // Pulse su elemento con intensità
  pulseElement: (element, intensity = 1.2, duration = 600) => {
    if (!element) return;
    
    const originalTransform = element.style.transform || '';
    element.style.transition = `transform ${duration}ms cubic-bezier(0.68, -0.55, 0.265, 1.55)`;
    element.style.transform = `${originalTransform} scale(${intensity})`;
    
    setTimeout(() => {
      element.style.transform = originalTransform;
      setTimeout(() => {
        element.style.transition = '';
      }, duration);
    }, duration / 2);
  },
  
  // Shake element per feedback negativo
  shakeElement: (element, intensity = 5, duration = 400) => {
    if (!element) return;
    
    const originalTransform = element.style.transform || '';
    let shakes = 0;
    const maxShakes = 6;
    
    const shake = () => {
      if (shakes < maxShakes) {
        const offsetX = (Math.random() - 0.5) * intensity * 2;
        const offsetY = (Math.random() - 0.5) * intensity * 2;
        element.style.transform = `${originalTransform} translate(${offsetX}px, ${offsetY}px)`;
        shakes++;
        setTimeout(shake, duration / maxShakes);
      } else {
        element.style.transform = originalTransform;
      }
    };
    
    shake();
  }
};

// Inizializzazione sistema minimap
function initializeRadarSystem() {
  elements.minimapGrid = document.querySelector('.minimap-grid');
  elements.minimapPlayer = document.querySelector('.minimap-player');
  elements.compass = document.querySelector('.compass');
  
  if (!elements.minimapGrid) {
    console.warn('[HUD] Sistema minimap non trovato - radar disabilitato');
    return false;
  }
  
  // Rimuovi marker demo esistenti
  elements.minimapGrid.querySelectorAll('.minimap-enemy').forEach(el => el.remove());
  
  // Trova o crea freccia direzione
  radar.headingArrow = document.querySelector('.minimap-heading');
  if (!radar.headingArrow) {
    console.warn('[HUD] Freccia direzione mancante');
  }
  
  // Configura bussola
  if (elements.compass) {
    elements.compass.textContent = 'N';
    elements.compass.setAttribute('aria-label', 'Direzione: Nord');
  }
  
  radar.gridElement = elements.minimapGrid;
  radar.compassElement = elements.compass;
  radar.initialized = true;
  
  console.log('[HUD] Sistema radar inizializzato');
  return true;
}

// Crea o aggiorna dot nemico
function createOrUpdateEnemyDot(enemy) {
  let dot = radar.dotMap.get(enemy);
  
  if (!dot) {
    dot = document.createElement('div');
    dot.className = 'minimap-enemy';
    
    // Stili avanzati per il dot
    Object.assign(dot.style, {
      position: 'absolute',
      width: `${radar.config.enemyDotSize}px`,
      height: `${radar.config.enemyDotSize}px`,
      borderRadius: '50%',
      background: 'var(--danger-red)',
      boxShadow: '0 0 8px rgba(255, 71, 87, 0.6)',
      transform: 'translate(-50%, -50%)',
      zIndex: '2',
      pointerEvents: 'none',
      transition: 'all 0.3s ease'
    });
    
    elements.minimapGrid.appendChild(dot);
    radar.dotMap.set(enemy, dot);
    
    // Animazione di apparizione
    dot.style.opacity = '0';
    dot.style.transform = 'translate(-50%, -50%) scale(0)';
    
    requestAnimationFrame(() => {
      dot.style.opacity = '0.8';
      dot.style.transform = 'translate(-50%, -50%) scale(1)';
    });
  }
  
  return dot;
}

// Sistema aggiornamento radar avanzato
function updateRadarSystem(player, enemies, camera) {
  if (!radar.initialized || !elements.minimapGrid || !player?.model || !camera) {
    return;
  }
  
  // Calcola dimensioni radar
  const rect = elements.minimapGrid.getBoundingClientRect();
  const size = Math.min(rect.width || 180, rect.height || 180);
  const maxRadius = size * 0.5;
  
  // Calcola orientamento camera (yaw)
  const worldDirection = new THREE.Vector3();
  camera.getWorldDirection(worldDirection);
  const yaw = Math.atan2(worldDirection.x, worldDirection.z);
  const yawDegrees = mathUtils.toDegrees(yaw);
  
  // Posizione giocatore
  const playerPos = player.model.position;
  const activeDots = new Set();
  
  // --- AGGIORNA DOTS NEMICI ---
  for (const enemy of (enemies || [])) {
    if (!enemy?.alive || !enemy?.model) continue;
    
    const enemyPos = enemy.model.position;
    
    // Delta posizione mondo
    const deltaX = enemyPos.x - playerPos.x;
    const deltaZ = enemyPos.z - playerPos.z;
    const distance = Math.sqrt(deltaX * deltaX + deltaZ * deltaZ);
    
    // Skip se troppo lontano
    if (distance > radar.range) continue;
    
    // Converti a coordinate radar (North-Up)
    // +X = Est (destra), +Z = Nord (su)
    const radarX = (deltaX / radar.range) * maxRadius;
    const radarY = (-deltaZ / radar.range) * maxRadius; // -Z perché schermo Y cresce verso il basso
    
    // Clamp al bordo circolare
    const radarDistance = Math.sqrt(radarX * radarX + radarY * radarY);
    let finalX = radarX;
    let finalY = radarY;
    
    if (radarDistance > maxRadius) {
      const scale = maxRadius / radarDistance;
      finalX *= scale;
      finalY *= scale;
    }
    
    // Posizione finale in percentuali
    const leftPercent = 50 + (finalX / size) * 100;
    const topPercent = 50 + (finalY / size) * 100;
    
    // Crea/aggiorna dot
    const dot = createOrUpdateEnemyDot(enemy);
    dot.style.left = `${leftPercent}%`;
    dot.style.top = `${topPercent}%`;
    
    // Fade basato su distanza
    const fadeDistance = radar.range * radar.config.fadeDistance;
    const opacity = distance > fadeDistance 
      ? mathUtils.lerp(0.8, 0.3, (distance - fadeDistance) / (radar.range - fadeDistance))
      : 0.8;
    
    dot.style.opacity = `${opacity}`;
    
    // Scala basata su minaccia/distanza
    const scale = mathUtils.lerp(1.2, 0.8, distance / radar.range);
    const currentTransform = dot.style.transform.replace(/scale\([^)]*\)/, '');
    dot.style.transform = `${currentTransform} scale(${scale})`;
    
    activeDots.add(dot);
  }
  
  // Rimuovi dots orfani con animazione
  for (const [enemy, dot] of radar.dotMap.entries()) {
    if (!activeDots.has(dot)) {
      // Animazione di scomparsa
      dot.style.transition = 'all 0.3s ease';
      dot.style.opacity = '0';
      dot.style.transform = dot.style.transform.replace(/scale\([^)]*\)/, '') + ' scale(0)';
      
      setTimeout(() => {
        dot.remove();
        radar.dotMap.delete(enemy);
      }, 300);
    }
  }
  
  // --- AGGIORNA FRECCIA DIREZIONE ---
  if (radar.headingArrow) {
    radar.headingArrow.style.transform = `translate(-50%, -60%) rotate(${-yawDegrees}deg)`;
    radar.headingArrow.setAttribute('aria-label', `Direzione: ${mathUtils.getCardinalDirection(yawDegrees)}`);
  }
  
  // --- AGGIORNA BUSSOLA ---
  if (elements.compass) {
    const cardinalDirection = mathUtils.getCardinalDirection(yawDegrees);
    if (elements.compass.textContent !== cardinalDirection) {
      elements.compass.textContent = cardinalDirection;
      animations.pulseElement(elements.compass, 1.1, 300);
    }
  }
}

// Sistema notifiche avanzato
const notificationSystem = {
  queue: [],
  maxVisible: 5,
  types: {
    info: { icon: 'ℹ️', className: 'notification-info', duration: 4000 },
    success: { icon: '✅', className: 'notification-success', duration: 3000 },
    warning: { icon: '⚠️', className: 'notification-warning', duration: 5000 },
    error: { icon: '❌', className: 'notification-error', duration: 6000 },
    levelup: { icon: '🎉', className: 'notification-levelup', duration: 4000 }
  },
  
  show(text, type = 'info', options = {}) {
    if (!elements.notificationArea) return;
    
    const config = this.types[type] || this.types.info;
    const notification = document.createElement('div');
    
    notification.className = `notification ${config.className}`;
    notification.innerHTML = `
      <span class="notification-icon">${config.icon}</span>
      <span class="notification-text">${text}</span>
    `;
    
    // Stili avanzati
    notification.style.cssText = `
      transform: translateX(-100%);
      opacity: 0;
      margin-bottom: 8px;
    `;
    
    elements.notificationArea.appendChild(notification);
    
    // Animazione entrata
    requestAnimationFrame(() => {
      notification.style.transition = 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
      notification.style.transform = 'translateX(0)';
      notification.style.opacity = '1';
    });
    
    // Rimozione automatica
    const duration = options.duration || config.duration;
    setTimeout(() => {
      this.remove(notification);
    }, duration);
    
    // Limita numero notifiche visibili
    this.cleanup();
    
    return notification;
  },
  
  remove(notification) {
    if (!notification || !notification.parentNode) return;
    
    notification.style.transition = 'all 0.3s ease';
    notification.style.transform = 'translateX(-100%)';
    notification.style.opacity = '0';
    notification.style.marginBottom = '0';
    notification.style.maxHeight = '0';
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  },
  
  cleanup() {
    if (!elements.notificationArea) return;
    
    const notifications = elements.notificationArea.querySelectorAll('.notification');
    if (notifications.length > this.maxVisible) {
      for (let i = 0; i < notifications.length - this.maxVisible; i++) {
        this.remove(notifications[i]);
      }
    }
  }
};

// Sistema prompt interazione migliorato
const interactionSystem = {
  currentPrompt: null,
  isVisible: false,
  
  show(key = 'E', text = 'Interagisci', options = {}) {
    if (!elements.promptBox || !elements.promptKey || !elements.promptText) return;
    
    // Aggiorna contenuto
    elements.promptKey.textContent = key.toUpperCase();
    elements.promptText.textContent = text;
    
    // Configura stili opzionali
    if (options.color) {
      elements.promptBox.style.borderLeftColor = options.color;
    }
    
    if (options.urgent) {
      elements.promptBox.classList.add('urgent');
      animations.pulseElement(elements.promptBox, 1.1, 400);
    }
    
    // Mostra con animazione
    if (!this.isVisible) {
      elements.promptBox.hidden = false;
      elements.promptBox.style.transform = 'translate(-50%, -20px)';
      elements.promptBox.style.opacity = '0';
      
      requestAnimationFrame(() => {
        elements.promptBox.style.transition = 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
        elements.promptBox.style.transform = 'translate(-50%, 0)';
        elements.promptBox.style.opacity = '1';
      });
      
      this.isVisible = true;
    }
    
    this.currentPrompt = { key, text, options };
  },
  
  hide() {
    if (!elements.promptBox || !this.isVisible) return;
    
    elements.promptBox.style.transition = 'all 0.25s ease';
    elements.promptBox.style.transform = 'translate(-50%, -20px)';
    elements.promptBox.style.opacity = '0';
    
    setTimeout(() => {
      elements.promptBox.hidden = true;
      elements.promptBox.classList.remove('urgent');
      this.isVisible = false;
      this.currentPrompt = null;
    }, 250);
  },
  
  pulse() {
    if (this.isVisible && elements.promptBox) {
      animations.pulseElement(elements.promptBox, 1.05, 200);
    }
  }
};

// Sistema aggiornamento barre vita avanzato
const vitalsSystem = {
  lastValues: { health: -1, mana: -1, stamina: -1, xp: -1 },
  
  updateBar(type, current, max, options = {}) {
    const barElement = elements[`${type}Bar`];
    const textElement = elements[`${type}Text`];
    
    if (!barElement || !textElement) return;
    
    const percentage = (current / max) * 100;
    const lastValue = this.lastValues[type];
    
    // Aggiorna testo
    textElement.textContent = `${Math.round(current)} / ${Math.round(max)}`;
    
    // Anima barra se valore è cambiato
    if (lastValue !== percentage) {
      // Animazione smooth della larghezza
      animations.animateValue(
        lastValue >= 0 ? lastValue : percentage,
        percentage,
        300,
        (value) => {
          barElement.style.width = `${Math.max(0, value)}%`;
        }
      );
      
      // Feedback visivo per cambiamenti significativi
      const change = percentage - lastValue;
      if (Math.abs(change) > 5) {
        if (change > 0) {
          // Guarigione/recupero
          animations.pulseElement(barElement, 1.05, 400);
        } else {
          // Danno/perdita
          animations.shakeElement(barElement.parentElement, 3, 300);
        }
      }
      
      // Effetti critici
      if (type === 'health' && percentage < 25) {
        barElement.classList.add('critical');
        if (percentage < 15) {
          barElement.style.animation = 'healthCritical 1s infinite';
        }
      } else {
        barElement.classList.remove('critical');
        barElement.style.animation = '';
      }
      
      this.lastValues[type] = percentage;
    }
    
    // Aggiorna attributi accessibilità
    const container = barElement.parentElement;
    if (container && container.getAttribute('role') === 'progressbar') {
      container.setAttribute('aria-valuenow', Math.round(percentage));
    }
  }
};

// Export del modulo principale
export const hudManager = {
  // Inizializzazione
  init() {
    console.log('[HUD] Inizializzazione sistema HUD avanzato...');
    
    // Cache elementi DOM
    Object.assign(elements, {
      // Pills minimap
      mmEnemies: $('mm-enemies'),
      mmTime: $('mm-time'),
      mmCoords: $('mm-coords'),
      mmLevel: $('mm-level'),
      
      // Sistema notifiche e prompt
      notificationArea: $('notifications'),
      promptBox: $('interaction-prompts'),
      promptKey: $('interaction-key'),
      promptText: $('interaction-text'),
      
      // Barre progresso
      healthBar: $('health-bar'),
      healthText: $('health-text'),
      manaBar: $('mana-bar'),
      manaText: $('mana-text'),
      staminaBar: $('stamina-bar'),
      staminaText: $('stamina-text'),
      xpBar: $('xp-bar'),
      xpText: $('xp-text')
    });
    
    // Inizializza sottosistemi
    initializeRadarSystem();
    
    // Configurazione iniziale
    radar.range = 120;
    
    console.log('[HUD] Sistema inizializzato con successo');
    return true;
  },
  
  // Aggiornamento principale
  update(player, controller, camera, enemies = [], gameState = {}) {
    try {
      // Aggiorna coordinate
      if (elements.mmCoords && player?.model) {
        const pos = player.model.position;
        const coordText = `📍 ${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}`;
        if (elements.mmCoords.textContent !== coordText) {
          elements.mmCoords.textContent = coordText;
          animations.pulseElement(elements.mmCoords, 1.02, 200);
        }
      }
      
      // Aggiorna contatore nemici
      if (elements.mmEnemies && player?.model && enemies?.length) {
        const playerPos = player.model.position;
        const nearEnemies = enemies.filter(e => 
          e?.model?.position?.distanceTo?.(playerPos) < 80
        ).length;
        
        const enemyText = `🎯 ${nearEnemies}`;
        if (elements.mmEnemies.textContent !== enemyText) {
          elements.mmEnemies.textContent = enemyText;
          if (nearEnemies > 0) {
            animations.pulseElement(elements.mmEnemies, 1.1, 300);
          }
        }
      }
      
      // Orologio di gioco simulato
      if (elements.mmTime) {
        const gameTime = (performance.now() / 1000);
        const minutes = Math.floor(gameTime % 60).toString().padStart(2, '0');
        const hours = (6 + Math.floor((gameTime / 60) % 24)).toString().padStart(2, '0');
        const timeText = `⏰ ${hours}:${minutes}`;
        
        if (elements.mmTime.textContent !== timeText) {
          elements.mmTime.textContent = timeText;
        }
      }
      
      // Aggiorna sistema radar
      updateRadarSystem(player, enemies, camera);
      
      // Aggiorna statistiche vitali se presenti
      if (gameState.vitals) {
        const { health, mana, stamina, xp } = gameState.vitals;
        if (health) vitalsSystem.updateBar('health', health.current, health.max);
        if (mana) vitalsSystem.updateBar('mana', mana.current, mana.max);
        if (stamina) vitalsSystem.updateBar('stamina', stamina.current, stamina.max);
        if (xp) vitalsSystem.updateBar('xp', xp.current, xp.max);
      }
      
    } catch (error) {
      console.error('[HUD] Errore durante aggiornamento:', error);
    }
  },
  
  // API pubblica per notifiche
  showNotification: (text, type, options) => notificationSystem.show(text, type, options),
  
  // API pubblica per prompt interazione
  showPrompt: (key, text, options) => interactionSystem.show(key, text, options),
  hidePrompt: () => interactionSystem.hide(),
  pulsePrompt: () => interactionSystem.pulse(),
  
  // API per aggiornamento statistiche
  updateVitals: (vitals) => {
    Object.entries(vitals).forEach(([type, data]) => {
      if (data && typeof data.current === 'number' && typeof data.max === 'number') {
        vitalsSystem.updateBar(type, data.current, data.max);
      }
    });
  },
  
  // Utility per animazioni
  animations,
  
  // Accesso ai sottosistemi
  getRadarConfig: () => radar.config,
  setRadarRange: (range) => { radar.range = Math.max(50, Math.min(300, range)); }
};