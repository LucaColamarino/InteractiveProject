import { gameManager } from "../managers/gameManager";
export class GameItem {
  /**
   * @param {Object} opts
   *  - id: string univoco
   *  - name: etichetta (es. "Iron Sword")
   *  - type: "weapon" | "helmet" | "shield" | ...
   *  - modelPath: path FBX/GLTF del modello world-pickup
   *  - meshPrefix: prefisso per collegare all'equipment (es. "wand" -> wand, wand1...)
   *  - meta: oggetto libero (rarità, danno, difesa, ecc.)
   */
  constructor({ id, name, type, modelPath, meshPrefix = null, meta = {} }) {
    this.id = id;
    this.name = name;
    this.type = type;
    this.modelPath = modelPath;
    this.meshPrefix = meshPrefix;
    this.meta = meta;
  }
  getPickupPayload() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      meshPrefix: this.meshPrefix,
      meta: this.meta,
    };
  }
}
export class WeaponItem extends GameItem {
  constructor({ id, name, modelPath, meshPrefix = null, meta = {} }) {
    super({ id, name, type: 'weapon', modelPath, meshPrefix, meta });
  }
}
export class HelmetItem extends GameItem {
  constructor({ id, name, modelPath, meshPrefix = null, meta = {} }) {
    super({ id, name, type: 'helmet', modelPath, meshPrefix, meta });
  }
}
export class ShieldItem extends GameItem {
  constructor({ id, name, modelPath, meshPrefix = null, meta = {} }) {
    super({ id, name, type: 'shield', modelPath, meshPrefix, meta });
  }
}
export class SpecialItem extends GameItem {
  constructor({ id, name, modelPath, meshPrefix = null, meta = {} }) {
    super({ id, name, type: 'special', modelPath, meshPrefix, meta });
  }
  async specialPickup(){
    console.log("TRANSFORMING");
    gameManager.controller = await gameManager.controller.transform('wyvern');
  };
}
