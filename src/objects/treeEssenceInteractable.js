// src/objects/treeEssenceInteractable.js
import * as THREE from 'three';
import { interactionManager } from '../systems/interactionManager.js';
import { gameManager } from '../managers/gameManager.js';
import { findDrainableTree, TREE_ESSENCE_CFG } from '../systems/TreeEssenceSystem.js';
import { trees } from '../spawners/vegetationSpawner.js';
const _tmp = new THREE.Vector3();

/** Registra un “interactable” virtuale per gli alberi */
export function registerTreeEssenceInteraction() {
  const interactable = {
    /** Posizione mondo usata dall’InteractionManager per il raggio */
    getWorldPosition(out = _tmp) {
      const ctrl = gameManager.controller;
      const p = ctrl?.player?.model?.position;
      if (!p) return out.set(1e9, 1e9, 1e9); // lontanissimo se non pronto
      // proviamo a trovare un albero drenabile vicino al player
      const siteOrTree = findDrainableTree(p);
      if (siteOrTree?.position) {
        // caso “mesh” con .position
        return out.copy(siteOrTree.position);
      }
      // fallback: usa direttamente la posizione del player
      return out.copy(p);
    },

    /** Se c’è un albero drenabile abbastanza vicino, possiamo interagire */
    canInteract() {
      const ctrl = gameManager.controller;
      const p = ctrl?.player?.model?.position;
      if (!p) return false;
      const target = findDrainableTree(p);
      return !!target; // true se vicino a un albero con essenza/cooldown ok
    },

    /** Testo del prompt. Se stai già drenando, mostra “Stop” */
    getPrompt(controller) {
      if (controller?.isDraining) {
        return { key: 'E', text: 'Ferma assorbimento' };
      }
      return { key: 'E', text: 'Assorbi essenza' };
    },

    /** Premuto E: toggle start/stop del canale */
    onInteract(controller) {
      if (!controller) return;
      if (controller.isDraining) {
        controller.stopDrain?.();
        return;
      }
      const p = controller?.player?.model?.position;
      const target = p ? findDrainableTree(p) : null;
      if (!target) return;

      // Per la versione “mesh”: passa l’oggetto tree.
      // Per la versione “site” (se hai fatto la variante per InstancedMesh),
      // puoi adattare qui a tryStartDrain(target).
      controller.tryStartDrain?.(target);

      // (l’avanzamento mana + svuotamento albero vengono gestiti nel gameLoop)
    },
  };

  interactionManager.register(interactable);
}

export function applyLeafHole(siteOrNull, strength = 0, radius = 5.2) {
  console.log("[TREE] applyhole");
  if (!trees?.setLeafHole) return;
  if (!siteOrNull) {
    //trees.setLeafHole(1e6, 1e6, 0, 0); // disattiva (fuori scena)
  } else {
    trees.setLeafHole(siteOrNull.x, siteOrNull.z, radius, strength);
  }
}
