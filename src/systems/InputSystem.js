// systems/InputSystem.js
import * as THREE from 'three';
import { interactionManager } from './interactionManager.js';
import { gameManager } from '../managers/gameManager.js';
import { toggleInventory, isInventoryOpen } from '../ui/inventoryUi.js';
import { refreshInventoryUI } from '../ui/inventoryBridge.js';

let _controller = null;
let _isSetup = false;

// --- Camera / look state ---
let _yaw = 0;      // gradi
let _pitch = 15;   // gradi, clamp [-60, 60]
const _lockSensitivity  = 0.10;

// Pointer lock state
let _pointerLocked = false;
let _suppressNextAttack = false; // evita attack sul click che richiede il lock

// --- Input di movimento ---
const _moveVec = new THREE.Vector3();
let _pressW = false, _pressA = false, _pressS = false, _pressD = false;
let _isShift = false;
let _isJump = false;

// Helpers
function _recomputeMoveVec() {
  if (_controller?.isAttacking) {
    _moveVec.set(0, 0, 0);
    return;
  }

  // Movimento relativo alla camera (_yaw)
  const yawRad = THREE.MathUtils.degToRad(_yaw);
  const forward = new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));
  const right   = new THREE.Vector3(Math.cos(yawRad), 0, -Math.sin(yawRad));

  _moveVec.set(0, 0, 0);
  if (_controller?.isSitting) return;
  if (_pressW) _moveVec.sub(forward);
  if (_pressS) _moveVec.add(forward);
  if (_pressD) _moveVec.add(right);
  if (_pressA) _moveVec.sub(right);
}

function _onKeyDown(e) {
  // Se l'inventario è aperto, ignora i comandi di gioco eccetto G/Escape
  if (isInventoryOpen?.() && e.code !== 'KeyG' && e.code !== 'Escape') return;

  switch (e.code) {
    case 'KeyW': _pressW = true; break;
    case 'KeyA': _pressA = true; break;
    case 'KeyS': _pressS = true; break;
    case 'KeyD': _pressD = true; break;
    case 'ShiftLeft':
    case 'ShiftRight':
      _isShift = true;
      break;
    case 'Space':
      _isJump = true;
      _controller?.jumpOrFly();
      break;
    case 'KeyE':
      interactionManager.tryInteract(gameManager.controller);
      break;
    case 'KeyG':
      refreshInventoryUI();
      toggleInventory();
      break;
    case 'Escape':
      escape();
      break;
  }
  _recomputeMoveVec();
}

function _onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': _pressW = false; break;
    case 'KeyA': _pressA = false; break;
    case 'KeyS': _pressS = false; break;
    case 'KeyD': _pressD = false; break;

    case 'ShiftLeft':
    case 'ShiftRight':
      _isShift = false;
      break;

    case 'Space':
      _isJump = false;
      break;
  }
  _recomputeMoveVec();
}

function _onMouseDown(e) {
  if (isInventoryOpen?.()) return;
  if (!_pointerLocked && _isCanvasEvent(e)) {_requestPointerLock();return;}
  // sinistro: attacco
  if (e.button === 0) {
    if (_suppressNextAttack) {
      _suppressNextAttack = false;
      return;
    }
    _controller?.attack();
  }
}

function _onMouseUp(_e) {
  // nessuna gestione del destro: orbit fallback rimosso
}

function _onMouseMove(e) {
  if (_pointerLocked) {
    const dx = e.movementX || 0;
    const dy = -e.movementY || 0;
    _yaw   = (_yaw   - dx * _lockSensitivity) % 360;
    _pitch = THREE.MathUtils.clamp(_pitch - dy * _lockSensitivity, -60, 60);
  }
}

// --- Pointer Lock wiring ---
function _canvasEl() {
  return /** @type {HTMLElement|null} */ (document.getElementById('three-canvas')) || null;
}
function _isCanvasEvent(e) {
  const c = _canvasEl();
  return c && (e.target === c || c.contains(e.target));
}

function _requestPointerLock() {
  const c = _canvasEl();
  if (!c) return;
  // non chiedere lock se inventario aperto o già lockato
  if (isInventoryOpen?.() || document.pointerLockElement === c) return;
    c.requestPointerLock?.({ unadjustedMovement: true });

}

function _onPointerLockChange() {
  const c = _canvasEl();
  _pointerLocked = (document.pointerLockElement === c);
  // Se si esce col tasto ESC, evita attacco immediato al click successivo
  if (!_pointerLocked) _suppressNextAttack = true;

  // feedback cursore
  if (c) c.style.cursor = _pointerLocked ? 'none' : 'crosshair';
}

function _onPointerLockError() {
  // zittisci l'errore legacy; loggare non serve
  _pointerLocked = false;
}

// --- API pubblica ---
export function setupInput() {
  if (_isSetup) return;
  _isSetup = true;

  window.addEventListener('keydown', _onKeyDown);
  window.addEventListener('keyup', _onKeyUp);
  window.addEventListener('mousedown', _onMouseDown);
  window.addEventListener('mouseup', _onMouseUp);
  window.addEventListener('mousemove', _onMouseMove);

  document.addEventListener('pointerlockchange', _onPointerLockChange);
  document.addEventListener('pointerlockerror', _onPointerLockError);

  // reset tasti quando la finestra perde focus (evita tasti "bloccati")
  window.addEventListener('blur', () => {
    _pressW = _pressA = _pressS = _pressD = false;
    _isShift = _isJump = false;
    _recomputeMoveVec();
  });

  window.addEventListener('resize', () => {
    window.dispatchEvent(new Event('game:resize'));
  });

  // Tooltip minimo opzionale:
  const c = _canvasEl();
  if (c) {
    c.style.cursor = 'crosshair';
    c.title = 'Click per entrare in modalità mouse-lock (ESC per uscire)';
  }
}

/**
 * Chiamato ogni frame dal gameLoop: collega il controller corrente e gli passa lo stato di input.
 * Ritorna gli angoli camera per chi li usa (cameraFollow).
 */
export function pumpActions(controller) {
  _controller = controller ?? gameManager.controller ?? null;

  if (isInventoryOpen?.()) {
    _moveVec.set(0, 0, 0);
  }

  _controller?.setInputState?.({
    moveVec: _moveVec,
    isShiftPressed: _isShift,
    isJumpPressed: _isJump,
  });

  return getCameraAngles();
}


export function getCameraAngles() {
  return { yaw: _yaw, pitch: _pitch };
}
export function setCameraAngles({ yaw = _yaw, pitch = _pitch } = {}) {
  _yaw = yaw;
  _pitch = pitch;
}

export function isPointerLocked() {
  return _pointerLocked;
}

function escape() {
  if (!gameManager.running) return;

  gameManager.paused = !gameManager.paused;
  if (gameManager.paused) {
    gameManager.menu.openPause?.();
    document.exitPointerLock?.();
    window.dispatchEvent(new Event('game:pause'));
  } else {
    gameManager.menu.show?.(false);
    // rientra nel lock in modo sicuro (non se inventario aperto)
    _requestPointerLock();
    window.dispatchEvent(new Event('game:resume'));
  }
}
