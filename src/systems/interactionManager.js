import * as THREE from 'three';
import { hudManager } from '../ui/hudManager.js';
import { gameManager } from '../managers/gameManager.js';

const _registry = new Set();
const MAX_RADIUS = 2.2;        
const HYSTERESIS = 0.35;      
const COOLDOWN_SEC = 0.35;
let _focused = null;
let _lastInteractAt = -Infinity;
const _tmpV = new THREE.Vector3();
/** ====Public API ==== */
export const interactionManager = {
  register(interactable) { _registry.add(interactable);_clearFocus(); },
  unregister(interactable) { _registry.delete(interactable);_clearFocus(); },
  update() {
    const controller = gameManager.controller;
    const player = controller?.player;
    if (!player?.model) { _clearFocus(); return; }
    const playerPos = player.model.position;
    let best = null; let bestD2 = (MAX_RADIUS + (_focused ? HYSTERESIS : 0)) ** 2;
    for (const it of _registry) {
      const pos = it.getWorldPosition?.(_tmpV) ?? null;
      if (!pos) continue;
      const d2 = pos.distanceToSquared(playerPos);
      if (d2 <= bestD2 && (it.canInteract?.(player) ?? true)) {
        best = it; bestD2 = d2;
      }
    }
    // Focus + HUD
    if (best !== _focused) {
      _focused = best;
      if (_focused) {
        const { key = 'E', text = 'Interact' } = _focused.getPrompt?.(controller) ?? {};
        hudManager.showPrompt(key, text);
      } else {
        _clearFocus();
      }
    } else if (_focused) {
      const { key = 'E', text = 'Interact' } = _focused.getPrompt?.(controller) ?? {};
      hudManager.showPrompt(key, text);
    }
  },
  tryInteract(controller) {
    const now = performance.now() / 1000;
    if (now - _lastInteractAt < COOLDOWN_SEC) return false;
    if (!_focused) return false;
    if (!(_focused.canInteract?.(controller) ?? true)) return false;
    _lastInteractAt = now;
    _focused.onInteract?.(controller);
    return true;
  },
  clear() { _clearFocus(); },
};
function _clearFocus() {
  _focused = null;
  hudManager.hidePrompt?.();
}
