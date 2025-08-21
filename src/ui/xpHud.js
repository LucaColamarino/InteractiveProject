// src/ui/xpHud.js
let els = null;

export function initXPHud() {
  els = {
    pillLevel: document.getElementById('mm-level'),
    bar: document.getElementById('xp-bar'),
    text: document.getElementById('xp-text'),
    noteArea: document.getElementById('notifications'),
  };
}

export function renderXPHud(levelSystem) {
  if (!els) initXPHud();
  if (els.pillLevel) els.pillLevel.textContent = `🧬 LVL ${levelSystem.level}`;
  if (els.bar) els.bar.style.width = `${Math.round(levelSystem.progress * 100)}%`;
  if (els.text) els.text.textContent = `${levelSystem.xp} / ${levelSystem.xpToNextLevel}`;
}

export function toastLevelUp(newLevel) {
  if (!els || !els.noteArea) return;
  const div = document.createElement('div');
  div.className = 'notification';
  div.textContent = `🎉 Level Up! Sei al livello ${newLevel}`;
  els.noteArea.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}
