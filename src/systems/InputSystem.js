// systems/InputSystem.js
import * as THREE from 'three';
import { interactionManager } from './interactionManager.js';
import { gameManager } from '../managers/gameManager.js';
import { toggleInventory, isInventoryOpen } from '../ui/inventoryUi.js';
import { refreshInventoryUI } from '../ui/inventoryBridge.js';

// ======= State =======
let _controller = null;
let _isSetup = false;

// Camera / look
let _yawDeg = 0;        // gradi
let _pitchDeg = 15;     // gradi
let _lookSensitivity = 0.10; // gradi/pixel
let _pitchMin = -60, _pitchMax = 60;

// Pointer lock
let _pointerLocked = false;
let _suppressNextAttack = false; // evita attacco sul click che ha chiesto il lock

// Movimento
const _moveVec = new THREE.Vector3();       // riusato
const _fwd = new THREE.Vector3();           // scratch
const _right = new THREE.Vector3();         // scratch
const _pressed = new Set();                 // tasti premuti (KeyW, KeyA, ...)
let _isShift = false;
let _isJump = false;

// Dirty flags
let _moveDirty = true;  // se true, ricomputa _moveVec
let _yawDirty  = true;  // per evitare sin/cos ad ogni frame

// ======= Helpers =======
const _key = (e) => e.code;

// Recompute direzioni in base allo yaw
function _updateBasisFromYaw() {
  const yawRad = THREE.MathUtils.degToRad(_yawDeg);
  // camera forward “guardando” lungo +Z (classico TPS)
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

// ======= Events =======
function _onKeyDown(e) {
  // Se l'inventario è aperto, ignora TUTTO tranne G/Escape
  if (isInventoryOpen?.() && e.code !== 'KeyG' && e.code !== 'Escape') return;

  switch (e.code) {
    case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
      if (!_pressed.has(e.code)) { _pressed.add(e.code); _moveDirty = true; }
      break;

    case 'ShiftLeft':
    case 'ShiftRight':
      if (!_isShift) { _isShift = true; }
      break;

    case 'Space':
      // Evita scroll pagina quando il canvas è attivo
      if (_isCanvasFocused()) e.preventDefault();
      _isJump = true;
      _controller?.jumpOrFly();
      break;

    case 'KeyE':
      interactionManager.tryInteract(gameManager.controller);
      break;
    case 'KeyQ':
      if (_suppressNextAttack) { _suppressNextAttack = false; return; }
      _controller?.specialAttack?.();
      break;

    case 'KeyG':
      refreshInventoryUI();
      toggleInventory();
      // all’apertura inventario blocca movimento corrente
      _moveVec.set(0, 0, 0);
      break;

    case 'Escape':
      _escape();
      break;

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
  if (!_pointerLocked && _isCanvasEvent(e)) {
    _requestPointerLock();
    return;
  }
  if (e.button === 0) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
    _controller?.baseAttack?.();
  }else if (e.button === 2) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
    _controller?.secondAttack?.();
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
function _requestPointerLock() {
  const c = _canvasEl();
  if (!c) return;
  if (isInventoryOpen?.()) return;
  if (document.pointerLockElement === c) return;
  c.requestPointerLock?.({ unadjustedMovement: true });
}
function _onPointerLockChange() {
  const c = _canvasEl();
  _pointerLocked = (document.pointerLockElement === c);
  // se si esce con ESC: evita attacco al prossimo click
  if (!_pointerLocked) _suppressNextAttack = true;
  if (c) c.style.cursor = _pointerLocked ? 'none' : 'crosshair';
}
function _onPointerLockError() {
  _pointerLocked = false;
}
export function setupInput() {
  if (_isSetup) return;
  _isSetup = true;
  window.addEventListener('keydown', _onKeyDown, { passive: false });
  window.addEventListener('keyup', _onKeyUp, { passive: true });
  window.addEventListener('mousedown', _onMouseDown, { passive: true });
  window.addEventListener('mouseup', _onMouseUp, { passive: true });
  window.addEventListener('mousemove', _onMouseMove, { passive: true });
  window.addEventListener('blur', () => {
    _pressed.clear();
    _isShift = _isJump = false;
    _moveDirty = true;
  });
  window.addEventListener('resize', () => {window.dispatchEvent(new Event('game:resize'));});
  document.addEventListener('pointerlockchange', _onPointerLockChange);
  document.addEventListener('pointerlockerror', _onPointerLockError);
  const c = _canvasEl();
  if (c) {
    c.style.cursor = 'crosshair';
    c.title = 'Click per entrare in modalità mouse‑lock (ESC per uscire)';
    c.addEventListener('mousedown', () => c.focus?.(), { passive: true });
    c.tabIndex = c.tabIndex || 0;
  }
}
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


export function getCameraAngles() { return { yaw: _yawDeg, pitch: _pitchDeg }; }
export function setCameraAngles({ yaw = _yawDeg, pitch = _pitchDeg } = {}) {
  _yawDeg = yaw; _pitchDeg = pitch;
  _yawDirty = true; _moveDirty = true;
}

export function isPointerLocked() { return _pointerLocked; }

// Facile toggle/aggiornamento dei parametri di look
export function setLookOptions({ sensitivity, pitchMin, pitchMax } = {}) {
  if (typeof sensitivity === 'number') _lookSensitivity = sensitivity;
  if (typeof pitchMin === 'number') _pitchMin = pitchMin;
  if (typeof pitchMax === 'number') _pitchMax = pitchMax;
}

// ======= Pause / Resume =======
function _escape() {
  if (!gameManager.running) return;
  gameManager.paused = !gameManager.paused;

  if (gameManager.paused) {
    gameManager.menu.openPause?.();
    document.exitPointerLock?.();
    window.dispatchEvent(new Event('game:pause'));
  } else {
    gameManager.menu.show?.(false);
    _requestPointerLock(); // rientra nel lock se possibile
    window.dispatchEvent(new Event('game:resume'));
  }
}
