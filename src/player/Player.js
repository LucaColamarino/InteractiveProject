import * as THREE from 'three';
import { AnimationComponent } from '../components/AnimationComponent.js';
import { ENTITY_CONFIG } from '../utils/entities.js';
import { offset } from './cameraFollow.js';
import { instantiateEntity, buildMixerAndActions } from '../utils/entityFactory.js';
import { getTerrainHeightAt } from '../map/map.js';
import { HumanFormController } from '../controllers/forms/HumanFormController.js';
import { scene } from '../scene.js';
import { Animator } from '../components/Animator.js'; // <-- nuovo
export class Player {
  constructor(model, mixer, actions) {
    this.model = model;
    this.anim = new AnimationComponent(mixer, actions); // compatibilità
    // nuovo orchestratore centralizzato
    this.animator = new Animator({ mixer, actions }, () => this.state);

    this.state = { speed:0, isFlying:false, isSitting:false, isAttacking:false, isSprinting:false };

    // hitbox (ok com’è)
    this.swordHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 1, 1.5),
      new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false })
    );
    this.model.add(this.swordHitbox);
    this.swordHitbox.position.set(0, 1, 1);
  }

  update(dt) {
    // delega all’orchestratore
    this.animator.update(dt);
  }
}

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
export async function spawnPlayer(position = new THREE.Vector3(5,getTerrainHeightAt(5,5),5))
  {
      const formName = "human";
      const abilities = abilitiesByForm[formName];
      if (!abilities) throw new Error(`[Player] Form not found: ${formName}`);
      offset.copy(abilities.cameraOffset);
      const fbx = instantiateEntity(formName);
      fbx.rotation.set(0, abilities.rotationOffset, 0);
      const group = new THREE.Group();
      group.position.copy(position);
      fbx.position.y += abilities.yOffset;
      group.add(fbx);
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
      player.model.equipmentMeshes = getEquipmentMesh(player.model);
      const controller = new HumanFormController(player, abilities);
      return controller;
}
function getEquipmentMesh(root) {
  return {
    helmet: getMeshByPrefix(root, 'helmet'),
    shield: getMeshByPrefix(root, 'shield'),
    sword:  getMeshByPrefix(root, 'sword'),
    wand:   getMeshByPrefix(root, 'wand'),
  };
}
function getMeshByPrefix(root, prefix) {
  const out = [];
  const p = prefix.toLowerCase();
  root.traverse(o => { if (o.name && o.name.toLowerCase().startsWith(p)) out.push(o); });
  console.log("meshesbyprefix");
  console.log(out);
  return out;
}
export const abilitiesByForm = {
  human: createAbilities('human', { canFly:false, canJump:true, speed:5, jumpForce:12, gravity:-30 }),
  werewolf: createAbilities('werewolf', { canFly:false, canJump:true, speed:10, jumpForce:12, gravity:-30 }),
  wyvern: createAbilities('wyvern', { canFly:true, canJump:false, flyspeed:30, speed:8, jumpForce:10, gravity:-5,
    cameraOffset: new THREE.Vector3(0, 15, -20), yOffset: 5.2 })
};
