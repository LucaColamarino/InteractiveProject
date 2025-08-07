export function getCurrentArea(pos) {
  if (pos.x < -200) return 'werewolf';
  if (pos.x > 200) return 'wyvern';
  return 'human';
}
