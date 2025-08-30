import { gameManager } from "../managers/gameManager";
import { deathScreen } from "../ui/deathScreen";
import { hudManager } from "../ui/hudManager";
import { renderXPHud } from "../ui/xpHud";
export let xp = null;
// systems/StatsSystem.js
export class StatsSystem {
  constructor(maxHP = 100, maxStamina = 100, maxMana = 50,armor = 0) {
    this.maxHP = maxHP;   this.hp = maxHP;
    this.maxStamina = maxStamina; this.stamina = maxStamina;
    this.maxMana = maxMana; this.mana = maxMana;
    this.armor = armor;
    this.levelPoints = 5; // punti iniziali disponibili per upgrade
    this._listeners = [];
    this._staminaCd = 0;
    this._staminaCdDefault = 0.6;
    this.level =1;
    this.xp =0;
  }
  xpCurve = (level) => Math.floor(10 * Math.pow(level, 1.5));
  get xpToNextLevel() { return this.xpCurve(this.level); }
  get progress() { return Math.min(1, this.xp / this.xpToNextLevel); }
  addXp(amount) {
    this.xp += amount;
    let leveledUp = false;
    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level++;
      leveledUp = true;
      this.levelPoints+=1;
    }
    renderXPHud(this);
    hudManager?.showNotification("LEVEL UP!");
    return leveledUp;
  }
  onChange(cb){ this._listeners.push(cb); }
  _notify(){ this._listeners.forEach(cb => cb(this)); }
  damage(n){
      try {
        console.log(gameManager.controller.effects);
        gameManager.controller.effects.onHit({ dmg: n, type: 'normal' });
      } catch {console.log("[StatsSystem] damage error");}
     console.log("OUCH");
     const damage = n*(1-this.armor/100);
     this.hp = Math.max(0, this.hp - damage);
     this._notify(); 
      if (this.hp === 0) this.die();
    }
  die(causa="")
  {
    console.log("GAME OVER");
    deathScreen.show({ cause: causa || 'Your journey ends here...' });

  }
  heal(n){ this.hp = Math.min(this.maxHP, this.hp + n); this._notify(); }
  useStamina(n){
    if (this.stamina >= n) {
      this.stamina -= n;
      this._staminaCd = this._staminaCdDefault;
      this._notify();
      return true;
    }
    return false;
  }
  drainStaminaForSprint(dt, costPerSec = 12, minToStart = 5){
    // se non c'è abbastanza stamina per mantenere il frame corrente → stop
    const cost = costPerSec * dt;
    if (this.stamina < (this.stamina <= 0 ? 0 : cost)) return false;

    // se stai appena iniziando lo sprint richiedi una soglia minima
    if (this.stamina < minToStart && cost > 0) return false;

    this.stamina = Math.max(0, this.stamina - cost);
    this._staminaCd = this._staminaCdDefault;
    this._notify();
    return true;
  }
  regenStamina(dt, rate = 8){
    if (this._staminaCd > 0){
      this._staminaCd = Math.max(0, this._staminaCd - dt);
      return; // niente regen durante il cooldown
    }
    const before = this.stamina;
    this.stamina = Math.min(this.maxStamina, this.stamina + rate * dt);
    if (this.stamina !== before) this._notify();
  }
  useMana(n){
    if (this.mana >= n){ this.mana -= n; this._notify(); return true; }
    return false;
  }
  regenMana(dt, rate = 3){
    const before = this.mana;
    this.mana = Math.min(this.maxMana, this.mana + rate * dt);
    if (this.mana !== before) this._notify();
  }
  upgrade(stat) {
  if (this.levelPoints <= 0) return false;
  switch(stat){
    case 'hp':
      this.maxHP += 10;
      this.hp = this.maxHP;
      break;
    case 'stamina':
      this.maxStamina += 5;
      this.stamina = this.maxStamina;
      break;
    case 'mana':
      this.maxMana += 5;
      this.mana = this.maxMana;
      break;
    default: return false;
  }
  this.levelPoints--;
  this._notify();
  return true;
}
}
