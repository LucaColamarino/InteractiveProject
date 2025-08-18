// hudManager.js
import * as THREE from 'three';
import { getCurrentArea }from '../map/areaManager.js'

function $(id) {
  return /** @type {HTMLElement|null} */ (document.getElementById(id));
}

const els = {
  coords: null,
  compass: null,
  zone: null,
  gameTime: null,
  enemiesNearby: null,
  healthBar: null, healthText: null,
  manaBar: null, manaText: null,
  staminaBar: null, staminaText: null,
  formAvatar: null, formName: null, formLevel: null, transformCd: null,
  mmEnemies: null, mmTime: null, mmCoords: null,
  notificationBar: null
};

export const hudManager = {
  init() {
    els.notificationBar = $('notifications');
    els.coords = $('coords');                 // "X: ..., Y: ..., Z: ..."
    els.compass = $('compass-dir');           // "N / E / S / W"
    els.zone = $('zone-name');                // "Human Territory"
    els.gameTime = $('game-time');            // "Dawn • 06:42"
    els.enemiesNearby = $('enemies-nearby');  // "3 enemies nearby"
    els.healthBar = $('health-bar');  els.healthText = $('health-text');
    els.manaBar   = $('mana-bar');    els.manaText   = $('mana-text');
    els.staminaBar= $('stamina-bar'); els.staminaText= $('stamina-text');
    els.formAvatar = $('form-avatar'); els.formName = $('form-name');
    els.formLevel  = $('form-level');  els.transformCd = $('transform-cooldown');
    els.mmEnemies = document.getElementById('mm-enemies');
    els.mmTime    = document.getElementById('mm-time');
    els.mmCoords  = document.getElementById('mm-coords');
    console.log('[HUD] init ok');
  },

  /**
   * @param {*} player
   * @param {*} controller
   * @param {THREE.Camera} camera
   * @param {Array=} enemies
   */
  update(player, controller, camera, enemies = []) {
if (els.mmCoords && player?.model) {
  const p = player.model.position;
  els.mmCoords.textContent = `📍 ${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}`;
}
    if (els.mmEnemies && player?.model) {
  const pos = player.model.position;
  const near = enemies.filter(e => e?.model?.position?.distanceTo?.(pos) < 80).length;
  els.mmEnemies.textContent = `🎯 ${near}`;
}
if (els.mmTime) {
  const now = performance.now() / 1000;
  const minutes = Math.floor(now % 60).toString().padStart(2, '0');
  const hours = (6 + Math.floor((now / 10) % 18)).toString().padStart(2, '0');
  els.mmTime.textContent = `⏰ ${hours}:${minutes}`;
}
    // Compass
    if (els.compass && camera) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const deg = THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z));
      let compassDir = 'N';
      if (deg >= -45 && deg < 45) compassDir = 'N';
      else if (deg >= 45 && deg < 135) compassDir = 'E';
      else if (deg >= -135 && deg < -45) compassDir = 'W';
      else compassDir = 'S';
      els.compass.textContent = compassDir;
    }

    // Zone
    if (els.zone && player?.model) {
      els.zone.textContent = getCurrentArea(player.model.position);
    }

    // Enemies nearby (entro 80m)
    if (els.enemiesNearby && player?.model && enemies?.length) {
      const pos = player.model.position;
      const near = enemies.filter(e => e?.model?.position?.distanceTo?.(pos) < 80).length;
      els.enemiesNearby.textContent = `${near} enemies nearby`;
    }

    // Game time (mostra solo un orologio fittizio, opzionale)
    if (els.gameTime) {
      const now = performance.now() / 1000;
      const minutes = Math.floor(now % 60).toString().padStart(2, '0');
      const hours = (6 + Math.floor((now / 10) % 18)).toString().padStart(2, '0'); // 06..23
      els.gameTime.textContent = `Time • ${hours}:${minutes}`;
    }

    // Form info
    if (els.formName && controller?.abilities?.formName) {
      els.formName.textContent = controller.abilities.formName.toUpperCase();
    }
    if (els.formAvatar && controller?.abilities?.formName) {
      // Emoji rapide per distinguere
      const map = { human: '🧙‍♂️', werewolf: '🐺', wyvern: '🐉' };
      els.formAvatar.textContent = map[controller.abilities.formName] ?? '✨';
    }
    if (els.formLevel) {
      // se non hai livelli reali, mantieni un placeholder
      els.formLevel.textContent = 'Level 5';
    }
    if (els.transformCd) {
      // se non hai cooldown reale, placeholder
      els.transformCd.textContent = 'Ready';
    }

    // Vitals (se non hai valori reali, lascia gli attuali)
    // Puoi collegare qui i tuoi valori reali: controller.health/mana/stamina ecc.
    // Esempio di wiring (sostituisci con i tuoi campi se esistono):
    /*
    const hp = controller?.stats?.hp ?? 850; const hpMax = controller?.stats?.hpMax ?? 1000;
    if (els.healthBar) els.healthBar.style.width = `${(hp / hpMax) * 100}%`;
    if (els.healthText) els.healthText.textContent = `${hp} / ${hpMax}`;

    const mp = controller?.stats?.mp ?? 300; const mpMax = controller?.stats?.mpMax ?? 500;
    if (els.manaBar) els.manaBar.style.width = `${(mp / mpMax) * 100}%`;
    if (els.manaText) els.manaText.textContent = `${mp} / ${mpMax}`;
    */


  },
showNotification(text) {
  if (!els.notificationBar) return;

  const div = document.createElement('div');
  div.className = 'notification';
  div.textContent = text;

  els.notificationBar.appendChild(div);

  // Auto-rimuovi dopo 4 secondi
  setTimeout(() => {
    div.remove();
  }, 4000);
}
};
