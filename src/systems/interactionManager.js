// systems/interactionManager.js
import * as THREE from 'three';
import { hudManager } from '../ui/hudManager.js';

const _registry = new Set();
/** config */
const MAX_RADIUS = 2.2;         // raggio di interazione
const HYSTERESIS = 0.35;        // evita flicker del focus
const COOLDOWN_SEC = 0.35;      // anti-spam sull'interact

let _focused = null;
let _lastInteractAt = -Infinity;
const _tmpV = new THREE.Vector3();

/** ==== API Pubblica ==== */
export const interactionManager = {
  /** Registra un oggetto “interactable” */
  register(interactable) { _registry.add(interactable); },
  /** Deregistra (rimozione dalla scena) */
  unregister(interactable) { _registry.delete(interactable); },

  /** Aggiorna focus + HUD. Call ogni frame dal gameLoop. */
  update(player, dt) {
    if (!player?.model) { _clearFocus(); return; }
    const playerPos = player.model.position;

    // Trova il migliore entro raggio
    let best = null; let bestD2 = (MAX_RADIUS + (_focused ? HYSTERESIS : 0)) ** 2;

    for (const it of _registry) {
      const pos = it.getWorldPosition?.(_tmpV) ?? null;
      if (!pos) continue;
      const d2 = pos.distanceToSquared(playerPos);
      if (d2 <= bestD2 && (it.canInteract?.(player) ?? true)) {
        best = it; bestD2 = d2;
      }
    }

    // Focus management + HUD
    if (best !== _focused) {
      _focused = best;
      if (_focused) {
        const { key = 'E', text = 'Interact' } = _focused.getPrompt?.(player) ?? {};
        hudManager.showPrompt(key, text);
      } else {
        _clearFocus();
      }
    } else if (_focused) {
      // refresh testo (es. “Sit / Stand” che cambia con stato)
      const { key = 'E', text = 'Interact' } = _focused.getPrompt?.(player) ?? {};
      hudManager.showPrompt(key, text);
    }
  },

  /** Chiamare quando l’utente preme il tasto di interact */
  tryInteract(player) {
    console.log("try interact");
    const now = performance.now() / 1000;
    if (now - _lastInteractAt < COOLDOWN_SEC) return false;
    if (!_focused) return false;
    if (!(_focused.canInteract?.(player) ?? true)) return false;

    _lastInteractAt = now;
    _focused.onInteract?.(player);
    return true;
  },

  /** Forza clear del focus (quando cambi scena, ecc.) */
  clear() { _clearFocus(); },
};

function _clearFocus() {
  _focused = null;
  hudManager.hidePrompt?.();
}
