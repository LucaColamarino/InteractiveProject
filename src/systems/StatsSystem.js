// systems/StatsSystem.js
export class StatsSystem {
  constructor(maxHP = 100, maxStamina = 100, maxMana = 50) {
    this.maxHP = maxHP;   this.hp = maxHP;
    this.maxStamina = maxStamina; this.stamina = maxStamina;
    this.maxMana = maxMana; this.mana = maxMana;

    this._listeners = [];
    // --- cooldown rigenerazione stamina dopo uso intenso ---
    this._staminaCd = 0;             // secondi rimanenti
    this._staminaCdDefault = 0.6;    // tweakabile
  }

  onChange(cb){ this._listeners.push(cb); }
  _notify(){ this._listeners.forEach(cb => cb(this)); }

  // ========== HP ==========
  damage(n){ this.hp = Math.max(0, this.hp - n); this._notify(); }
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
}
