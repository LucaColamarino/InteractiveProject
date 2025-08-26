// npcController.js

import * as THREE from 'three';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { gameManager } from '../managers/gameManager.js';

const enemies = [];
const MAX_UPDATE_DISTANCE = 250;

export function registerEnemy(enemy) {
  // Assicurati che ogni nemico abbia uno state
  enemy.state = enemy.state || {
    speed: 0,
    isFlying: false,
    isSitting: false,
    isAttacking: false,
    isSprinting: false,
  };
  enemies.push(enemy);
}

export function getEnemies() {
  return enemies.filter(e => e.alive);
}

export function updateEnemies(delta) {
  const playerRef = gameManager.controller?.player;
  for (const enemy of enemies) {
    if (!enemy.model || !playerRef?.model) continue;

    // skip se lontano
    const dist = enemy.model.position.distanceTo(playerRef.model.position);
    if (dist > MAX_UPDATE_DISTANCE) continue;

    // --- MOTORE MIXER/ANIMATOR ---
    const step = Math.min(delta, 0.05);
    enemy.mixer?.update(step);

    // --- MORTE / DYING ---
    if (!enemy.alive) {
      // già morto → gestiamo fading se attivo
      if (enemy._fading) {
        const DURATION = 1.5;
        enemy._fade -= (delta / DURATION);
        const opacity = Math.max(0, enemy._fade);
        for (const part of enemy._fading.parts) {
          for (const m of part.materials) if (m && 'opacity' in m) m.opacity = opacity;
        }
        if (enemy._fade <= 0) {
          for (const part of enemy._fading.parts) for (const m of part.materials) m?.dispose?.();
          enemy._fading = null;
          scene.remove(enemy.model);
          const idx = enemies.indexOf(enemy);
          if (idx !== -1) enemies.splice(idx, 1);
        }
      } else {
        // già morto ma niente fade -> niente
      }
      // aggiorna comunque l'animator per tenere i pesi puliti
      enemy.animator?.update(delta);
      continue;
    }

    // se sta "morendo" (die in corso) non muovere, ma controlla fine clip per marcare alive=false
    if (enemy._dying) {
      const dieRunning = enemy.actions?.die?.isRunning?.() ?? false;
      enemy.animator?.update(delta);
      if (!dieRunning) {
        // la clip die è finita → ora diventa "morto" e parte il fade
        enemy._dying = false;
        enemy.alive = false;
        startFadeOut(enemy);
      }
      continue;
    }

    // ===== AI / MOVIMENTO =====
    if (enemy.type === 'wyvern') {
      // Stato timer per volo/terra
      enemy.stateTimer = (enemy.stateTimer || 0) + delta;

      const terrainY = getTerrainHeightAt(enemy.model.position.x, enemy.model.position.z);

      if (enemy.behaviorState === 'flying') {
        // decide se iniziare discesa
        if (!enemy.landing && enemy.stateTimer > (enemy.flyTime ?? 10) + Math.random() * 10) {
          enemy.landing = true;
        }

        if (enemy.landing) {
          const targetY = terrainY + (enemy.yOffset ?? 0);
          enemy.model.position.y = THREE.MathUtils.lerp(enemy.model.position.y, targetY, delta * 2);
          if (Math.abs(enemy.model.position.y - targetY) < 0.2) {
            enemy.model.position.y = targetY;
            enemy.behaviorState = 'walking';
            enemy.landing = false;
            enemy.stateTimer = 0;
          }
        } else {
          const flightHeight = terrainY + (enemy.altitude ?? 12) + Math.sin(enemy.stateTimer * 2) * 1.5;
          enemy.model.position.y = THREE.MathUtils.lerp(enemy.model.position.y, flightHeight, delta * 5);
        }

        enemy.angle = (enemy.angle ?? Math.random() * Math.PI * 2) + delta * 0.5;
        const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
        enemy.model.position.x += dir.x * delta * 5;
        enemy.model.position.z += dir.z * delta * 5;

        const target = enemy.model.position.clone().add(dir);
        enemy.model.lookAt(target);

        // stato per l'Animator
        enemy.state.isFlying = true;
        enemy.state.speed = 5; // velocità "percepita" per scegliere clip fly
      }
      else { // walking
        if (enemy.stateTimer > (enemy.walkTime ?? 5) * (0.5 + Math.random())) {
          enemy.behaviorState = 'flying';
          enemy.stateTimer = 0;
          enemy.altitude = 10 + Math.random() * 5;
        } else {
          enemy.angle = (enemy.angle ?? Math.random() * Math.PI * 2) + delta * 0.2;
          const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
          const moveSpeed = enemy.speed ?? 1.0;
          enemy.model.position.addScaledVector(dir, moveSpeed * delta);

          const x = enemy.model.position.x, z = enemy.model.position.z;
          const targetY = getTerrainHeightAt(x, z) + (enemy.yOffset ?? 0);
          enemy.model.position.y = THREE.MathUtils.lerp(enemy.model.position.y, targetY, delta * 5);

          const target = enemy.model.position.clone().add(dir);
          enemy.model.lookAt(target);

          enemy.state.isFlying = false;
          enemy.state.speed = moveSpeed;
        }
      }
    } else {
      // walker / werewolf
      enemy.angle = (enemy.angle ?? Math.random() * Math.PI * 2) + delta * 0.2;
      const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
      const moveSpeed = 0;//enemy.speed ?? 1.0;

      enemy.model.position.addScaledVector(dir, moveSpeed * delta);
      const x = enemy.model.position.x, z = enemy.model.position.z;
      enemy.model.position.y = getTerrainHeightAt(x, z);

      const target = enemy.model.position.clone().add(dir);
      enemy.model.lookAt(target);

      enemy.state.isFlying = false;
      enemy.state.speed = moveSpeed;
    }

    // ===== ANIMAZIONI (centralizzate) =====
    enemy.animator?.update(delta);
  }
}

export function killEnemy(enemy) {
  if (!enemy || !enemy.alive) return;

  // ferma eventuali loop residui (non serve se l'Animator gestisce i pesi, ma è ok come safety)
  for (const a of Object.values(enemy.actions || {})) a?.stop?.();

  // avvia animazione di morte come azione "full"
  if (enemy.animator && enemy.actions?.die) {
    enemy._dying = true;           // segnale per l'update loop
    enemy.animator.playAction('die');
  } else if (enemy.actions?.die) {
    // fallback senza Animator
    const dieAction = enemy.actions.die;
    dieAction.reset().setLoop(THREE.LoopOnce, 1);
    dieAction.clampWhenFinished = true;
    dieAction.play();
    // listener per fine → avvia fade
    enemy.mixer?.addEventListener('finished', function onDieFinish(e) {
      if (e.action === dieAction) {
        enemy.mixer.removeEventListener('finished', onDieFinish);
        enemy.alive = false;
        startFadeOut(enemy);
      }
    });
  } else {
    // nessuna animazione di morte → muori subito
    enemy.alive = false;
    startFadeOut(enemy);
  }
}

function startFadeOut(enemy) {
  // clona materiali una volta, abilita trasparenza e abbassa ombre
  const parts = [];
  enemy.model.traverse(child => {
    if (!child.isMesh) return;
    const toArray = (m) => Array.isArray(m) ? m : [m];
    const mats = toArray(child.material);
    const clones = mats.map((mat) => {
      const c = (typeof mat?.clone === 'function') ? mat.clone() : mat;
      if (!c) return c;
      c.transparent = true;
      c.needsUpdate = true;
      return c;
    });
    child.material = Array.isArray(child.material) ? clones : clones[0];
    child.castShadow = false;
    child.receiveShadow = false;
    parts.push({ mesh: child, materials: clones });
  });

  enemy._fade = 1.0;
  enemy._fading = { parts };
  enemy.model.matrixAutoUpdate = false;
}
