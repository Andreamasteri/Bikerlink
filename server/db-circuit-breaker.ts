// === CONTROL PLANE ===
// Il circuit breaker DB ALTERA lo stato operativo: quando è OPEN le query vengono
// bloccate a monte (le API degradano con 503 veloce). Le sue transizioni
// aggiornano la slice "db-breaker" dell'Health Arbiter — OPEN ⇒ BROKEN (critico),
// HALF_OPEN ⇒ DEGRADED (verifica in corso), CLOSED ⇒ READY. È un definitore di
// salute, non un semplice osservatore.
import { setHealthState, clearHealthState } from "./lib/health-arbiter";

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 30_000;

let state: CircuitState = "CLOSED";
let consecutiveFailures = 0;
let openedAt: number | null = null;

function transition(next: CircuitState): void {
  if (next === state) return;
  console.warn(`[db-circuit-breaker] ${state} → ${next}`);
  state = next;
  if (next === "OPEN") {
    setHealthState("db-breaker", "BROKEN", [
      `circuit breaker DB aperto (${consecutiveFailures} fallimenti consecutivi)`,
    ]);
  } else if (next === "HALF_OPEN") {
    setHealthState("db-breaker", "DEGRADED", ["circuit breaker DB in verifica (HALF_OPEN)"]);
  } else {
    clearHealthState("db-breaker");
  }
}

export function isOpen(): boolean {
  if (state === "CLOSED") return false;

  if (state === "OPEN") {
    if (openedAt !== null && Date.now() - openedAt >= RESET_TIMEOUT_MS) {
      transition("HALF_OPEN");
      return false;
    }
    return true;
  }

  return false;
}

export function recordSuccess(): void {
  consecutiveFailures = 0;
  openedAt = null;
  transition("CLOSED");
}

export function recordFailure(err?: unknown): void {
  const msg = err instanceof Error ? err.message : String(err ?? "unknown");
  consecutiveFailures += 1;
  console.warn(`[db-circuit-breaker] failure #${consecutiveFailures}: ${msg}`);

  if (consecutiveFailures >= FAILURE_THRESHOLD && state !== "OPEN") {
    openedAt = Date.now();
    transition("OPEN");
  }
}

export function getState(): CircuitState {
  isOpen();
  return state;
}

export function getCircuitStatus(): {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: string | null;
} {
  isOpen();
  return {
    state,
    consecutiveFailures,
    openedAt: openedAt !== null ? new Date(openedAt).toISOString() : null,
  };
}
