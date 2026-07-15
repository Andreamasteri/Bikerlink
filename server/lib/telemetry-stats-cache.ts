/**
 * Task #53 — piccola cache in-process per GET /api/telemetry/stats.
 *
 * L'endpoint esegue una scansione con window function su `ride_telemetry`;
 * sotto pressione del pool DB (Task #52) le richieste ravvicinate (il client
 * fa refetch ogni 30s durante l'auto-riding, oltre a invalidazioni manuali)
 * rischiano di sommarsi e far scadere la request, lasciando `telemetryStats`
 * null e nascondendo l'intero pannello Telemetria sul profilo.
 *
 * TTL allineato al `staleTime` del client (60s): entro quella finestra il
 * client non richiederebbe comunque un dato più fresco, quindi servire una
 * risposta cache-ata è equivalente per l'utente ma evita di rieseguire la
 * query pesante ad ogni polling.
 */

type CachedStats = {
  data: unknown;
  expiresAt: number;
};

const TTL_MS = 60_000;
const cache = new Map<string, CachedStats>();

export function getCachedTelemetryStats(userId: string): unknown | undefined {
  const entry = cache.get(userId);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(userId);
    return undefined;
  }
  return entry.data;
}

export function setCachedTelemetryStats(userId: string, data: unknown): void {
  cache.set(userId, { data, expiresAt: Date.now() + TTL_MS });
}

export function invalidateTelemetryStatsCache(userId: string): void {
  cache.delete(userId);
}
