// Task #23 — Gate di priorità in-process per l'AI.
//
// Le chiamate AI reali per la GENERAZIONE DI PERCORSI (decideEngineWithAI) e il
// ciclo diagnostico di background di Horus colpiscono lo stesso Ollama self-hosted.
// Lo scheduler Ollama in provider.ts è pass-through (NON passa da Bottleneck), quindi
// un limiter cloud non le coordina. Questo gate leggerissimo dà PRIORITÀ al routing:
// mentre una richiesta di routing è in volo (più una breve finestra di grazia), il
// ciclo diagnostico di Horus cede il turno — SENZA cambiare la cadenza dello scheduler.
//
// Non tocca i Bottleneck cloud: è solo un contatore in-process + timestamp.

let activeCount = 0;
let lastActiveAt = 0;
let totalRoutingCalls = 0;

/**
 * Finestra di grazia dopo l'ultima chiamata di routing durante la quale il sistema
 * è ancora considerato "occupato". Copre la raffica di richieste ravvicinate
 * (es. dual-route compare) evitando che Horus si infili tra una e l'altra.
 */
const GRACE_MS = 2_000;

/**
 * Segna una chiamata AI di routing come prioritaria per tutta la sua durata.
 * Avvolgi qui la chiamata AI reale del percorso (decideEngineWithAI).
 */
export async function withRoutingAiPriority<T>(fn: () => Promise<T>): Promise<T> {
  activeCount++;
  totalRoutingCalls++;
  lastActiveAt = Date.now();
  try {
    return await fn();
  } finally {
    activeCount--;
    lastActiveAt = Date.now();
  }
}

/**
 * true se una chiamata AI di routing è in corso oppure è terminata da meno di
 * GRACE_MS. Il ciclo di background di Horus deve cedere quando è true.
 */
export function isRoutingAiBusy(nowMs: number = Date.now()): boolean {
  if (activeCount > 0) return true;
  return lastActiveAt > 0 && nowMs - lastActiveAt < GRACE_MS;
}

export function getRoutingAiPriorityStats(): {
  active: number;
  busy: boolean;
  totalRoutingCalls: number;
  lastActiveAt: string | null;
} {
  return {
    active: activeCount,
    busy: isRoutingAiBusy(),
    totalRoutingCalls,
    lastActiveAt: lastActiveAt > 0 ? new Date(lastActiveAt).toISOString() : null,
  };
}

/** Solo per i test: azzera lo stato del gate. */
export function _resetRoutingAiPriorityForTests(): void {
  activeCount = 0;
  lastActiveAt = 0;
  totalRoutingCalls = 0;
}
