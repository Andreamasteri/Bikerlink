// Task #154 — Interfaccia comune per il reset dello stato interno dei collector.
//
// Alcuni collector del watchdog mantengono contatori/latch in memoria di processo
// (es. anti-blip: N campioni consecutivi prima di escalare). Questi possono
// restare "appiccicati" dopo un incidente rientrato, tenendo un problema visibile
// nel pannello system-health finché il server non viene riavviato.
//
// Ogni modulo collector che espone stato persistente esporta una funzione
// `resetState()` conforme a questa interfaccia; l'endpoint admin
// POST /watchdog/reset-state le invoca tutte senza accoppiarsi ai dettagli
// interni dei singoli moduli. Ogni `resetState()` DEVE essere idempotente e non
// avere side-effect fuori dal proprio modulo.
export interface ICollectorReset {
  resetState(): void;
}
