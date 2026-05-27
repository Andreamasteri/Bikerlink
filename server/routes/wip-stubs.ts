// Task #2632 — Stub handlers per endpoint chiamati dal client ma senza
// implementazione backend reale. Strategia:
//
//   • GET stubs → 200 con SHAPE compatibile con il consumer client
//     (verificato file-per-file). Restituiscono dati "vuoti" sicuri
//     (array vuoti / zero counters) così la UI renderizza lo stato
//     "nessun dato" invece di crashare per `undefined.toFixed()` etc.
//
//   • MUTATION stubs (POST/PATCH/DELETE) → 501 Not Implemented con
//     payload { message } leggibile. Il client TanStack solleva
//     errore → onError mostra Alert "Funzione non disponibile" all'utente.
//     Cruciale: NON simulare successo. La feature è WIP e l'utente
//     deve sapere che l'azione non è andata a buon fine.
//
// Tutti gli endpoint usano requireAuth — preservano le semantica di
// autenticazione dell'API originale.
//
// Implementazione reale di ogni endpoint → task follow-up #2633.

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../lib/auth-middleware";

const router = Router();
const WIP_MSG = "Funzionalità in fase di implementazione (task #2633)";

function notImplemented(res: Response): void {
  res.status(501).json({ message: WIP_MSG, wip: true });
}

// ── /api/lastfm/connect (POST) ───────────────────────────────────────────
// Client: components/music/LastfmLoginModal.tsx invia { username }.
// Server reale richiede flusso /mobile-auth (username + password). Il
// modal mostra l'errore via setError(err.message).
router.post("/lastfm/connect", requireAuth, (_req: Request, res: Response) => {
  res.status(501).json({ message: "Last.fm: collegamento WIP, usa il flusso completo (task #2633)", wip: true });
});

// ── /api/proposals/matches/accepted (GET) ────────────────────────────────
// Client: app/(tabs)/match.tsx — useQuery<any[]>. Consumer mappa array.
router.get("/proposals/matches/accepted", requireAuth, (_req: Request, res: Response) => {
  res.status(200).json([]);
});

// ── /api/proposals/rematch (POST) ────────────────────────────────────────
router.post("/proposals/rematch", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/proposals/:id/join (POST) ───────────────────────────────────────
// Client: app/proposals/[id].tsx — onError mostra Alert.
router.post("/proposals/:id/join", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/proposals/biker-matches/:id  (DELETE) ──────────────────────────
router.delete("/proposals/biker-matches/:id", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/proposals/matches/:id  (DELETE) ────────────────────────────────
router.delete("/proposals/matches/:id", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/rides/me/telemetry-stats (GET) ──────────────────────────────────
// Client: components/giri/list/TelemetryProgressBanner.tsx attende
// { km_collected: number, progress_pct: number, target_km: number }.
// La UI esegue stats.km_collected.toFixed(...) — DEVE essere number,
// non undefined. Stub restituisce contratto compatibile con dati zero
// (banner mostra "0% — 0 km raccolti, mancano 1000 km" — corretto come
// stato iniziale "nessuna telemetria ancora raccolta").
router.get("/rides/me/telemetry-stats", requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({
    km_collected: 0,
    progress_pct: 0,
    target_km: 1000,
    wip: true,
  });
});

// ── /api/events/:id  (DELETE) ───────────────────────────────────────────
// Client: app/evento/[id].tsx — onError mostra Alert.
router.delete("/events/:id", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/events/:id/{approve,reject} (POST) ─────────────────────────────
router.post("/events/:id/approve", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});
router.post("/events/:id/reject", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/events/:id/join (POST + DELETE) ────────────────────────────────
router.post("/events/:id/join", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});
router.delete("/events/:id/join", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/routes/:id/points (GET) ────────────────────────────────────────
// Client: hooks/tracking/useTrackingMap.ts — attende `{ points: [...] }`
// e fa `setHistPoints(data.points)`. POST esiste (upload waypoint), GET
// no. Stub restituisce array vuoto → UI mostra "nessun punto registrato".
router.get("/routes/:id/points", requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({ points: [], wip: true });
});

// ── /api/routes/:id (PATCH) ─────────────────────────────────────────────
// Client: components/tracking/useTrackingState.ts:423 (rename titolo
// viaggio), app/(tabs)/tracking.tsx:217. GET/DELETE esistono, PATCH no.
router.patch("/routes/:id", requireAuth, (_req: Request, res: Response) => {
  notImplemented(res);
});

// ── /api/planned-routes/poi/:id/photos (GET) ────────────────────────────
// Client: components/giri/detail/POIPhotoGallery.tsx — attende
// `{ photos: POIPhoto[] }`, mappa `data.photos ?? []`. POST upload esiste.
router.get("/planned-routes/poi/:id/photos", requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({ photos: [], wip: true });
});

// ── /api/planned-routes/weather/:id (GET) ───────────────────────────────
// Client: app/giri/[id].tsx:257 — attende `{ waypoints: [...] }`,
// poi se !resp.ok ha fallback POST /weather. Stub evita il primo 404
// in console mantenendo la stessa shape.
router.get("/planned-routes/weather/:id", requireAuth, (_req: Request, res: Response) => {
  res.status(200).json({ waypoints: [], wip: true });
});

export default router;
