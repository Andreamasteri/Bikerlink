import type { Request, Response, NextFunction } from "express";

export const initState = {
  // True dal boot fino a quando TUTTE le fasi (migration, seed, scheduler) sono
  // complete. Il gate /api/* in server/index.ts usa questo flag per il 503.
  initializing: true,
  // True non appena le migration sono applicate: schema + tabella session pronti.
  // Permette al gate di lasciar passare le rotte auth essenziali (login, me,
  // logout) durante la finestra di init, prima che initializing diventi false.
  dbReady: false,
};

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
