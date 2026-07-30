// Fase 5 (Task #545) — Actuator: unica responsabilità del pg_terminate_backend.
//
// Estratto da pool-collector.ts per separare l'OSSERVAZIONE (rilevamento idle)
// dall'AZIONE (terminazione forzata). pool-collector rimane un collector puro
// che produce Signal[]; questa unità si occupa dell'effetto collaterale.
//
// Invariante: viene chiamato SOLO quando pool-collector ha già verificato che
// anomalous.length >= IDLE_LEAK_THRESHOLD e ha una connessione out-of-band
// (client) già aperta e disponibile.
//
// Il fallback di sicurezza (kill disabilitato di default) vive qui insieme alla
// cache TTL dell'AppSetting, così l'endpoint admin PUT può invalidarla via
// invalidateIdleKillCache() senza conoscere i dettagli di pool-collector.
import pg from "pg";

// AppSetting di sicurezza che abilita pg_terminate_backend. Default OFF.
const IDLE_KILL_SETTING_KEY = "db_idle_conn_kill_enabled";

// Età minima (secondi) per TERMINARE un backend — kill solo le connessioni
// davvero bloccate da ≥60s, non quelle appena diventate idle.
export const ACTUATOR_IDLE_KILL_MIN_AGE_S = 60;

// ── TTL cache per l'AppSetting ────────────────────────────────────────────────
// Evita query ripetute su app_settings durante pressione DB. La cache si
// aggiorna usando la connessione out-of-band già aperta — NON il pool principale
// che potrebbe essere saturo sotto pressione. TTL 3 minuti.
const IDLE_KILL_CACHE_TTL_MS = 3 * 60_000;
let idleKillCached: boolean | null = null;
let idleKillCachedAt = 0;

/**
 * Invalida immediatamente la cache del kill-switch. Da chiamare dall'endpoint
 * admin PUT ogni volta che `db_idle_conn_kill_enabled` viene scritto, così il
 * prossimo probe rilegge il valore corrente dall'AppSetting anziché usare il
 * valore TTL-cached (fino a 3 minuti stantio).
 */
export function invalidateIdleKillCache(): void {
  idleKillCached = null;
  idleKillCachedAt = 0;
}

export interface AnomalousConnection {
  pid: number;
  idle_s: number | null;
}

export interface KillResult {
  /** Number of backends successfully terminated. */
  killed: number;
  /**
   * Number of backends where pg_terminate_backend threw. These are NOT counted
   * in `killed` and are surfaced in the watchdog signal so admins are notified
   * of partial-kill failures instead of silently losing the kill count.
   */
  failedKills: number;
}

/**
 * Legge il kill-switch dall'AppSetting (con TTL cache) e, se abilitato,
 * termina via pg_terminate_backend le connessioni più vecchie della soglia
 * di sicurezza ACTUATOR_IDLE_KILL_MIN_AGE_S.
 *
 * Usa la connessione out-of-band `client` (non il pool principale, che è sotto
 * pressione nel contesto in cui viene chiamato).
 *
 * @returns KillResult con i contatori `killed` e `failedKills` (entrambi 0 se
 *   il kill-switch è disabilitato). `failedKills > 0` indica un fallimento
 *   parziale che deve essere surfaceto nel segnale watchdog.
 */
export async function runIdleLeakKill(
  client: Pick<pg.Client, "query">,
  anomalous: AnomalousConnection[],
): Promise<KillResult> {
  let killEnabled = false;
  try {
    // TTL cache: evita query ripetute su app_settings durante pressione DB.
    // Legge via la connessione out-of-band già aperta — NON il pool principale.
    const now = Date.now();
    if (idleKillCached === null || now - idleKillCachedAt >= IDLE_KILL_CACHE_TTL_MS) {
      const settingRes = await client.query<{ value: string | null; value_json: unknown }>(
        `SELECT value, value_json FROM app_settings WHERE key = $1 LIMIT 1`,
        [IDLE_KILL_SETTING_KEY],
      );
      const row = settingRes.rows[0];
      idleKillCached =
        row?.value === "true" ||
        row?.value_json === true ||
        (typeof row?.value_json === "string" && row.value_json === "true");
      idleKillCachedAt = Date.now();
    }
    killEnabled = idleKillCached ?? false;
  } catch {
    /* AppSetting illeggibile → kill disabilitato (fail-safe). */
  }

  if (!killEnabled) return { killed: 0, failedKills: 0 };

  const killable = anomalous.filter((r) => (r.idle_s ?? 0) >= ACTUATOR_IDLE_KILL_MIN_AGE_S);
  let killed = 0;
  let failedKills = 0;
  for (const r of killable) {
    try {
      await client.query(`SELECT pg_terminate_backend($1)`, [r.pid]);
      killed++;
      console.error(`[watchdog/actuator] 🔪 pg_terminate_backend(${r.pid}) (idle ${r.idle_s}s)`);
    } catch (err) {
      failedKills++;
      console.warn(
        `[watchdog/actuator] terminate pid=${r.pid} fallito (failedKills=${failedKills}):`,
        (err as Error).message?.slice(0, 120),
      );
    }
  }
  return { killed, failedKills };
}
