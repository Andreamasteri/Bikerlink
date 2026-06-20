// waypoints-helpers.ts — helper puri estratti da waypoints.ts (gate 600/550 righe).
// Funzioni senza router e senza dipendenze dallo schema route, riusabili.
import { haversineKm } from "../../geo";

export function geminiErrorMessage(err: unknown): { httpStatus: number; message: string } {
  const e = err as { name?: string; message?: string; status?: number; statusCode?: number; code?: number };
  if (e.name === "AbortError") {
    return { httpStatus: 504, message: "Il servizio AI ha impiegato troppo tempo, riprova tra qualche secondo" };
  }
  const msg = (e?.message ?? "").toLowerCase();
  const status = e?.status ?? e?.statusCode ?? e?.code;
  const isRateLimit = status === 429 || msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") || msg.includes("resource_exhausted");
  if (isRateLimit) {
    return { httpStatus: 429, message: "Tutti i servizi AI sono temporaneamente saturi, riprova tra qualche minuto" };
  }
  const isTransient = status === 503 || msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded");
  if (isTransient) {
    return { httpStatus: 503, message: "Servizio AI temporaneamente non disponibile, riprova tra qualche secondo" };
  }
  return { httpStatus: 503, message: "Errore durante l'elaborazione della richiesta AI" };
}

// ─── Elevation profile extractor ──────────────────────────────────────────────

export function extractElevationProfile(
  encodedOrPoints: string | null,
  ghPointsWithElevation?: number[][]
): { profile: Array<{ distanceKm: number; altitudeM: number }>; gainM: number; minM: number; maxM: number } | null {
  if (!ghPointsWithElevation || ghPointsWithElevation.length < 2) return null;
  const pts = ghPointsWithElevation;
  let cumulativeDist = 0;
  let gainM = 0;
  let minM = Infinity;
  let maxM = -Infinity;
  const profile: Array<{ distanceKm: number; altitudeM: number }> = [];

  for (let i = 0; i < pts.length; i++) {
    const elev = pts[i][2] ?? 0;
    if (i > 0) {
      const prev = pts[i - 1];
      cumulativeDist += haversineKm(prev[1], prev[0], pts[i][1], pts[i][0]);
      const prevElev = prev[2] ?? 0;
      if (elev > prevElev) gainM += elev - prevElev;
    }
    if (elev < minM) minM = elev;
    if (elev > maxM) maxM = elev;
    if (pts.length <= 200 || i % Math.ceil(pts.length / 200) === 0) {
      profile.push({ distanceKm: Math.round(cumulativeDist * 100) / 100, altitudeM: Math.round(elev) });
    }
  }

  return {
    profile,
    gainM: Math.round(gainM),
    minM: minM === Infinity ? 0 : Math.round(minM),
    maxM: maxM === -Infinity ? 0 : Math.round(maxM),
  };
}
