// /src/loading.js — Soulslike Loading Controller (smooth progress + messages)
import { createGameManager } from './managers/gameManager.js';

// Avvio game manager (se serve farlo dopo il loading, sposta la chiamata fuori)
createGameManager();

console.log('[Loading] Inizializzazione sistema di caricamento...');

// ---- Stato interno ----
let isGameStarted = false;
let targetProgress = 0;      // obiettivo (0..100) impostato dalle update esterne
let shownProgress = 0;       // valore mostrato a schermo (lerp verso target)
let rafId = null;            // requestAnimationFrame id
let shownAt = 0;             // timestamp apertura loading
const MIN_SHOW_MS = 600;     // tempo minimo di visibilità per evitare flicker

// ---- Elementi DOM ----
const loadingScreen  = document.getElementById('loading-screen');
const progressFill   = document.getElementById('loading-progress');
const loadingMessage = document.getElementById('loading-message');
const loadingPercent = document.getElementById('loading-percent');

// ---- Utility ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function formatPct(v) {
  // Mostriamo interi (0–100) con %; se vuoi decimali: Math.round(v*10)/10
  return `${Math.round(v)}%`;
}

function tick() {
  // Ease verso il target (lerp non lineare: più vicino, più rallenta)
  const diff = targetProgress - shownProgress;
  if (Math.abs(diff) > 0.001) {
    // coeff dinamico: più lontano -> più veloce (entro limiti ragionevoli)
    const k = clamp(0.12 + Math.abs(diff) * 0.01, 0.12, 0.35);
    shownProgress += diff * k;
  } else {
    shownProgress = targetProgress;
  }

  // Aggiorna UI
  if (progressFill) {
    progressFill.style.width = `${clamp(shownProgress, 0, 100)}%`;
  }
  if (loadingPercent) {
    loadingPercent.textContent = formatPct(shownProgress);
  }

  // Se siamo arrivati a 100 e il gioco è da far partire, chiudi
  if (targetProgress >= 100 && shownProgress >= 99.7) {
    // Rispetta un minimo di permanenza a schermo
    const elapsed = now() - shownAt;
    if (elapsed >= MIN_SHOW_MS) {
      stopTicker();
      // diamo un attimo alla barra di completarsi visivamente
      setTimeout(() => hideLoadingScreen(), 500);
      return;
    }
  }

  rafId = requestAnimationFrame(tick);
}

function startTicker() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(tick);
}
function stopTicker() {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// ---- API esterna ----
/**
 * Aggiorna lo stato di caricamento.
 * @param {number} percent 0..100
 * @param {string} [message] Messaggio opzionale
 */
export function updateLoadingProgress(percent, message = '') {
  if (isGameStarted) return;

  targetProgress = clamp(percent, 0, 100);

  // Messaggio opzionale
  if (loadingMessage && message) {
    loadingMessage.textContent = message;
  }

  // Avvia animazione se non attiva
  startTicker();

  // Se chiamano direttamente con 100, lasciamo che il tick chiuda in smooth
  if (targetProgress >= 100) {
    // niente: tick gestisce la chiusura rispettando min show time
  }
}

/** Aggiorna **solo** il messaggio (non la percentuale) */
export function setLoadingMessage(message = '') {
  if (isGameStarted) return;
  if (loadingMessage) loadingMessage.textContent = message;
}

/** Mostra la schermata di loading (reset soft, nessun azzeramento forzato del target) */
export function showLoadingScreen() {
  // ri-mostro il loader e consento gli aggiornamenti
  isGameStarted = false;
  if (!loadingScreen) return;

  // reset visivo se stiamo riaprendo
  if (progressFill && shownProgress <= 0.1 && targetProgress <= 0.1) {
    progressFill.style.width = '0%';
  }
  if (loadingPercent) {
    loadingPercent.textContent = formatPct(shownProgress);
  }

  loadingScreen.style.display = 'flex';
  // rimuovo la classe hidden al frame successivo per fare il fade-in
  requestAnimationFrame(() => loadingScreen.classList.remove('hidden'));

  shownAt = now();
  startTicker();
}

/** Nasconde la schermata e segna il gioco come partito */
export function hideLoadingScreen() {
  if (!loadingScreen || isGameStarted) return;

  console.log('[Loading] Nascondendo schermata di caricamento...');
  isGameStarted = true;

  // Soft close (coerente con CSS "hidden")
  loadingScreen.classList.add('hidden');
  stopTicker();

  setTimeout(() => {
    if (loadingScreen) loadingScreen.style.display = 'none';
    console.log('[Loading] Schermata nascosta completamente');
  }, 500);
}

/**
 * Sospende la schermata (la nasconde) **senza** segnare il gioco come iniziato.
 * Utile se vuoi mostrare il menu o un pannello temporaneo durante il caricamento.
 */
export function suspendLoadingScreen() {
  if (!loadingScreen) return;
  loadingScreen.classList.add('hidden');
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 500);
}

// ---- Error handling globale (fallback elegante) ----
window.addEventListener('error', (e) => {
  console.error('[Loading] Errore globale:', e.error || e.message || e);
  if (!isGameStarted) {
    // Mostra un messaggio di errore coerente con la UI
    setLoadingMessage('Errore di caricamento — Riprova...');
    // facoltativo: colorare la barra con una classe (se vuoi definire .is-error nel CSS)
    // loadingScreen?.classList.add('is-error');
    // azzera in modo visivo
    targetProgress = 0;
    startTicker();
  }
});

// ---- Qualche helper opzionale, se vuoi pesare task in percentuali ----
// Esempio:
// const task = createWeightedTask(30); // peserà per +30% del totale
// task.update(50); // metà del suo task => +15% sul totale
// task.done();     // completa il task => +30% totale
export function createWeightedTask(weightPercent) {
  const weight = clamp(Number(weightPercent) || 0, 0, 100);
  let doneFrac = 0; // frazione 0..1 del task
  return {
    update(fracOrPercent) {
      const f = clamp(Number(fracOrPercent) <= 1 ? Number(fracOrPercent) : Number(fracOrPercent)/100, 0, 1);
      // calcola il contributo al target: (f - doneFrac) * weight
      const delta = (f - doneFrac) * weight;
      doneFrac = f;
      updateLoadingProgress(targetProgress + delta, undefined);
    },
    done(message) {
      const delta = (1 - doneFrac) * weight;
      doneFrac = 1;
      updateLoadingProgress(targetProgress + delta, message);
    }
  };
}

// ---- Avvio iniziale se il markup esiste ----
if (loadingScreen) {
  // Se la pagina nasce col loader visibile (index.html), fai un fade-in coerente
  if (getComputedStyle(loadingScreen).display !== 'none') {
    // Garantiamo che parta con progress a 0 visivo
    shownProgress = 0;
    targetProgress = 0;
    loadingPercent && (loadingPercent.textContent = formatPct(0));
    progressFill && (progressFill.style.width = '0%');
    shownAt = now();
    startTicker();
  }
}
