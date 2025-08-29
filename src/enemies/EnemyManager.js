// EnemyManager.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { gameManager } from '../managers/gameManager.js';
import { dragonheart } from '../utils/items.js';
import { getTerrainHeightAt } from '../map/map.js';

const _enemies = [];
const MAX_UPDATE_DISTANCE = 250;     // culling logico
const MAX_STEP = 0.05;               // evita salti

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
    if (!e?.model) continue;

    // distance culling
    const dist = e.model.position.distanceTo(player.model.position);
    if (dist > (e.maxUpdateDistance ?? MAX_UPDATE_DISTANCE)) continue;

    // clamp passo (stabilità)
    const step = Math.min(delta, MAX_STEP);

    // ---------- dying / dead ----------
    if (e._dying) {
      // aggiorna ancora l’animator mentre sta morendo
      e.animator?.update(step);

      const dieName = e.animator?.names?.die || 'die';
      const oc = e.animator?.overlayCtx;

      // se l’overlay non è più "die", pinna comunque (tardi ma sicuro)
      if (!oc || oc.name !== dieName) {
        _pinDeathPose(e);
        continue;
      }

      // PRE-PIN: se mancano pochi ms alla fine, pinna PRIMA che finisca
      const dur = oc.dur || 1;
      const t   = oc.t  || 0;
      const remaining = dur - t;
      const EPS = Math.max(0.5 * step, 0.016); // ~1 frame a 60fps (alza a 0.033 se serve)

      if (remaining <= EPS) {
        _pinDeathPose(e);
        continue;
      }

      // ancora in corso: lascia morire
      continue;
    }

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

      // Mantieni la posa pinnata senza far avanzare il tempo del mixer
      e.animator?.comp?.mixer?.update?.(0);
      continue;
    }

    // ---------- enemy vivo: ciclo completo ----------
    e.preUpdate?.(step);
    // (niente più e.mixer.update(step): lo fa l'Animator)
    e.update?.(step);           // logica specifica nemico
    e.animator?.update(step);   // blending/pesi + avanzamento mixer
    e.postUpdate?.(step);
  }
}

export function killEnemy(enemyInstance) {
  if (!enemyInstance || !enemyInstance.alive) return;
  console.log("KILLED A ",enemyInstance);
  if(enemyInstance.type=="werewolf")
    gameManager.wolvesKilled+=1;
  else if(enemyInstance.type=="archer")
    gameManager.archersKilled+=1;
  else if (enemyInstance.type=="wyvern"){
    let pos = enemyInstance.model.position;
    pos.y = getTerrainHeightAt(pos.x,pos.z);
    gameManager.pickableManager.spawnItem(
      dragonheart,
      pos,
      { autoPickup: false, pickupRadius: 1.5, enableRing: false, spawnImpulse: { up: 1.0 } }
    );}

  // ferma subito motion/AI
  enemyInstance.navAgent && (enemyInstance.navAgent.isStopped = true);
  enemyInstance.velocity && (enemyInstance.velocity.set?.(0,0,0));

  // spegni eventuali loop legacy
  for (const a of Object.values(enemyInstance.actions || {})) a?.stop?.();

  const anim = enemyInstance.animator;
  const dieName = anim?.names?.die || 'die';

  if (anim && dieName) {
    enemyInstance._dying = true;
    const ok = anim.playOverlay(dieName, { loop: 'once', mode: 'full' });
    if (ok) {
      // prepara l’action per il clamp (il pin vero avviene dopo con _pinDeathPose)
      const action = anim._activeFull;
      if (action) {
        action.clampWhenFinished = true;
        action.setLoop(THREE.LoopOnce, 1);
      }
    }
  } else if (enemyInstance.actions?.die && enemyInstance.mixer) {
    // Fallback legacy (senza Animator)
    const dieAction = enemyInstance.actions.die;
    dieAction.reset().setLoop(THREE.LoopOnce, 1);
    dieAction.clampWhenFinished = true;
    dieAction.play();

    enemyInstance.mixer.addEventListener('finished', function onDieFinish(e) {
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

/* ---------------- helpers ---------------- */

function _pinDeathPose(e) {
  const anim = e.animator;
  const dieName = anim?.names?.die || 'die';
  const mixer = anim?.mixer || e.mixer;

  // azione di morte
  const dieAction = anim?.comp?.get?.(dieName) || anim?._activeFull;
  if (dieAction) {
    const clip = dieAction.getClip?.();
    if (clip) dieAction.time = Math.max(0, clip.duration - 1e-4); // ultimo frame
    dieAction.paused = true;
    dieAction.enabled = true;
    dieAction.setLoop(THREE.LoopOnce, 1);
    dieAction.clampWhenFinished = true;
    dieAction.setEffectiveWeight?.(1);
  }

  // spegni tutte le altre action (nessun contributo della base)
  if (mixer && mixer._actions) {
    for (const a of mixer._actions) {
      if (a === dieAction) continue;
      try { a.stop(); } catch {}
      a.enabled = false;
      a.setEffectiveWeight?.(0);
    }
  }

  // “pinna” l’overlay per tenere la base a 0
  const oc = anim?.overlayCtx;
  if (oc) {
    oc.name = dieName;
    oc.mode = 'full';
    oc.once = true;
    oc.dur  = Infinity; // base resta 0
    oc.t    = 0;
  }

  // **Bake immediato della posa** senza avanzare il tempo
  try { mixer?.update?.(0); } catch {}

  // opzionale: blocca il tempo del mixer (non avanza più)
  if (mixer) mixer.timeScale = 0;

  // ferma motion/AI e avvia fade dalla posa congelata
  e.navAgent && (e.navAgent.isStopped = true);
  e.velocity && (e.velocity.set?.(0,0,0));
  e._dying = false;
  e.alive = false;
  e._dieActionPinned = dieAction || null;
  _startFadeOut(e);
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
}
