// EnemyManager.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { gameManager } from '../managers/gameManager.js';

const _enemies = [];
const MAX_UPDATE_DISTANCE = 250;     // culling logico
const MAX_STEP = 0.05;               // evita salti del mixer

export function registerEnemy(enemyInstance) {
  if (!enemyInstance) return;
  _enemies.push(enemyInstance);
}

export function unregisterEnemy(enemyInstance) {
  const i = _enemies.indexOf(enemyInstance);
  if (i !== -1) _enemies.splice(i, 1);
}

export function getEnemies({ aliveOnly = true } = {}) {
  return aliveOnly ? _enemies.filter(e => e.alive) : _enemies.slice();
}

export function updateEnemies(delta) {
  const player = gameManager.controller?.player;
  if (!player?.model) return;

  for (const e of _enemies) {
    // modello non pronto
    if (!e?.model) continue;

    // distance culling
    const dist = e.model.position.distanceTo(player.model.position);
    if (dist > (e.maxUpdateDistance ?? MAX_UPDATE_DISTANCE)) continue;

    // clamp passo mixer/animator (stabilità)
    const step = Math.min(delta, MAX_STEP);

    // se sta morendo → lascia finire la clip poi passa al fade
    if (e._dying) {
      e.animator?.update(step);
      const dieRunning = e.actions?.die?.isRunning?.() ?? false;
      if (!dieRunning) {
        e._dying = false;
        e.alive = false;
        _startFadeOut(e);
      }
      continue;
    }

    // se già morto → gestisci fade e GC
    if (!e.alive) {
      if (e._fading) {
        const DURATION = e.fadeDuration ?? 1.5;
        e._fade = (e._fade ?? 1) - (delta / DURATION);
        const opacity = Math.max(0, e._fade);

        for (const part of e._fading.parts) {
          for (const m of part.materials) if (m && 'opacity' in m) m.opacity = opacity;
        }
        if (e._fade <= 0) {
          // cleanup materiali e rimozione dallo scene graph
          for (const part of e._fading.parts) {
            for (const m of part.materials) m?.dispose?.();
          }
          e._fading = null;
          scene.remove(e.model);
          unregisterEnemy(e);
        }
      }
      // comunque tieni aggiornato l'animator (pulisce i pesi)
      e.animator?.update(step);
      continue;
    }

    // nemico vivo → ciclo completo
    e.preUpdate?.(step);
    e.mixer?.update(step);
    e.update(step);                 // delega al controller specifico
    e.animator?.update(step);
    e.postUpdate?.(step);
  }
}

export function killEnemy(enemyInstance) {
  console.log("ENEMY KILLED");
  if (!enemyInstance || !enemyInstance.alive) return;

  // spegni eventuali loop (safety: se l’Animator non gestisce i pesi residui)
  for (const a of Object.values(enemyInstance.actions || {})) a?.stop?.();

  // se c'è un'azione di morte usala come "full"
  if (enemyInstance.animator && enemyInstance.actions?.die) {
    enemyInstance._dying = true;
    enemyInstance.animator.playAction('die'); // delega al tuo Animator
  } else if (enemyInstance.actions?.die) {
    // fallback senza Animator
    const dieAction = enemyInstance.actions.die;
    dieAction.reset().setLoop(THREE.LoopOnce, 1);
    dieAction.clampWhenFinished = true;
    dieAction.play();
    enemyInstance.mixer?.addEventListener('finished', function onDieFinish(e) {
      if (e.action === dieAction) {
        enemyInstance.mixer.removeEventListener('finished', onDieFinish);
        enemyInstance.alive = false;
        _startFadeOut(enemyInstance);
      }
    });
  } else {
    enemyInstance.alive = false;
    _startFadeOut(enemyInstance);
  }
}

function _startFadeOut(enemy) {
  if (!enemy?.model) return;
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
