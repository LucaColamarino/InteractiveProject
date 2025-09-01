let _prev = { hp: null, mana: null, stamina: null };
function showVitalBadge(containerEl, kind, text, ms = 1000) {
  if (!containerEl) return;
  let badge = containerEl.querySelector('.vital-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = `vital-badge ${kind}`;
    containerEl.appendChild(badge);
  } else {
    badge.classList.remove('health', 'mana', 'stamina');
    badge.classList.add(kind);
  }
  badge.textContent = text;
  badge.classList.add('show');
  if (badge._hideT) { clearTimeout(badge._hideT); }
  badge._hideT = setTimeout(() => {
    badge.classList.remove('show');
    badge._hideT = null;
  }, ms);
}
export function updateVitalsHUD(stats) {
  //HEALTH
  const healthContainer = document.querySelector('[aria-label="Salute"]');
  const healthBar = document.querySelector('#health-bar');
  const healthText = document.querySelector('#health-text');
  if (healthBar && healthText) {
    const hp = Math.max(0, stats.hp ?? 0);
    const hpPct = stats.maxHP ? (hp / stats.maxHP) * 100 : 0;
    healthBar.style.width = `${hpPct}%`;
    healthText.textContent = `${Math.floor(hp)} / ${stats.maxHP ?? 0}`;
    if (healthContainer) {
      healthContainer.setAttribute('aria-valuenow', String(Math.round(hpPct)));
    }
    if (stats.maxHP && hp / stats.maxHP < 0.10) {
      healthBar.classList.add('low-vital');
    } else {
      healthBar.classList.remove('low-vital');
    }
    if (_prev.hp > 0 && hp === 0 && healthContainer) {
      showVitalBadge(healthContainer, 'health', '❤️ Salute a 0!');
    }
    _prev.hp = hp;
  }
//MANA
  const manaContainer = document.querySelector('[aria-label="Mana"]');
  const manaBar = document.querySelector('#mana-bar');
  const manaText = document.querySelector('#mana-text');
  if (manaBar && manaText) {
    const mana = Math.max(0, stats.mana ?? 0);
    const manaPct = stats.maxMana ? (mana / stats.maxMana) * 100 : 0;
    manaBar.style.width = `${manaPct}%`;
    manaText.textContent = `${Math.floor(mana)} / ${stats.maxMana ?? 0}`;
    if (manaContainer) {
      manaContainer.setAttribute('aria-valuenow', String(Math.round(manaPct)));
    }
    if (stats.maxMana && mana / stats.maxMana < 0.10) {
      manaBar.classList.add('low-vital');
    } else {
      manaBar.classList.remove('low-vital');
    }
    if (_prev.mana > 0 && mana === 0 && manaContainer) {
      showVitalBadge(manaContainer, 'mana', '💙 Mana esaurito');
    }
    _prev.mana = mana;
  }
  // ------- STAMINA -------
  const staminaContainer = document.querySelector('[aria-label="Stamina"]');
  const staminaBar = document.querySelector('#stamina-bar');
  const staminaText = document.querySelector('#stamina-text');
  if (staminaBar && staminaText) {
    const stamina = Math.max(0, stats.stamina ?? 0);
    const staminaPct = stats.maxStamina ? (stamina / stats.maxStamina) * 100 : 0;
    staminaBar.style.width = `${staminaPct}%`;
    staminaText.textContent = `${Math.floor(stamina)} / ${stats.maxStamina ?? 0}`;
    if (staminaContainer) {
      staminaContainer.setAttribute('aria-valuenow', String(Math.round(staminaPct)));
    }
    if (stats.maxStamina && stamina / stats.maxStamina < 0.10) {
      staminaBar.classList.add('low-vital');
    } else {
      staminaBar.classList.remove('low-vital');
    }
    if (_prev.stamina > 0 && stamina === 0 && staminaContainer) {
      showVitalBadge(staminaContainer, 'stamina', '⚡ Stamina esaurita');
    }
    _prev.stamina = stamina;
  }

}
