// systems/InputSystem.js
import * as THREE from 'three';
import { interactionManager } from './interactionManager.js';
import { gameManager } from '../gameManager.js';

let _controller = null;
let _isSetup = false;

// --- Camera/orbit state ---
let _yaw = 0;      // gradi
let _pitch = 15;   // gradi, clamp [-60, 60]
const _orbitSensitivity = 0.15;
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
  // Movimento relativo alla camera (_yaw)
  const yawRad = THREE.MathUtils.degToRad(_yaw);
  const forward = new THREE.Vector3(Math.sin(yawRad), 0, Math.cos(yawRad));
  const right   = new THREE.Vector3(Math.cos(yawRad), 0, -Math.sin(yawRad));

  _moveVec.set(0, 0, 0);
  if (_pressW) _moveVec.sub(forward);
  if (_pressS) _moveVec.add(forward);
  if (_pressD) _moveVec.add(right);
  if (_pressA) _moveVec.sub(right);
}

function _onKeyDown(e) {
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
      _controller?.jumpOrFly()
      break;

    case 'KeyE':
      interactionManager.tryInteract(gameManager.player);
      break;

    case 'KeyC':
      _controller?.sitToggle()
      break;

    case 'Digit1':
      _controller?.attack('attack')
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

// Mouse: con pointer lock usiamo movementX/Y; senza, fallback a orbita tasto destro
let _isOrbiting = false;
let _lastMouseX = 0, _lastMouseY = 0;

function _onMouseDown(e) {
  // Click sul canvas: se non siamo lockati, richiedi lock e NON attaccare in questo click
  if (!_pointerLocked && _isCanvasEvent(e)) {
    _suppressNextAttack = true;
    _requestPointerLock();
    return;
  }

  if (e.button === 2) { // tasto destro → orbita senza lock
    _isOrbiting = true;
    _lastMouseX = e.clientX;
    _lastMouseY = e.clientY;
  } else if (e.button === 0) { // sinistro
    if (_suppressNextAttack) {
      _suppressNextAttack = false;
      return;
    }
    ActionBus.emit('attack_primary');
  }
}

function _onMouseUp(e) {
  if (e.button === 2) _isOrbiting = false;
}

function _onMouseMove(e) {
  if (_pointerLocked) {
    const dx = e.movementX || 0;
    const dy = -e.movementY || 0;
    _yaw   = (_yaw   - dx * _lockSensitivity) % 360;
    _pitch = THREE.MathUtils.clamp(_pitch - dy * _lockSensitivity, -60, 60);
    return;
  }

  // Fallback: orbita col tasto destro
  if (_isOrbiting) {
    const dx = e.clientX - _lastMouseX;
    const dy = e.clientY - _lastMouseY;
    _lastMouseX = e.clientX;
    _lastMouseY = e.clientY;

    _yaw   = (_yaw   - dx * _orbitSensitivity) % 360;
    _pitch = THREE.MathUtils.clamp(_pitch - dy * _orbitSensitivity, -60, 60);
  }
}

function _onContextMenu(e) {
  // Evita menu contestuale con tasto destro per orbita
  if (_isOrbiting || _isCanvasEvent(e)) e.preventDefault();
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
  const c = _canvasEl() || document.body;
  if (document.pointerLockElement === c) return;
  // Nota: alcune policy richiedono che la richiesta avvenga durante un input (click/tasto)
  c.requestPointerLock?.();
}

function _onPointerLockChange() {
  const c = _canvasEl() || document.body;
  _pointerLocked = (document.pointerLockElement === c);
  // Se si esce col tasto ESC, evita attacco immediato al click successivo
  if (!_pointerLocked) _suppressNextAttack = true;
}

function _onPointerLockError() {
  console.warn('[Input] Pointer Lock error');
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
  window.addEventListener('contextmenu', _onContextMenu);


  document.addEventListener('pointerlockchange', _onPointerLockChange);
  document.addEventListener('pointerlockerror', _onPointerLockError);
  window.addEventListener('resize', () => {
  window.dispatchEvent(new Event('game:resize'));
  });

  // Tooltip minimo opzionale:
  const c = _canvasEl();
  if (c) {
    c.style.cursor = 'crosshair';
    c.title = 'Click per entrare in modalità mouse‑lock (ESC per uscire)';
  }
}

/**
 * Chiamato ogni frame dal gameLoop: collega il controller corrente e gli passa lo stato di input.
 * Ritorna gli angoli camera per chi li usa (cameraFollow).
 */
export function pumpActions(controller) {
  _controller = gameManager.controller;
  if (_controller?.setInputState) {
    _controller.setInputState({
      moveVec: _moveVec,
      isShiftPressed: _isShift,
      isJumpPressed: _isJump,
    });
  }
  return getCameraAngles();
}

export function getCameraAngles() {
  return { yaw: _yaw, pitch: _pitch };
}

export function isPointerLocked() {
  return _pointerLocked;
}

function escape() {
    if (gameManager.running) {
      gameManager.paused = !gameManager.paused;
      if (gameManager.paused) {
        gameManager.menu.openPause();
        document.exitPointerLock?.();
        window.dispatchEvent(new Event('game:pause'));
      } else {
        gameManager.menu.show(false);
        document.querySelector('canvas')?.requestPointerLock?.();
        window.dispatchEvent(new Event('game:resume'));
      }
    }
}
