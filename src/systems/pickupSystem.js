import * as THREE from 'three';
import { scene } from '../scene.js';
import { getCurrentArea } from '../areaManager.js';
import {altars} from '../objects/altar.js';
export function checkTransformationAltars(player, onFormChange) {
  if (!player?.model) return;

  const playerPos = player.model.position;
  const currentArea = getCurrentArea(playerPos);

  for (let i = altars.length - 1; i >= 0; i--) {
    const altar = altars[i];
    const form = altar.userData.formName;

    const distance = playerPos.distanceTo(altar.position);
    if (distance < 2.0) {
      if (form !== currentArea) {
        console.warn(`⚠️ Non puoi trasformarti in ${form} nell'area ${currentArea}`);
        return;
      }

      onFormChange(form);
      scene.remove(altar);
      altars.splice(i, 1);
      break;
    }
  }
}


