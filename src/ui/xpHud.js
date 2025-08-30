export function renderXPHud(stats) {
  if(!stats) return;
  const pill = document.getElementById('mm-level');
  const bar = document.getElementById('xp-bar');
  const text = document.getElementById('xp-text');

  if (pill) pill.textContent = `🧬 LVL ${stats.level}`;
  if (bar)  bar.style.width = `${Math.round(stats.progress * 100)}%`;
  if (text) text.textContent = `${stats.xp} / ${stats.xpToNextLevel}`;
}
