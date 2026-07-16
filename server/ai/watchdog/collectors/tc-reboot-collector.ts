// Collector TC reboot latency (Task #178) — detecta riavvii del ThinkCentre
// misurando il gap tra la prima probe fallita e il recovery HTTP. Se il gap è
// >90s emettiamo un segnale "high" per catturare regressioni del kernel (es.
// cgroup_drain_dying deadlock su Ubuntu 26.04 kernel 7.0.0-22-generic che
// causava un hang da 600s allo shutdown — Task #174).
//
// Heuristica reboot:
//   - outage breve: REBOOT_MIN_OUTAGE_MS (30s) ≤ durata ≤ REBOOT_MAX_OUTAGE_MS (15min)
//   - non impostata la modalità "powered_off" nell'AppSetting (quella è manutenzione intenzionale)
//
// Probe: riusa hubGet("/health") dall'ai-hub-client — stesso endpoint/auth
// dell'ai-hub-collector, con timeout ridotto (5s) per non rallentare il ciclo.
// Se ai-hub non è configurato, il collector salta silenziosamente (nessun segnale).
//
// La probe non interferisce con l'ai-hub-collector: entrambi fanno GET /health,
// ma il collector reboot si interessa SOLO al gap temporale, non allo stato
// dell'hub stesso (setHubReachable è responsabilità dell'ai-hub-collector).
import type { Signal } from "../types";
import { isHubConfigured, hubGet } from "../../../lib/ai-hub-client";
import { isThinkCentrePoweredOff } from "../../../lib/thinkcentre-powered-off";

// ---- soglie -----------------------------------------------------------
// Outage < 30s → glitch di rete transitorio, ignora (non un reboot).
const REBOOT_MIN_OUTAGE_MS = 30_000;
// Outage > 15 min → manutenzione prolungata o powered-off dimenticato, ignora.
const REBOOT_MAX_OUTAGE_MS = 15 * 60_000;
// Reboot lento: recovery oltre 90s → segnale "high" (indica possibile bug kernel).
const SLOW_REBOOT_THRESHOLD_MS = 90_000;

// ---- stato persistente del collector ----------------------------------
// Timestamp del primo tick in cui il TC è risultato irraggiungibile.
// Viene SEMPRE azzerato quando il TC torna raggiungibile, qualunque sia la
// durata dell'outage — così un glitch transitorio (<30s) non lascia stale
// state che si accumula fino a superare le soglie artificialmente.
let firstDownAt: number | null = null;
// Timestamp dell'ultimo alert "reboot lento" emesso: previene duplicati.
let slowRebootAlertEmittedAt: number | null = null;
// True dopo la prima probe riuscita nella sessione: consente di distinguere
// "mai raggiunto in questa sessione" (wait boot) da "era su, poi è andato giù".
let hadSuccessfulProbe = false;

// ---- probe HTTP -------------------------------------------------------
// Usa lo stesso hubGet dell'ai-hub-collector, ma con un timeout più corto (5s):
// vogliamo rilevare la transizione down→up il prima possibile senza bloccare
// il ciclo watchdog. Un timeout di 5s è sufficiente: se il TC sta bootando,
// il servizio non risponde affatto, non risponde lentamente.
async function probeTcHealthForReboot(): Promise<boolean> {
  try {
    // Limita a 5s via Promise.race: hubGet non espone il timeout come parametro.
    const timeoutPromise = new Promise<{ ok: false }>((resolve) =>
      setTimeout(() => resolve({ ok: false }), 5_000),
    );
    const result = await Promise.race([hubGet("/health"), timeoutPromise]);
    return result.ok && (result as { data?: { ok?: boolean } }).data?.ok !== false;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------
export async function collectTcReboot(): Promise<Signal[]> {
  // Salta se l'ai-hub non è configurato: nessun modo di sondare il TC.
  if (!isHubConfigured()) return [];

  // Se il TC è esplicitamente marcato "spento" dall'admin, una probe fallita
  // NON indica un reboot — indica manutenzione intenzionale. Non registrare lo
  // stato down in questo caso, così quando il TC torna su non calcoliamo un
  // "reboot" che in realtà era un power-off manuale.
  const poweredOff = await isThinkCentrePoweredOff().catch(() => false);

  const healthy = await probeTcHealthForReboot();
  const now = Date.now();

  if (healthy) {
    hadSuccessfulProbe = true;

    // IMPORTANTE: azzerare firstDownAt INCONDIZIONATAMENTE al primo tick sano,
    // indipendentemente da poweredOff e dalla durata dell'outage. Questo garantisce
    // che un toggle powered-off durante un'outage non lasci uno timestamp stantio
    // che, alla successiva probe sana con powered-off=false, genererebbe un falso
    // "tc.reboot_slow". Il flag poweredOff governa solo se emettere un segnale,
    // non se azzerare lo stato della macchina.
    const prevDownAt = firstDownAt;
    firstDownAt = null;

    if (prevDownAt !== null && !poweredOff) {
      // Recovery da uno stato di down non intenzionale: calcola la durata.
      const outageDurationMs = now - prevDownAt;

      if (outageDurationMs >= REBOOT_MIN_OUTAGE_MS && outageDurationMs <= REBOOT_MAX_OUTAGE_MS) {
        // Outage nella finestra "reboot": analizza la velocità.
        if (outageDurationMs > SLOW_REBOOT_THRESHOLD_MS) {
          // Reboot lento: possibile bug kernel o servizi lenti allo shutdown/startup.
          // De-duplication: un solo alert per "evento di reboot" (120s di grazia).
          if (slowRebootAlertEmittedAt !== null && now - slowRebootAlertEmittedAt < 120_000) {
            return []; // già emesso per questo reboot
          }
          slowRebootAlertEmittedAt = now;
          const outageSec = Math.round(outageDurationMs / 1000);
          return [{
            source: "tc",
            metric: "tc.reboot_slow",
            value: outageSec,
            unit: "s",
            severity: "high",
            details: {
              outageSec,
              thresholdSec: SLOW_REBOOT_THRESHOLD_MS / 1000,
              hint: "Riavvio del ThinkCentre più lento del normale (>90s). Possibile regressione kernel (es. cgroup_drain_dying deadlock Ubuntu 26.04). Considera l'upgrade a un kernel LTS dove il bug è confermato risolto.",
            },
          }];
        } else {
          // Reboot rapido: segnale info (nessun allarme, solo osservabilità).
          return [{
            source: "tc",
            metric: "tc.reboot_fast",
            value: Math.round(outageDurationMs / 1000),
            unit: "s",
            severity: "info",
            details: { outageSec: Math.round(outageDurationMs / 1000) },
          }];
        }
      }
      // Outage fuori dalla finestra reboot (<30s glitch oppure >15min outage):
      // nessun segnale. firstDownAt già azzerato sopra.
    }

    // TC su, nessuno stato down precedente da analizzare (o powered-off era attivo).
    return [];
  } else {
    // TC non raggiungibile.
    if (!poweredOff && hadSuccessfulProbe && firstDownAt === null) {
      // Prima volta che vediamo il TC giù in questa sessione (dopo almeno un successo):
      // registra il timestamp per misurare la durata dell'outage.
      firstDownAt = now;
    }
    return [];
  }
}

// Esposto solo per i test: azzera lo stato del collector tra un test e l'altro.
export function _resetTcRebootStateForTests(): void {
  firstDownAt = null;
  slowRebootAlertEmittedAt = null;
  hadSuccessfulProbe = false;
}
