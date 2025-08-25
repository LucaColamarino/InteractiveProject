// systems/InputSystem.js – ESC affidabile: in lock apri da pointerlockchange, fuori lock da keydown
import * as THREE from 'three';
import { interactionManager } from './interactionManager.js';
import { gameManager } from '../managers/gameManager.js';
import { toggleInventory, isInventoryOpen } from '../ui/inventoryUi.js';
import { refreshInventoryUI } from '../ui/inventoryBridge.js';

// ======= State =======
let _controller = null;
let _isSetup = false;

// Camera / look
let _yawDeg = 0;                 // gradi
let _pitchDeg = 15;              // gradi
let _lookSensitivity = 0.10;     // gradi per pixel
let _pitchMin = -60, _pitchMax = 60;

// Pointer lock
let _pointerLocked = false;
let _suppressNextAttack = false; // evita attacco sul click dopo l'uscita dal lock
let _plReqInFlight = false;      // evita SecurityError su richieste ravvicinate

// Movimento
const _moveVec = new THREE.Vector3();  // vettore input (relativo camera)
const _fwd = new THREE.Vector3();      // scratch
const _right = new THREE.Vector3();    // scratch
const _pressed = new Set();            // KeyW, KeyA, ...
let _isShift = false;
let _isJump = false;

// Dirty flags
let _moveDirty = true;  // ricomputa _moveVec
let _yawDirty  = true;  // aggiorna basi fwd/right solo quando serve

// ======= Helpers =======
function _updateBasisFromYaw() {
  const yawRad = THREE.MathUtils.degToRad(_yawDeg);
  // forward lungo +Z (TPS)
  _fwd.set(Math.sin(yawRad), 0, Math.cos(yawRad));
  _right.set(Math.cos(yawRad), 0, -Math.sin(yawRad));
  _yawDirty = false;
}

function _recomputeMoveVec() {
  if (_controller?.isAttacking || _controller?.isSitting) {
    _moveVec.set(0, 0, 0);
    _moveDirty = false;
    return;
  }
  if (_yawDirty) _updateBasisFromYaw();

  _moveVec.set(0, 0, 0);
  if (_pressed.has('KeyW')) _moveVec.sub(_fwd);
  if (_pressed.has('KeyS')) _moveVec.add(_fwd);
  if (_pressed.has('KeyD')) _moveVec.add(_right);
  if (_pressed.has('KeyA')) _moveVec.sub(_right);

  _moveDirty = false;
}

let _cachedCanvas = null;
function _canvasEl() {
  if (_cachedCanvas && document.body.contains(_cachedCanvas)) return _cachedCanvas;
  _cachedCanvas = /** @type {HTMLElement|null} */ (document.getElementById('three-canvas')) || null;
  return _cachedCanvas;
}
function _isCanvasEvent(e) {
  const c = _canvasEl();
  return !!(c && (e.target === c || c.contains(e.target)));
}
function _isCanvasFocused() {
  const c = _canvasEl();
  return !!(c && document.activeElement === c);
}



// ======= Pointer Lock =======
function _requestPointerLock() {
  const c = _canvasEl();
  if (!c) return;
  if (isInventoryOpen?.()) return;
  if (document.pointerLockElement === c) return;
  if (_plReqInFlight) return;

  _plReqInFlight = true;
  // piccola pausa per evitare SecurityError subito dopo ESC
  setTimeout(() => {
    try {
      c.requestPointerLock?.({ unadjustedMovement: true });
    } catch {
      // ignora eventuali errori
    } finally {
      _plReqInFlight = false;
    }
  }, 50);
}

function _onPointerLockChange() {
  const c = _canvasEl();
  const wasLocked = _pointerLocked;
  _pointerLocked = (document.pointerLockElement === c);

  if (_pointerLocked) {
    // siamo in lock
    if (c) c.style.cursor = 'none';
  } else {
    // siamo usciti dal lock (≈ utente ha premuto ESC)
    c?.focus();                           // non perdere focus
    if (c) c.style.cursor = 'crosshair';

    // apri il menu solo se non già in pausa e inventario chiuso
    if (wasLocked && !gameManager.paused && !isInventoryOpen?.()) {
      gameManager.menu.toggleMenu();
    }

    // evita click fantasma post-uscita
    _suppressNextAttack = true;
  }
}

function _onPointerLockError() {
  _pointerLocked = false;
}

// ======= Events =======
function _onKeyDown(e) {
  // Se l'inventario è aperto, ignora tutto tranne G/Escape
  if (isInventoryOpen?.() && e.code !== 'KeyG' && e.code !== 'Escape') return;

  switch (e.code) {
    case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
      if (!_pressed.has(e.code)) { _pressed.add(e.code); _moveDirty = true; }
      break;

    case 'ShiftLeft':
    case 'ShiftRight':
      if (!_isShift) _isShift = true;
      break;

    case 'Space':
      if (_isCanvasFocused()) e.preventDefault(); // evita scroll della pagina
      _isJump = true;
      _controller?.jumpOrFly?.();
      break;

    case 'KeyE':
      interactionManager.tryInteract?.(gameManager.controller);
      break;

    case 'KeyQ':
      if (_suppressNextAttack) { _suppressNextAttack = false; return; }
      _controller?.specialAttack?.();
      break;

    case 'KeyG':
      refreshInventoryUI?.();
      toggleInventory?.();
      // blocca movimento corrente quando apri l'inventario
      _moveVec.set(0, 0, 0);
      break;

    case 'Escape':
      gameManager.menu.toggleMenu();
      return;

    default: break;
  }
}

function _onKeyUp(e) {
  switch (e.code) {
    case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
      if (_pressed.delete(e.code)) _moveDirty = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      _isShift = false;
      break;
    case 'Space':
      _isJump = false;
      break;
    default: break;
  }
}

function _onMouseDown(e) {
  if (isInventoryOpen?.()) return;

  // se non in lock e click sul canvas → chiedi lock (il click non deve attaccare)
  if (!_pointerLocked && _isCanvasEvent(e)) {
    _requestPointerLock();
    return;
  }

  // Attacchi
  if (e.button === 0) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
    _controller?.attack?.();
  } else if (e.button === 2) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
   _controller?.block?.();
  }
}

function _onMouseMove(e) {
  if (!_pointerLocked) return;
  const dx = e.movementX || 0;
  const dy = -(e.movementY || 0);

  if (dx !== 0) {
    _yawDeg = (_yawDeg - dx * _lookSensitivity) % 360;
    _yawDirty = true;
    _moveDirty = true;
  }
  if (dy !== 0) {
    _pitchDeg = THREE.MathUtils.clamp(_pitchDeg - dy * _lookSensitivity, _pitchMin, _pitchMax);
  }
}
function _onMouseUp(_e) {}

// ======= Bootstrap =======
export function setupInput() {
  if (_isSetup) return;
  _isSetup = true;

  // Listener tastiera/mouse
  window.addEventListener('keydown', _onKeyDown, { passive: false });
  window.addEventListener('keyup', _onKeyUp, { passive: true });
  window.addEventListener('mousedown', _onMouseDown, { passive: true });
  window.addEventListener('mouseup', _onMouseUp, { passive: true });
  window.addEventListener('mousemove', _onMouseMove, { passive: true });

  // Reset input quando la finestra perde focus (niente stuck keys)
  window.addEventListener('blur', () => {
    _pressed.clear();
    _isShift = _isJump = false;
    _moveDirty = true;
  });

  document.addEventListener('pointerlockchange', _onPointerLockChange);
  document.addEventListener('pointerlockerror', _onPointerLockError);

  // Canvas QoL
  const c = _canvasEl();
  if (c) {
    // libera RMB per secondAttack
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.style.cursor = 'crosshair';
    c.title = 'Click per entrare in mouse‑lock (ESC per uscire)';
    c.addEventListener('mousedown', () => c.focus?.(), { passive: true });
    c.tabIndex = c.tabIndex || 0;
  }
}

// ======= Pump =======
export function pumpActions(controller) {
  _controller = controller ?? gameManager.controller ?? null;

  // se inventario aperto → stop movimento
  if (isInventoryOpen?.()) {
    if (_moveVec.lengthSq() !== 0) _moveVec.set(0, 0, 0);
  } else if (_moveDirty) {
    _recomputeMoveVec();
  }

  _controller?.setInputState?.({
    moveVec: _moveVec,
    isShiftPressed: _isShift,
    isJumpPressed: _isJump,
  });

  return getCameraAngles();
}

// ======= Camera API =======
export function getCameraAngles() { return { yaw: _yawDeg, pitch: _pitchDeg }; }
export function setCameraAngles({ yaw = _yawDeg, pitch = _pitchDeg } = {}) {
  _yawDeg = yaw; _pitchDeg = pitch;
  _yawDirty = true; _moveDirty = true;
}

// ======= Misc API =======
export function isPointerLocked() { return _pointerLocked; }
export function setLookOptions({ sensitivity, pitchMin, pitchMax } = {}) {
  if (typeof sensitivity === 'number') _lookSensitivity = sensitivity;
  if (typeof pitchMin === 'number') _pitchMin = pitchMin;
  if (typeof pitchMax === 'number') _pitchMax = pitchMax;
}
