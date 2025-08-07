// npcController.js

import * as THREE from 'three';
import { scene } from './scene.js';

const enemies = [];

export function registerEnemy(enemy) {
  enemies.push(enemy);
}

export function getEnemies() {
  return enemies.filter(e => e.alive);
}

export function updateEnemies(delta) {
  for (const enemy of enemies) {
    // anche se non è alive, aggiorna il mixer se sta morendo
    if (!enemy.alive) {
      if (enemy.actions?.die?.isRunning()) {
        enemy.mixer?.update(Math.min(delta, 0.05));
      }
      continue;
    }

    enemy.mixer?.update(Math.min(delta, 0.05));

    // semplice wander
    if (enemy.angle !== undefined) {
      enemy.angle += delta * 0.2;
      const dir = new THREE.Vector3(Math.cos(enemy.angle), 0, Math.sin(enemy.angle));
      const moveSpeed = enemy.speed ?? 1.0;
      enemy.model.position.addScaledVector(dir, moveSpeed * delta);

      const target = enemy.model.position.clone().add(dir);
      enemy.model.lookAt(target);
    }
  }
}

export function killEnemy(enemy) {
  enemy.angle= undefined; // stop wandering
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
  enemy.model.traverse(child => {
    if (child.isMesh) {
      child.material = child.material.clone();
      child.material.transparent = true;
    }
  });

  let fade = 1.0;
  const fadeInterval = setInterval(() => {
    fade -= 0.02;
    enemy.model.traverse(child => {
      if (child.isMesh && child.material?.opacity !== undefined) {
        child.material.opacity = fade;
      }
    });

    if (fade <= 0) {
      clearInterval(fadeInterval);
      scene.remove(enemy.model);
      const index = enemies.indexOf(enemy);
      if (index !== -1) enemies.splice(index, 1);
    }
  }, 100);
}
