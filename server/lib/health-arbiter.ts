// === CONTROL PLANE — Health Arbiter ===
// Task #5124 — Source of truth UNIFICATA per lo stato di salute operativo del
// backend. Fonde le "slice" indipendenti dei vari sottosistemi e calcola lo
// stato globale come il PEGGIORE tra le slice.
//
// Tre stati espliciti, ordinati per gravità crescente:
//   • READY     — tutto ok.
//   • DEGRADED  — il server serve ancora, ma un sottosistema non-critico è ko.
//   • BROKEN    — un sottosistema critico è giù (es. circuit breaker DB aperto).
//
// CONFINI (Control Plane vs Observability Plane):
//   • Control Plane (init, db-breaker): ALTERA davvero lo stato operativo. Quando
//     marca BROKEN/DEGRADED, riflette una condizione che impatta il servizio.
//   • Observability Plane (watchdog, db-integrity): OSSERVA e alimenta l'arbiter
//     con segnali di salute, ma NON cambia il comportamento operativo del server.
//     Le sue slice contribuiscono allo stato globale solo come input informativo.
//
// Tutti i consumer (in primis /api/health) leggono da qui via getHealthState().

export type HealthState = "READY" | "DEGRADED" | "BROKEN";

export type HealthSource =
  | "init" // Control Plane — initState.markDegraded/clearDegraded
  | "db-breaker" // Control Plane — db circuit breaker open/close
  | "watchdog" // Observability Plane — aggregator snapshot critical/high
  | "db-integrity"; // Observability Plane — violazioni critical persistenti

interface Slice {
  state: HealthState;
  reasons: string[];
  updatedAt: number;
}

const SEVERITY: Record<HealthState, number> = { READY: 0, DEGRADED: 1, BROKEN: 2 };

const ALL_SOURCES: HealthSource[] = ["init", "db-breaker", "watchdog", "db-integrity"];

const slices: Record<HealthSource, Slice> = {
  init: { state: "READY", reasons: [], updatedAt: Date.now() },
  "db-breaker": { state: "READY", reasons: [], updatedAt: Date.now() },
  watchdog: { state: "READY", reasons: [], updatedAt: Date.now() },
  "db-integrity": { state: "READY", reasons: [], updatedAt: Date.now() },
};

// Aggiorna la slice di una source. Idempotente: se stato e motivi non cambiano
// non logga. I motivi sono de-duplicati e troncati per evitare crescita illimitata.
export function setHealthState(source: HealthSource, state: HealthState, reasons: string[] = []): void {
  const prev = slices[source];
  const nextReasons = [...new Set(reasons.filter(Boolean))].slice(0, 20);
  const changed = prev.state !== state || prev.reasons.join("|") !== nextReasons.join("|");
  slices[source] = { state, reasons: nextReasons, updatedAt: Date.now() };
  if (prev.state !== state) {
    const detail = nextReasons.length ? ` (${nextReasons.join("; ")})` : "";
    console.warn(`[health-arbiter] ${source}: ${prev.state} → ${state}${detail}`);
  } else if (changed && state !== "READY") {
    console.warn(`[health-arbiter] ${source}: ${state} reasons aggiornati (${nextReasons.join("; ")})`);
  }
}

// Riporta una slice a READY (caso più comune: recupero di un sottosistema).
export function clearHealthState(source: HealthSource): void {
  setHealthState(source, "READY", []);
}

export interface HealthStateSnapshot {
  state: HealthState;
  reasons: string[];
  slices: Record<HealthSource, { state: HealthState; reasons: string[]; updatedAt: string }>;
}

// Stato globale = peggiore tra le slice. reasons aggrega i motivi di TUTTE le
// slice non-READY, prefissate con la source per tracciabilità.
export function getHealthState(): HealthStateSnapshot {
  let worst: HealthState = "READY";
  const reasons: string[] = [];
  const out = {} as HealthStateSnapshot["slices"];
  for (const key of ALL_SOURCES) {
    const s = slices[key];
    if (SEVERITY[s.state] > SEVERITY[worst]) worst = s.state;
    for (const r of s.reasons) reasons.push(`[${key}] ${r}`);
    out[key] = { state: s.state, reasons: s.reasons, updatedAt: new Date(s.updatedAt).toISOString() };
  }
  return { state: worst, reasons, slices: out };
}

// Comodità: solo lo stato globale.
export function getGlobalHealth(): HealthState {
  return getHealthState().state;
}
