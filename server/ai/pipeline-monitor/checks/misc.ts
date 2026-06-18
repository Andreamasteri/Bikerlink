import { db } from "../../../db";
import { sql, type SQL } from "drizzle-orm";
import http from "http";
import { getInternalProbeToken, getInternalProbeHeaderName } from "../../watchdog/internal-token";
import type { PipelineCheckResult, PipelineCheckStep } from "../types";

// Task #4436: ogni query diagnostica gira con statement_timeout=5s (SET LOCAL in
// transazione) così una probe lenta non tiene occupata una connessione del pool
// oltre soglia, mandando in cascata gli altri check.
const DIAGNOSTIC_STMT_TIMEOUT_MS = 5_000;
async function dbq(query: SQL): Promise<{ rows: Record<string, unknown>[] }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = ${sql.raw(String(DIAGNOSTIC_STMT_TIMEOUT_MS))}`);
    return tx.execute(query) as Promise<{ rows: Record<string, unknown>[] }>;
  });
}

function httpProbe(
  method: string,
  pathname: string,
): Promise<{ status: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const port = parseInt(process.env.PORT ?? "5000", 10);
    const start = Date.now();
    const headers: Record<string, string> = {
      [getInternalProbeHeaderName()]: getInternalProbeToken(),
    };
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers, timeout: 8_000 },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, durationMs: Date.now() - start }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("probe timeout 8s")); });
    req.end();
  });
}

async function runStep(name: string, fn: () => Promise<string | void>): Promise<PipelineCheckStep> {
  const start = Date.now();
  try {
    const msg = await fn();
    return { name, status: "ok", durationMs: Date.now() - start, message: msg ?? undefined };
  } catch (err) {
    return { name, status: "error", durationMs: Date.now() - start, message: (err as Error).message?.slice(0, 300) };
  }
}

async function warnStep(name: string, fn: () => Promise<string | void>): Promise<PipelineCheckStep> {
  const start = Date.now();
  try {
    const msg = await fn();
    return { name, status: "ok", durationMs: Date.now() - start, message: msg ?? undefined };
  } catch (err) {
    return { name, status: "warn", durationMs: Date.now() - start, message: (err as Error).message?.slice(0, 300) };
  }
}

// ---------- NOTIFICATIONS ----------
export async function checkNotifications(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await warnStep("notification_history recenti", async () => {
    const res = await dbq(sql`
      SELECT COUNT(*) AS cnt FROM notification_history WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt === 0) return "0 notifiche nelle ultime 24h (normale se non ci sono match recenti)";
    return `${cnt} notifiche nelle ultime 24h`;
  }));

  steps.push(await warnStep("notifiche fallite recenti", async () => {
    const res = await dbq(sql`
      SELECT COUNT(*) AS cnt FROM notification_history
      WHERE status = 'failed' AND created_at > NOW() - INTERVAL '1 hour'
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt > 5) throw new Error(`${cnt} notifiche fallite nell'ultima ora`);
    return cnt === 0 ? "nessun fallimento recente" : `${cnt} fallimenti (soglia: 5)`;
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "notifications",
    label: "Notifiche Push",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Verifica Expo push token e notification dispatcher." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- OTA ----------
export async function checkOta(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await runStep("GET /api/admin/ota/releases (sync <5s)", async () => {
    const r = await httpProbe("GET", "/api/admin/ota/releases");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.durationMs > 5_000) throw new Error(`risposta lenta ${r.durationMs}ms (soglia: 5000ms)`);
    return `${r.durationMs}ms`;
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "ota",
    label: "OTA Update",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Verifica /api/admin/ota/releases e la connessione a EAS." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- GPS ----------
export async function checkGps(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await warnStep("sessioni GPS aperte da >4h", async () => {
    let res;
    try {
      res = await dbq(sql`
        SELECT COUNT(*) AS cnt FROM user_sessions
        WHERE ended_at IS NULL AND started_at < NOW() - INTERVAL '4 hours'
      `);
    } catch (sqlErr) {
      throw new Error(`impossibile leggere user_sessions: ${(sqlErr as Error).message?.slice(0, 200)}`);
    }
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt > 0) throw new Error(`${cnt} sessioni GPS bloccate (aperte >4h senza chiusura)`);
    return "nessuna sessione aperta da troppo tempo";
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "gps",
    label: "GPS Tracking",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Esegui il session-crash-cleanup manualmente o controlla il job scheduleSessionCrashCleanup." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- EMBEDDING BIO ----------
export async function checkEmbeddingBio(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await warnStep("utenti con bio senza embedding", async () => {
    const res = await dbq(sql`
      SELECT COUNT(*) AS cnt FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE u.status = 'active'
        AND up.bio IS NOT NULL
        AND trim(up.bio) != ''
        AND NOT EXISTS (
          SELECT 1 FROM embeddings e
          WHERE e.entity_type = 'user'
            AND e.entity_id = up.user_id
            AND e.field = 'bio'
        )
      LIMIT 1
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt > 0) throw new Error(`${cnt} utenti con bio senza embedding`);
    return "tutti gli utenti hanno embedding bio aggiornato";
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "embedding_bio",
    label: "Embedding Bio",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Esegui backfillBioEmbeddings manualmente o controlla il job di backfill." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- EMBEDDING MUSIC ----------
export async function checkEmbeddingMusic(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await warnStep("utenti con dati musicali senza embedding music_taste", async () => {
    const res = await dbq(sql`
      SELECT COUNT(*) AS cnt
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.is_fake = false
        AND u.status = 'active'
        AND (
          COALESCE(p.music_taste_text, '') <> ''
          OR EXISTS (
            SELECT 1
            FROM entity_tags et
            INNER JOIN tags t ON t.id = et.tag_id
            INNER JOIN tag_categories tc ON tc.id = t.category_id
            WHERE et.entity_type = 'user'
              AND et.entity_id = u.id
              AND tc.slug = 'musica'
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM embeddings e
          WHERE e.entity_type = 'user'
            AND e.entity_id = u.id
            AND e.field = 'music_taste'
        )
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt > 10) throw new Error(`${cnt} utenti con dati musicali senza embedding music_taste`);
    if (cnt > 0) return `${cnt} utenti in attesa di embedding (sotto soglia)`;
    return "tutti gli utenti hanno embedding musicale";
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "embedding_music",
    label: "Embedding Musica",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Controlla runMusicEmbeddingsBackfill nel matching engine." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- CHAT ----------
export async function checkChat(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  // N.B.: la tabella "messages" non ha colonna "status" — il check usa
  // messaggi recenti (ultime 24h) come proxy di attività della chat.
  steps.push(await warnStep("messaggi recenti (ultime 24h)", async () => {
    const res = await dbq(sql`
      SELECT COUNT(*) AS cnt FROM messages
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt === 0) throw new Error("nessun messaggio nelle ultime 24h — chat potenzialmente inattiva");
    return `${cnt} messaggi nelle ultime 24h`;
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "chat",
    label: "Chat",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Verifica il dispatcher WebSocket e la tabella messages." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- ROAD HAZARDS ----------
export async function checkRoadHazards(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await runStep("GET /api/road-hazards (<2s)", async () => {
    const r = await httpProbe("GET", "/api/road-hazards?lat=45.464&lon=9.188&radius=50");
    if (r.status !== 200) throw new Error(`status ${r.status}`);
    if (r.durationMs > 2_000) throw new Error(`risposta lenta ${r.durationMs}ms (soglia: 2000ms)`);
    return `${r.durationMs}ms`;
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "road_hazards",
    label: "Road Hazards",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Verifica /api/road-hazards e la tabella road_hazards." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- AI ASSISTANT ----------
export async function checkAiAssistant(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  // N.B.: "ai_assistant_sessions" non esiste nel DB — usa ai_conversation_turns
  // (tabella reale, contiene turni conversazionali utente↔AI).
  steps.push(await warnStep("turni AI assistant recenti", async () => {
    const res = await dbq(sql`
      SELECT COUNT(*) AS cnt FROM ai_conversation_turns
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    return `${cnt} turni AI nelle ultime 24h`;
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "ai_assistant",
    label: "AI Assistant",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Verifica il provider AI e la tabella ai_assistant_sessions." : null,
    durationMs: Date.now() - t0,
  };
}

// ---------- SESSION CRASH CLEANUP ----------
export async function checkSessionCrash(): Promise<PipelineCheckResult> {
  const t0 = Date.now();
  const steps: PipelineCheckStep[] = [];

  steps.push(await warnStep("sessioni crash non chiuse", async () => {
    let res;
    try {
      res = await dbq(sql`
        SELECT COUNT(*) AS cnt FROM user_sessions
        WHERE ended_at IS NULL
          AND started_at < NOW() - INTERVAL '8 hours'
      `);
    } catch (sqlErr) {
      throw new Error(`impossibile leggere user_sessions: ${(sqlErr as Error).message?.slice(0, 200)}`);
    }
    const cnt = parseInt((res.rows[0] as { cnt: string }).cnt ?? "0", 10);
    if (cnt > 0) throw new Error(`${cnt} sessioni aperte da >8h (cleanup job non le ha chiuse)`);
    return "nessuna sessione crash irrisolta";
  }));

  const overall = steps.some(s => s.status === "error") ? "broken"
    : steps.some(s => s.status === "warn") ? "degraded" : "ok";

  return {
    pipeline: "session_crash",
    label: "Session Crash Cleanup",
    overall,
    steps,
    suggestedFix: overall !== "ok" ? "Verifica scheduleSessionCrashCleanup — il job non sta chiudendo le sessioni orfane." : null,
    durationMs: Date.now() - t0,
  };
}
