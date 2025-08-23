// src/player/formManager.js
import * as THREE from 'three';
import { scene } from '../scene.js';
import { offset } from './cameraFollow.js';
import { Player } from './Player.js';
import { HumanFormController } from '../controllers/forms/HumanFormController.js';
import { ENTITY_CONFIG } from '../utils/entities.js';
import { setPlayerReference } from '../spawners/npcSpawner.js';
import { preloadAllEntities, instantiateEntity, buildMixerAndActions } from '../utils/entityFactory.js';

function createAbilities(formName, overrides = {}) {
  const config = ENTITY_CONFIG[formName];
  return {
    modelPath: config.modelPath,
    animationPaths: config.animations,
    animationIndices: config.animationIndices,
    cameraOffset: overrides.cameraOffset || config.cameraOffset || new THREE.Vector3(0, 2.5, -1.5),
    rotationOffset: overrides.rotationOffset || 0,
    yOffset: overrides.yOffset ?? config.yOffset ?? 0.0,
    canFly: overrides.canFly || false,
    canJump: overrides.canJump || false,
    speed: overrides.speed || 5,
    jumpForce: overrides.jumpForce || 10,
    gravity: overrides.gravity || -30,
    flyspeed: overrides.flyspeed || 10,
    formName,
  };
}

export const abilitiesByForm = {
  human: createAbilities('human', { canFly:false, canJump:true, speed:8, jumpForce:12, gravity:-30 }),
  werewolf: createAbilities('werewolf', { canFly:false, canJump:true, speed:10, jumpForce:12, gravity:-30 }),
  wyvern: createAbilities('wyvern', { canFly:true, canJump:false, flyspeed:30, speed:8, jumpForce:10, gravity:-5,
    cameraOffset: new THREE.Vector3(0, 15, -20), yOffset: 5.2 })
};

/* -------------------- Preload & change form -------------------- */
export async function preloadAssets() {
  await preloadAllEntities(Object.keys(abilitiesByForm));
}

export async function changeForm(formName) {
  const abilities = abilitiesByForm[formName];
  if (!abilities) throw new Error(`Forma non trovata: ${formName}`);
  offset.copy(abilities.cameraOffset);

  const fbx = instantiateEntity(formName);
  fbx.rotation.set(0, abilities.rotationOffset, 0);

  const group = new THREE.Group();
  const prevPlayer = scene.children.find(obj => obj.userData?.playerModel);
  const prevPosition = prevPlayer?.position?.clone() ?? new THREE.Vector3(5, 15, 5);

  group.position.copy(prevPosition);
  fbx.position.y += abilities.yOffset;
  group.add(fbx);

  scene.children.filter(o => o.userData?.playerModel).forEach(o => scene.remove(o));
  group.userData.playerModel = true;
  scene.add(group);

  let mixer = null, actions = {};
  try {
    const res = await buildMixerAndActions(fbx, ENTITY_CONFIG[formName]);
    mixer = res?.mixer || null;
    actions = res?.actions || {};
  } catch (e) {
    console.warn('[Player] buildMixerAndActions error:', formName, e);
  }

const player = new Player(group, mixer, actions);

  if (formName === 'human') {
    player.model.equipmentMeshes = buildEquipmentMap(player.model);
  }

  const controller = new HumanFormController(player, abilities);
  player.anim.play('idle');
  addTransformationEffect(group.position);
  setPlayerReference(player);
  return { player, controller };
}

/* -------------------- Equip helpers & FX (unchanged) -------------------- */
function getAllByPrefix(root, prefix) {
  const out = [];
  const p = prefix.toLowerCase();
  root.traverse(o => { if (o.name && o.name.toLowerCase().startsWith(p)) out.push(o); });
  return out;
}
function buildEquipmentMap(root) {
  return {
    helmet: getAllByPrefix(root, 'helmet'),
    shield: getAllByPrefix(root, 'shield'),
    sword:  getAllByPrefix(root, 'sword'),
    wand:   getAllByPrefix(root, 'wand'),
  };
}
export function addTransformationEffect(position) {
  const geometry = new THREE.RingGeometry(0.5, 2.5, 64);
  const material = new THREE.MeshBasicMaterial({ color: 0x66ccff, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false });
  const ring = new THREE.Mesh(geometry, material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(position.x, position.y + 0.1, position.z);
  scene.add(ring);
  let scale = 1; const fadeSpeed = 1.5;
  function animateRing() {
    scale += 0.05;
    ring.scale.set(scale, scale, scale);
    material.opacity -= 0.02 * fadeSpeed;
    if (material.opacity <= 0) { scene.remove(ring); return; }
    requestAnimationFrame(animateRing);
  }
  animateRing();
}
