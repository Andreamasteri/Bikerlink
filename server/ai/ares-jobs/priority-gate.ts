/**
 * Ares Jobs — gate di priorità interattivo (Task #87).
 *
 * Coordina i job lunghi con l'uso INTERATTIVO di Ares (consultazioni mid-chat).
 * Priorità chiara: la chat interattiva ha la precedenza. Il job di background,
 * PRIMA di ogni chiamata di un chunk, attende che Ares sia libero (nessuna
 * consultazione interattiva in corso), fino a un tetto massimo per non restare
 * bloccato per sempre. Le consultazioni interattive NON aspettano mai il job.
 *
 * In-process, mono-nodo: rispecchia il pattern di server/ai/ai-priority-gate.ts
 * (Horus/routing). VRAM eviction è un problema separato (vram-arbiter).
 */

import { IDLE_POLL_MS, IDLE_WAIT_MAX_MS } from "./constants";

let interactiveCount = 0;
let lastInteractiveAt = 0;
// Grazia dopo l'ultima consultazione: assorbe i micro-buchi tra due turni di chat.
const GRACE_MS = 2_000;

/** true se una consultazione interattiva di Ares è in corso o appena conclusa. */
export function isAresInteractiveBusy(): boolean {
  if (interactiveCount > 0) return true;
  return Date.now() - lastInteractiveAt < GRACE_MS;
}

/**
 * Avvolge una consultazione INTERATTIVA di Ares: la marca "busy" così il job di
 * background le cede la precedenza. Non blocca mai: la chat parte subito.
 */
export async function withAresInteractivePriority<T>(fn: () => Promise<T>): Promise<T> {
  interactiveCount++;
  try {
    return await fn();
  } finally {
    interactiveCount--;
    lastInteractiveAt = Date.now();
  }
}

/**
 * Il job di background attende qui che Ares sia libero prima di lanciare un chunk.
 * Ritorna quando è libero, quando scatta il tetto massimo (procede comunque, per
 * non morire di fame), o quando il job viene annullato (`signal`).
 */
export async function waitForAresIdle(signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + IDLE_WAIT_MAX_MS;
  while (isAresInteractiveBusy()) {
    if (signal?.aborted) return;
    if (Date.now() >= deadline) return;
    await new Promise<void>((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
}
