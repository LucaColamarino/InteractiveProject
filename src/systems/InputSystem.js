import * as THREE from 'three';
import { interactionManager } from './interactionManager.js';
import { gameManager } from '../managers/gameManager.js';
import { toggleInventory, isInventoryOpen } from '../ui/inventoryUi.js';
import { refreshInventoryUI } from '../ui/inventoryBridge.js';
import {
  focusNearestEnemy,
  isLockOn,
  clearLockOn,
  isCinematicFocus,
  clearCameraFocus,
  getLockHeadingYaw
} from '../player/cameraFollow.js';
import { isCampfireMenuOpen } from '../ui/hudCampfireMenu.js';
import { camera, renderer } from '../scene.js';

function isMenuOpen() {
  try { return !!gameManager.menu?.isVisible?.() || isCampfireMenuOpen() } catch { return false; }
}

//STATE
let _controller = null;
let _isSetup = false;

// Camera / look
let _yawDeg = 0;
let _pitchDeg = 15;
let _lookSensitivity = 0.10;
let _pitchMin = -60, _pitchMax = 60;
// Pointer lock
let _pointerLocked = false;
let _suppressNextAttack = false;
let _plReqInFlight = false; 
// Movement
const _moveVec = new THREE.Vector3();  // input vec (relative to camera)
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _pressed = new Set();            // KeyW, KeyA, ...
let _isShift = false;
let _isJump = false;
// Dirty flags
let _moveDirty = true;  // ricomputa _moveVec
let _yawDirty  = true;  // aggiorna basi fwd/right solo quando serve
// ======= Helpers =======
function _updateBasisFromYaw(yawDeg = _yawDeg) {
  const yawRad = THREE.MathUtils.degToRad(yawDeg);
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
  let yawForMove = _yawDeg;
  if (isLockOn()) {
    const y = getLockHeadingYaw(_controller?.player);
    if (typeof y === 'number') yawForMove = y;
  }
  _updateBasisFromYaw(yawForMove);
  _moveVec.set(0, 0, 0);
  if (isLockOn()) {
    if (_pressed.has('KeyW')) _moveVec.add(_fwd);
    if (_pressed.has('KeyS')) _moveVec.sub(_fwd);
    if (_pressed.has('KeyD')) _moveVec.sub(_right);
    if (_pressed.has('KeyA')) _moveVec.add(_right);
  } else {
    if (_pressed.has('KeyW')) _moveVec.sub(_fwd);
    if (_pressed.has('KeyS')) _moveVec.add(_fwd);
    if (_pressed.has('KeyD')) _moveVec.add(_right);
    if (_pressed.has('KeyA')) _moveVec.sub(_right);
  }
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
  if (isInventoryOpen?.() || isMenuOpen()) return; 
  if (document.pointerLockElement === c) return;
  if (_plReqInFlight) return;

  _plReqInFlight = true;
  setTimeout(() => {
    try {
      c.requestPointerLock?.({ unadjustedMovement: true });
    } catch {
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
    if (c) c.style.cursor = 'none';
  } else {
    // (pressed ESC)
    c?.focus();
    if (c) c.style.cursor = 'crosshair';
    if (wasLocked && !gameManager.campfiremenu && !gameManager.paused && !isInventoryOpen?.()) {
      gameManager.menu.toggleMenu();
    }
    _suppressNextAttack = true;
  }
}
function _onPointerLockError() {
  _pointerLocked = false;
}
// ======= Events =======
function _onKeyDown(e) {
  if (isInventoryOpen?.() && e.code !== 'KeyG' && e.code !== 'Escape') return;
  if (isMenuOpen()) return;
  switch (e.code) {
    case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD':
      if (!_pressed.has(e.code)) { _pressed.add(e.code); _moveDirty = true; }
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      if (!_isShift) _isShift = true;
      break;
    case 'Space':
      if (_isCanvasFocused()) e.preventDefault();
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
  if (isInventoryOpen?.() || isMenuOpen()) return;
  if (!_pointerLocked && _isCanvasEvent(e)) {
    _requestPointerLock();
    return;
  }
  if (e.button === 0) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
    _controller?.attack?.();
  } else if (e.button === 2) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
    _controller?.blockStart?.();
  } else if (e.button === 1) {
    if (isCinematicFocus()) {
      clearCameraFocus();
    }
    if (isLockOn()) {
      clearLockOn();
    } else {
      focusNearestEnemy(_controller?.player);
    }
  }
}
function _onMouseMove(e) {
  if (!_pointerLocked || isMenuOpen()) return;
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
function _onMouseUp(_e) {
  if (_e.button === 2) {
    if (_suppressNextAttack) { _suppressNextAttack = false; return; }
    if (isMenuOpen()) return;
    _controller?.blockEnd?.();
  }
}
// ======= Bootstrap =======
export function setupInput() {
  if (_isSetup) return;
  _isSetup = true;
  window.addEventListener('keydown', _onKeyDown, { passive: false });
  window.addEventListener('keyup', _onKeyUp, { passive: true });
  window.addEventListener('mousedown', _onMouseDown, { passive: true });
  window.addEventListener('mouseup', _onMouseUp, { passive: true });
  window.addEventListener('mousemove', _onMouseMove, { passive: true });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.addEventListener('blur', () => {
    _pressed.clear();
    _isShift = _isJump = false;
    _moveDirty = true;
  });
  document.addEventListener('pointerlockchange', _onPointerLockChange);
  document.addEventListener('pointerlockerror', _onPointerLockError);
  const c = _canvasEl();
  if (c) {
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.style.cursor = 'crosshair';
    c.title = 'Click per entrare in mouse-lock (ESC per uscire)';
    c.addEventListener('mousedown', () => c.focus?.(), { passive: true });
    c.tabIndex = c.tabIndex || 0;
  }
}
// ======= Pump =======
export function pumpActions(controller) {
  _controller = controller ?? gameManager.controller ?? null;
  if (isInventoryOpen?.() || isMenuOpen()) {
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