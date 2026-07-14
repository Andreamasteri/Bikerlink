// Task #9 (Quebracho b) — Helper di cablaggio "gate/registration only".
//
// Non prende il controllo della schedulazione dei ~26 loop esistenti (i loro
// setInterval/cron/setTimeout restano l'unica fonte di verità del "quando"):
// aggiunge SOLO un controllo `canRunJob(name)` all'inizio del callback già
// esistente + una registrazione nel job-registry (per visibilità/pausa da
// Quebracho/admin). Nessuna riscrittura della logica interna del job.
import { canRunJob } from "./job-gate";
import { registerJob } from "./job-registry";
import { dedupWarn } from "../../lib/dedup-logger";

export interface GatedJobOptions {
  /** true se il job è critico (non va mai sospeso automaticamente in fallback). */
  critical?: boolean;
}

/** Registra il job nel coordinatore (idempotente, "gate-only": nessun callback `run`). */
export function registerGatedJob(name: string, opts?: GatedJobOptions): void {
  registerJob(name, { critical: opts?.critical ?? false });
}

/**
 * Avvolge un callback di schedulazione esistente con il gate unico
 * `canRunJob(name)`. Se il gate nega, il job viene saltato (loggato via
 * dedupWarn, mai lanciato) e la schedulazione esterna prosegue invariata al
 * giro successivo. Fail-open per costruzione (canRunJob non lancia mai).
 *
 * Preserva il tipo di ritorno di `fn`: quando il gate nega, restituisce
 * `undefined` invece del valore atteso — i chiamanti che usano il valore di
 * ritorno DEVONO gestire il caso skip (vedi commenti ai call-site).
 */
export function withJobGate<Args extends unknown[], R>(
  name: string,
  fn: (...args: Args) => Promise<R> | R,
  opts?: GatedJobOptions,
): (...args: Args) => Promise<R | undefined> {
  registerGatedJob(name, opts);
  return async (...args: Args): Promise<R | undefined> => {
    let decision;
    try {
      decision = await canRunJob(name);
    } catch {
      decision = { allowed: true } as { allowed: boolean }; // fail-open extra di sicurezza
    }
    if (!decision.allowed) {
      dedupWarn(
        `quebracho-gate-skip:${name}`,
        `[quebracho] job "${name}" saltato — ${"reason" in decision ? decision.reason : "n/d"} (source=${"source" in decision ? decision.source : "n/d"})`,
      );
      return undefined;
    }
    return await fn(...args);
  };
}
