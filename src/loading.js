import { createGameManager } from './managers/gameManager.js';
createGameManager();
console.log('[Loading] Inizializzazione sistema di caricamento...');
let isGameStarted = false;
let targetProgress = 0;   
let shownProgress = 0;   
let rafId = null;           
let shownAt = 0;             
const MIN_SHOW_MS = 600;     
const loadingScreen  = document.getElementById('loading-screen');
const progressFill   = document.getElementById('loading-progress');
const loadingMessage = document.getElementById('loading-message');
const loadingPercent = document.getElementById('loading-percent');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function formatPct(v) {
  return `${Math.round(v)}%`;
}
function tick() {
  const diff = targetProgress - shownProgress;
  if (Math.abs(diff) > 0.001) {
    const k = clamp(0.12 + Math.abs(diff) * 0.01, 0.12, 0.35);
    shownProgress += diff * k;
  } else {
    shownProgress = targetProgress;
  }
  if (progressFill) {
    progressFill.style.width = `${clamp(shownProgress, 0, 100)}%`;
  }
  if (loadingPercent) {
    loadingPercent.textContent = formatPct(shownProgress);
  }
  if (targetProgress >= 100 && shownProgress >= 99.7) {
    const elapsed = now() - shownAt;
    if (elapsed >= MIN_SHOW_MS) {
      stopTicker();
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
/**
 * @param {number} percent
 * @param {string} [message] 
 */
export function updateLoadingProgress(percent, message = '') {
  if (isGameStarted) return;
  targetProgress = clamp(percent, 0, 100);
  if (loadingMessage && message) {
    loadingMessage.textContent = message;
  }
  startTicker();
}
export function showLoadingScreen() {
  isGameStarted = false;
  if (!loadingScreen) return;
  if (progressFill && shownProgress <= 0.1 && targetProgress <= 0.1) {
    progressFill.style.width = '0%';
  }
  if (loadingPercent) {
    loadingPercent.textContent = formatPct(shownProgress);
  }
  loadingScreen.style.display = 'flex';
  requestAnimationFrame(() => loadingScreen.classList.remove('hidden'));
  shownAt = now();
  startTicker();
}
export function hideLoadingScreen() {
  if (!loadingScreen || isGameStarted) return;
  console.log('[Loading] Nascondendo schermata di caricamento...');
  isGameStarted = true;
  loadingScreen.classList.add('hidden');
  stopTicker();
  setTimeout(() => {
    if (loadingScreen) loadingScreen.style.display = 'none';
  }, 500);
}
export function suspendLoadingScreen() {
  if (!loadingScreen) return;
  loadingScreen.classList.add('hidden');
  setTimeout(() => {
    loadingScreen.style.display = 'none';
  }, 500);
}
if (loadingScreen) {
  if (getComputedStyle(loadingScreen).display !== 'none') {
    shownProgress = 0;
    targetProgress = 0;
    loadingPercent && (loadingPercent.textContent = formatPct(0));
    progressFill && (progressFill.style.width = '0%');
    shownAt = now();
    startTicker();
  }
}
