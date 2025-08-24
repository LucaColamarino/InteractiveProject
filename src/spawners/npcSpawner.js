// src/spawners/npcSpawner.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { ENTITY_CONFIG } from '../utils/entities.js';
import { registerEnemy } from '../controllers/npcController.js';
import { instantiateEntity, buildMixerAndActions, preloadEntity } from '../utils/entityFactory.js';
// =============== Spawner ===============
async function spawnEnemy(configKey, position, type) {
  const cfg = ENTITY_CONFIG[configKey];
  if (!cfg) return;
  try { await preloadEntity(configKey); } catch (e) { console.warn('[NPC] preload fallito:', configKey, e); }

  const fbx = instantiateEntity(configKey);

  const terrainY = getTerrainHeightAt(position.x, position.z);
  position.y = Number.isFinite(terrainY) ? terrainY + (cfg.yOffset ?? 0) : (cfg.yOffset ?? 0);
  fbx.position.copy(position);
  scene.add(fbx);

  // ⬇️  FIX: serve await perché buildMixerAndActions può essere async
  let mixer = null, actions = {};
  try {
    const res = await buildMixerAndActions(fbx, cfg);
    mixer = res?.mixer || null;
    actions = res?.actions || {};
  } catch (e) {
    console.warn('[NPC] buildMixerAndActions error:', configKey, e);
  }

  // Play sicuro con fallback
  const play = (k) => actions?.[k]?.play && actions[k].play();
  if (!play('walk')) {
    if (!play('idle')) {
      const first = Object.values(actions)[0];
      if (first?.play) first.play();
    }
  }
  console.debug('[NPC]', configKey, 'actions:', Object.keys(actions));

  registerEnemy({
    type, model: fbx, mixer, actions,
    angle: Math.random() * Math.PI * 2,
    speed: type === 'werewolf' ? 1.0 : 3.0,
    alive: true,
    yOffset: cfg.yOffset || 0,
    flyTime: type === 'wyvern' ? 15 + Math.random() * 10 : null,
    walkTime: type === 'wyvern' ? 5 + Math.random() * 5 : null,
    behaviorState: type === 'wyvern' ? 'flying' : null,
    stateTimer: 0,
    altitude: 10 + Math.random() * 5,
  });
}

// =============== API ===============
export function spawnWalkingNpc(pos) { spawnEnemy('archer', pos, 'walker'); }
export function spawnWerewolfNpc(pos) { spawnEnemy('werewolf', pos, 'werewolf'); }
export function spawnFlyingWyvern(pos) { spawnEnemy('wyvern', pos, 'wyvern'); }

export function spawnEnemies() {
  const num_archers = 10, num_werewolves = 0, num_wyvern = 0;
  for (let i = 0; i < num_archers; i++) spawnWalkingNpc(new THREE.Vector3(Math.random() * 100 - 50, 0, Math.random() * 200 - 100));
  for (let i = 0; i < num_werewolves; i++) spawnWerewolfNpc(new THREE.Vector3(-250 + Math.random() * 100, 0, Math.random() * 100 - 50));
  for (let i = 0; i < num_wyvern; i++) spawnFlyingWyvern(new THREE.Vector3(250 + Math.random() * 150, 70, Math.random() * 150));
}