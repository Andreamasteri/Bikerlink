import type { Request, Response, NextFunction } from "express";
import { setHealthState, clearHealthState } from "./lib/health-arbiter";

// === CONTROL PLANE ===
// initState ALTERA lo stato operativo del server: il flag `initializing` guida il
// gate 503 su /api/*, e `degraded` riflette un sottosistema non-critico in errore
// (post-READY, mai fatale). Le transizioni qui sotto aggiornano la slice "init"
// dell'Health Arbiter (server/lib/health-arbiter.ts), unica source of truth letta
// da /api/health. Non è un osservatore: è uno dei sistemi che DEFINISCE la salute.

export const initState = {
  // True dal boot fino a quando le fasi CRITICHE (listen, migration, drift guard,
  // DB init, seed + engine) sono complete. Il gate /api/* in server/index.ts usa
  // questo flag per il 503. Schedulers/warmup post-READY NON lo tengono true.
  initializing: true,
  // True non appena le migration sono applicate: schema + tabella session pronti.
  // Permette al gate di lasciar passare le rotte auth essenziali (login, me,
  // logout) durante la finestra di init, prima che initializing diventi false.
  dbReady: false,
  // True quando il server è READY ma uno o più sottosistemi NON critici sono in
  // errore (es. schedulers init fallito, index-drift in block mode, ThinkCentre
  // offline). NON è fatale: il server continua a servire. /api/health lo riporta
  // come status "degraded" (200, mai 500), così il probe non lo considera morto.
  degraded: false,
  degradedReasons: [] as string[],
};

// Marca lo stato degraded (post-READY, non fatale). Idempotente per `reason`.
export function markDegraded(reason: string): void {
  if (!initState.degradedReasons.includes(reason)) {
    initState.degradedReasons.push(reason);
    console.warn(`[BOOT][DEGRADED] ${reason}`);
  }
  initState.degraded = true;
  setHealthState("init", "DEGRADED", initState.degradedReasons);
}

// Rimuove un motivo di degraded; azzera il flag se non resta alcun motivo.
export function clearDegraded(reason: string): void {
  initState.degradedReasons = initState.degradedReasons.filter((r) => r !== reason);
  if (initState.degradedReasons.length === 0) {
    initState.degraded = false;
    clearHealthState("init");
  } else {
    setHealthState("init", "DEGRADED", initState.degradedReasons);
  }
}

// Task #2789 / #4455 — Rotte auth essenziali che il gate lascia passare appena
// le migration sono applicate (dbReady=true), prima della fine del boot, così
// l'utente non vede "Server occupato" al login durante la finestra di init di
// una nuova istanza autoscale.
export const INIT_ESSENTIAL_PATHS = new Set<string>([
  "/auth/login",
  "/auth/me",
  "/auth/logout",
]);

// Task #2789 / #4455 — Gate montato su /api/*: 503 mentre initState.initializing
// è true. Eccezioni:
//   • /api/health (initializing-aware).
//   • rotte auth essenziali (login, me, logout): appena dbReady=true lo schema
//     + la tabella session sono pronti, quindi queste rotte leggere procedono
//     senza attendere la fine dell'intero boot.
// Il DB circuit breaker sottostante continua a proteggere se il DB è davvero
// down. NB: req.path qui è relativo al mount "/api" (es. "/auth/login").
export function initGate(req: Request, res: Response, next: NextFunction) {
  if (!initState.initializing) return next();
  if (req.path === "/health") return next();
  if (initState.dbReady && INIT_ESSENTIAL_PATHS.has(req.path)) return next();
  res.setHeader("Retry-After", "3");
  return res.status(503).json({ status: "initializing", initializing: true });
}
