import { gameManager } from "../managers/gameManager";

// systems/StatsSystem.js
export class StatsSystem {
  constructor(maxHP = 100, maxStamina = 100, maxMana = 50,armor = 0) {
    this.maxHP = maxHP;   this.hp = maxHP;
    this.maxStamina = maxStamina; this.stamina = maxStamina;
    this.maxMana = maxMana; this.mana = maxMana;
    this.armor = armor;
    this.levelPoints = 3; // punti iniziali disponibili per upgrade
    this._listeners = [];
    this._staminaCd = 0;
    this._staminaCdDefault = 0.6;
  }

  onChange(cb){ this._listeners.push(cb); }
  _notify(){ this._listeners.forEach(cb => cb(this)); }

  // ========== HP ==========
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
  die()
  {
    console.log("GAME OVER");
  }
  heal(n){ this.hp = Math.min(this.maxHP, this.hp + n); this._notify(); }

  // ========== STAMINA ==========
  useStamina(n){
    if (this.stamina >= n) {
      this.stamina -= n;
      this._staminaCd = this._staminaCdDefault;
      this._notify();
      return true;
    }
    return false;
  }

  /**
   * Consumo continuo per sprint: costo al secondo.
   * Ritorna true se lo sprint può continuare in questo frame.
   */
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

  // ========== MANA ==========
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
