// src/spawners/npcSpawner.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { ENTITY_CONFIG } from '../utils/entities.js';
import { instantiateEntity, buildMixerAndActions, preloadEntity } from '../utils/entityFactory.js';
import { Animator } from '../components/Animator.js';

import { registerEnemy } from '../enemies/EnemyManager.js';
import { ArcherEnemy } from '../enemies/controllers/ArcherEnemy.js';
import { WerewolfEnemy } from '../enemies/controllers/WerewolfEnemy.js';
import { WyvernEnemy } from '../enemies/controllers/WyvernEnemy.js';

function _chooseController(type, opts) {
  switch (type) {
    case 'archer':   return new ArcherEnemy(opts);
    case 'werewolf': return new WerewolfEnemy(opts);
    case 'wyvern':   return new WyvernEnemy(opts);
    default:         return new ArcherEnemy(opts); // fallback
  }
}

// =============== Spawner ===============
async function spawnEnemy(configKey, position, typeOverride = null) {
  const cfg = ENTITY_CONFIG[configKey];
  if (!cfg) { console.warn('[NPC] config mancante:', configKey); return; }

  try { await preloadEntity(configKey); } 
  catch (e) { console.warn('[NPC] preload fallito:', configKey, e); }

  // istanzia modello
  const fbx = instantiateEntity(configKey);

  // posizionamento a terra/su quota
  const terrainY = getTerrainHeightAt(position.x, position.z);
  const yOffset = cfg.yOffset ?? 0;
  const startY = Number.isFinite(terrainY) ? (terrainY + yOffset) : yOffset;
  fbx.position.set(position.x, startY, position.z);
  scene.add(fbx);

  // mixer + actions (clips definite nel cfg)
  let mixer = null, actions = {};
  try {
    const res = await buildMixerAndActions(fbx, cfg);
    mixer = res?.mixer || null;
    actions = res?.actions || {};
  } catch (e) {
    console.warn('[NPC] buildMixerAndActions error:', configKey, e);
  }

  // tipo controller: se non lo forzi con typeOverride usa configKey
  const type = typeOverride || configKey;

  // opzioni comuni al BaseEnemy
  const baseOpts = {
    type,
    model: fbx,
    mixer,
    actions,
    yOffset,
    speed: cfg.speed ?? 1.0,
    maxUpdateDistance: cfg.maxUpdateDistance ?? 250,
    forwardYawOffsetDeg: cfg.forwardYawOffsetDeg ?? 0, // NEW
  };

  // parametri specifici per wyvern (se presenti nel cfg)
  if (type === 'wyvern') {
    baseOpts.altitude = cfg.altitude ?? (10 + Math.random() * 6);
    baseOpts.flyTime  = cfg.flyTime ?? 10;
    baseOpts.walkTime = cfg.walkTime ?? 5;
    baseOpts.flySpeed = cfg.flySpeed ?? 5.0;
    baseOpts.walkSpeed = cfg.walkSpeed ?? 1.2;
  }

  // crea il controller specifico
  const ctrl = _chooseController(type, baseOpts);

  // Animator centralizzato agganciato allo state del controller
  // (il tuo Animator si aspetta {mixer, actions} e una fn che ritorna lo stato)
  const animator = new Animator({ mixer, actions }, () => ctrl.state);
  ctrl.animator = animator;

  // target di default: il player (se già disponibile lo risolverà nei controller)
  // ctrl.setTarget(gameManager.controller?.player?.model); // opzionale

  // registra nel manager (si occuperà di update, death, fadeout)
  registerEnemy(ctrl);

  return ctrl;
}

// =============== API di comodo ===============
export function spawnArcherNpc(pos) {
  return spawnEnemy('archer', new THREE.Vector3(pos.x, pos.y ?? 0, pos.z), 'archer');
}
export function spawnWerewolfNpc(pos) {
  return spawnEnemy('werewolf', new THREE.Vector3(pos.x, pos.y ?? 0, pos.z), 'werewolf');
}
export function spawnWyvernNpc(pos) {
  // puoi passare una y iniziale > terreno se vuoi vederlo già “in aria”
  return spawnEnemy('wyvern', new THREE.Vector3(pos.x, pos.y ?? 30, pos.z), 'wyvern');
}

// batch di test
export function spawnEnemies() {
  const num_archers = 10, num_werewolves = 0, num_wyverns = 0;
  const area = { x: 30, z: 30, width: 150, depth: 150 };
  for (let i = 0; i < num_archers; i++) {
    spawnArcherNpc(new THREE.Vector3(
      area.x + Math.random() * area.width - area.width / 2,
      0,
      area.z + Math.random() * area.depth - area.depth / 2,
    ));
  }
  for (let i = 0; i < num_werewolves; i++) {
    spawnWerewolfNpc(new THREE.Vector3(
      -250 + Math.random() * 100,
      0,
      Math.random() * 100 - 50
    ));
  }

  for (let i = 0; i < num_wyverns; i++) {
    spawnWyvernNpc(new THREE.Vector3(
      250 + Math.random() * 150,
      70,
      Math.random() * 150 - 75
    ));
  }
}
