/**
 * scheduler.helpers.ts — successore di scheduler.ts
 *
 * Questo file è il "companion" pronto a ricevere i nuovi blocchi di logica
 * che non trovano più spazio in scheduler.ts (soglia ~600 righe).
 *
 * Aggiungere qui:
 *   - nuovi trigger/debouncer per eventi di matching
 *   - nuove fasi del ciclo on-demand
 *   - helper/utility di supporto all'engine
 *   - nuovi job periodici o cron
 *
 * Regole:
 *   - NON modificare scheduler.ts per spostare codice qui: farlo in un task dedicato
 *   - Esportare tutto ciò che deve essere consumato da scheduler.ts o da altri moduli
 *   - Mantenere la stessa convenzione di naming e logging di scheduler.ts
 *
 * Riga 1 di scheduler.ts originale registrata al momento della creazione: 558
 */

export {};
