// src/systems/LevelSystem.js
export class LevelSystem {
  constructor({
    startingLevel = 1,
    startingXP = 0,
    xpCurve = (level) => Math.floor(100 * Math.pow(level, 1.5))
  } = {}) {
    this.level = startingLevel;
    this.xp = startingXP;
    this.xpCurve = xpCurve;
  }
  get xpToNextLevel() { return this.xpCurve(this.level); }
  get progress() { return Math.min(1, this.xp / this.xpToNextLevel); }

  addXP(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      leveledUp = true;
    }
    return leveledUp;
  }

  toJSON() { return { level: this.level, xp: this.xp }; }
  load(obj) {
    if (!obj) return;
    this.level = obj.level ?? this.level;
    this.xp = obj.xp ?? this.xp;
  }
}
