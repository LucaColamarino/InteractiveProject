// npcController.js

import * as THREE from 'three';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { gameManager } from '../managers/gameManager.js';
const enemies = [];
const MAX_UPDATE_DISTANCE = 250;
export function registerEnemy(enemy) {
  enemies.push(enemy);
}

export function getEnemies() {
  return enemies.filter(e => e.alive);
}

export function updateEnemies(delta) {
  const playerRef = gameManager.controller.player;
  for (const enemy of enemies) {
    if (!enemy.model || !playerRef?.model) continue;
    const dist = enemy.model.position.distanceTo(playerRef.model.position);
    if (dist > MAX_UPDATE_DISTANCE) continue;
    if (!enemy.alive) {
  // Finché la clip "die" gira, lasciamo il mixer aggiornare
  if (enemy.actions?.die?.isRunning()) {
    enemy.mixer?.update(Math.min(delta, 0.05));
  } else if (enemy._fading) {
    // Fading per frame (senza traverse)
    const DURATION = 1.5; // secondi di fade
    enemy._fade -= (delta / DURATION);
    const opacity = (enemy._fade > 0) ? enemy._fade : 0;

    for (const part of enemy._fading.parts) {
      for (const m of part.materials) {
        if (m && typeof m.opacity !== 'undefined') m.opacity = opacity;
      }
    }

    if (enemy._fade <= 0) {
      // cleanup materiali (clonati) e rimozione dalla scena
      for (const part of enemy._fading.parts) {
        for (const m of part.materials) m?.dispose?.();
        // NON disporre la geometry se è condivisa tra istanze
      }
      enemy._fading = null;
      scene.remove(enemy.model);
      const index = enemies.indexOf(enemy);
      if (index !== -1) enemies.splice(index, 1);
    }
  }
  // niente altro da fare per i nemici non vivi
  continue;
}


    enemy.mixer?.update(Math.min(delta, 0.05));

    if (enemy.type === 'wyvern') {
      enemy.stateTimer += delta;

      if (enemy.behaviorState === 'flying') {
        const terrainY = getTerrainHeightAt(enemy.model.position.x, enemy.model.position.z);

        // Se è in fase di atterraggio
        if (enemy.landing) {
          const targetY = terrainY + enemy.yOffset;
          enemy.model.position.y = THREE.MathUtils.lerp(
            enemy.model.position.y,
            targetY,
            delta * 2
          );

          // Quando è praticamente a terra, cambia stato
          if (Math.abs(enemy.model.position.y - targetY) < 0.2) {
            enemy.model.position.y = targetY;
            enemy.behaviorState = 'walking';
            enemy.landing = false;
            enemy.stateTimer = 0;
            enemy.actions.fly?.stop();
            enemy.actions.walk?.play();
          }
        } else {
          // Decidi se iniziare la discesa
          if (enemy.stateTimer > enemy.flyTime + Math.random() * 10) {
            enemy.landing = true;
          }

          const flightHeight = terrainY + enemy.altitude + Math.sin(enemy.stateTimer * 2) * 1.5;
          enemy.model.position.y = THREE.MathUtils.lerp(
            enemy.model.position.y,
            flightHeight,
            delta * 5
          );
        }

        enemy.angle += delta * 0.5;
        const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
        enemy.model.position.x += dir.x * delta * 5;
        enemy.model.position.z += dir.z * delta * 5;

        const target = enemy.model.position.clone().add(dir);
        enemy.model.lookAt(target);

        if (!enemy.actions.fly?.isRunning()) {
          enemy.actions.walk?.stop();
          enemy.actions.fly?.play();
        }
      } else if (enemy.behaviorState === 'walking') {
        if (enemy.stateTimer > enemy.walkTime * Math.random()*10) {
          enemy.behaviorState = 'flying';
          enemy.stateTimer = 0;
          enemy.altitude = 10 + Math.random() * 5;
          enemy.actions.walk?.stop();
          enemy.actions.fly?.play();
        } else {
          enemy.angle += delta * 0.2;
          const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
          const moveSpeed = enemy.speed ?? 1.0;
          enemy.model.position.addScaledVector(dir, moveSpeed * delta);

          const x = enemy.model.position.x;
          const z = enemy.model.position.z;
          const terrainY = getTerrainHeightAt(x, z);
          const targetY = terrainY + enemy.yOffset;
          enemy.model.position.y = THREE.MathUtils.lerp(
            enemy.model.position.y,
            targetY,
            delta * 5
          );

          const target = enemy.model.position.clone().add(dir);
          enemy.model.lookAt(target);

          if (!enemy.actions.walk?.isRunning()) {
            enemy.actions.fly?.stop();
            enemy.actions.walk?.play();
          }
        }
      }
    } else if (enemy.angle !== undefined) {
      enemy.angle += delta * 0.2;
      const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
      const moveSpeed = enemy.speed ?? 1.0;
      enemy.model.position.addScaledVector(dir, moveSpeed * delta);

      const x = enemy.model.position.x;
      const z = enemy.model.position.z;
      enemy.model.position.y = getTerrainHeightAt(x, z);

      const target = enemy.model.position.clone().add(dir);
      enemy.model.lookAt(target);
    }
  }
}

export function killEnemy(enemy) {
  enemy.angle = undefined;
  if (!enemy || !enemy.alive) return;

  for (const action of Object.values(enemy.actions)) {
    action.stop();
  }

  if (enemy.actions.die) {
    const dieAction = enemy.actions.die;
    dieAction.reset();
    dieAction.setLoop(THREE.LoopOnce, 1);
    dieAction.clampWhenFinished = true;
    dieAction.play();

    enemy.mixer.addEventListener('finished', function onDieFinish(e) {
      if (e.action === dieAction) {
        enemy.mixer.removeEventListener('finished', onDieFinish);
        enemy.alive = false;
        startFadeOut(enemy);
      }
    });
  } else {
    enemy.alive = false;
    startFadeOut(enemy);
  }
}

function startFadeOut(enemy) {
  // Cache di parti e materiali clonati (una volta sola)
  const parts = [];
  enemy.model.traverse(child => {
    if (!child.isMesh) return;

    const toArray = (m) => Array.isArray(m) ? m : [m];
    const mats = toArray(child.material);

    const clones = mats.map((mat) => {
      const c = (typeof mat?.clone === 'function') ? mat.clone() : mat;
      if (!c) return c;
      c.transparent = true;     // lo facciamo una volta
      // c.depthWrite = false;  // opzionale: dipende dalla tua scena
      // c.alphaHash = true;    // opzionale (MSAA), evita alcuni artefatti
      c.needsUpdate = true;     // solo ora (non ad ogni frame)
      return c;
    });

    child.material = Array.isArray(child.material) ? clones : clones[0];
    // alleggerisci shading durante il fade
    child.castShadow = false;
    child.receiveShadow = false;

    parts.push({ mesh: child, materials: clones });
  });

  // Flag di stato fade per updateEnemies
  enemy._fade = 1.0;
  enemy._fading = { parts };
  // opzionale: il modello è statico durante il fade
  enemy.model.matrixAutoUpdate = false;
}


