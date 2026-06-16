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
