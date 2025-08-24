export class AttackStrategy {
  onEquip(controller, weaponItem) {}          // opzionale: set up (mesh debug, parametri)
  attack(controller, clipName='attack') {}    // avvia animazione / stato
  update(controller, dt) {}                   // finestre di hit, proiettili, ecc.
  cancel(controller) {}                       // cleanup
}