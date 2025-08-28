
import { createGameManager } from './managers/gameManager.js';
createGameManager();
console.log('[Loading] Inizializzazione sistema di caricamento...');
let loadingProgress = 0;
let isGameStarted = false;
// Elementi DOM
const loadingScreen = document.getElementById('loading-screen');
const progressFill  = document.getElementById('loading-progress'); // CORRETTO
const loadingMessage = document.getElementById('loading-message');
const loadingPercent = document.getElementById('loading-percent'); // per il testo

export function updateLoadingProgress(percent, message = '') {
    if (isGameStarted) return;

    loadingProgress = Math.min(100, Math.max(0, percent));

    console.log(`[Loading] Progress: ${loadingProgress}% - ${message}`);

    // Aggiorna barra grafica
    if (progressFill) {
        progressFill.style.width = loadingProgress + '%';
    }

    // Aggiorna testo percentuale
    if (loadingPercent) {
        loadingPercent.textContent = loadingProgress + '%';
    }

    // Aggiorna messaggio
    if (loadingMessage && message) {
        loadingMessage.textContent = message;
    }

    if (loadingProgress >= 100) {
        setTimeout(() => hideLoadingScreen(), 800);
    }
}
export function hideLoadingScreen() {
    if (!loadingScreen || isGameStarted) return;
    
    console.log('[Loading] Nascondendo schermata di caricamento...');
    isGameStarted = true;
    
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        console.log('[Loading] Schermata nascosta completamente');
    }, 500);
}
// Event handlers per errori
window.addEventListener('error', (e) => {
    console.error('[Loading] Errore globale:', e.error);
    if (!isGameStarted) {
        updateLoadingProgress(0, 'Errore di caricamento - Riprova...');
    }
});

export function showLoadingScreen() {
    // ri-mostro il loader e consento gli aggiornamenti
    isGameStarted = false;
    if (!loadingScreen) return;
    loadingScreen.style.display = 'flex';
    // rimuovo la classe hidden al frame successivo per fare il fade-in
    requestAnimationFrame(() => loadingScreen.classList.remove('hidden'));
    }

export function suspendLoadingScreen() {
    // nasconde il loader senza segnare il gioco come "iniziato"
    if (!loadingScreen) return;
    loadingScreen.classList.add('hidden');
    setTimeout(() => {
        loadingScreen.style.display = 'none';
    }, 500);
    }

  