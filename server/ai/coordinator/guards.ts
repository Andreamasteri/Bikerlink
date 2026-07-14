// Task #9 (Quebracho b) — 3 guard job di rilevamento, gated via withJobGate
// come gli altri loop, ma di natura diversa: non fanno mai una fix, SOLO
// diagnosi periodica + alert su ai_watchdog_log se una condizione nota di
// regressione si manifesta. Nessuno di questi tocca dati applicativi.
import { db, withDbRetry } from "../../db";
import { sql, eq } from "drizzle-orm";
import { storage } from "../../storage";
import { onlineTracker } from "../../online-tracker";
import { translationKeys } from "@shared/db";
import { escalateFinding } from "./escalation";
import { dedupWarn } from "../../lib/dedup-logger";
import { withJobGate } from "./gated-job";

const ALL_LANGS = ["it", "en", "de", "es", "fr", "el", "tr"] as const;

// ─── Guard 1 — spatial_ref_sys anti-regression ──────────────────────────────
//
// server/migrate.ts (isPostgisOwnerError) tratta come "safe no-op" un 42501
// su spatial_ref_sys SOLO perché quella tabella è di proprietà del ruolo
// `postgres` (superuser PostGIS) e la sua PK esiste già. Se in futuro
// l'ownership o la PK cambiassero (es. reset del DB gestito, migrazione a un
// provider diverso), il presupposto silenzioso in isPostgisOwnerError
// smetterebbe di essere valido e il prossimo publish fallirebbe di nuovo con
// l'errore noto (vedi memoria spatial-ref-sys-deploy.md) — ma senza alcun
// segnale PRIMA del publish. Questo guard rileva la deriva in anticipo.
async function checkSpatialRefSysGuard(): Promise<void> {
  const rows = await withDbRetry(() =>
    db.execute<{ tableowner: string | null; has_pk: boolean }>(sql`
      SELECT
        (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'spatial_ref_sys') AS tableowner,
        EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'spatial_ref_sys' AND c.contype = 'p'
        ) AS has_pk
    `),
  );
  const row = rows.rows[0] as { tableowner: string | null; has_pk: boolean } | undefined;
  if (!row || row.tableowner == null) {
    // Tabella assente: PostGIS non installato in questo DB — non è la
    // regressione che monitoriamo (nessun publish la toccherebbe), skip silenzioso.
    return;
  }
  if (row.tableowner !== "postgres" || !row.has_pk) {
    await escalateFinding({
      scope: "spatial_ref_sys_guard",
      summary: `Deriva rilevata su spatial_ref_sys: owner="${row.tableowner}" (atteso "postgres"), PK presente=${row.has_pk}. Il fallback in isPostgisOwnerError (server/migrate.ts) potrebbe non essere più valido — verificare prima del prossimo publish.`,
      details: { tableowner: row.tableowner, hasPrimaryKey: row.has_pk },
    });
  }
}

// ─── Guard 2 — three-online-counter congruence ──────────────────────────────
//
// "Online" è misurato in due modi indipendenti che possono divergere per
// design (l'in-memory è volatile e si azzera a ogni restart, il DB persiste
// lastLoginAt): questo guard non li fa mai combaciare esattamente, ma segnala
// quando la deriva supera una soglia ragionevole — segnale di heartbeat rotti
// o di un restart recente da monitorare, non un bug da correggere qui.
const ONLINE_DRIFT_MIN_ABS = 10; // sotto questa soglia il rumore statistico domina, non alertare
const ONLINE_DRIFT_RATIO = 0.35; // 35% di scarto relativo al maggiore dei due

async function checkOnlineCounterCongruence(): Promise<void> {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const [dbCount, memoryCount] = await Promise.all([
    withDbRetry(() => storage.countOnlineUsers(since)),
    Promise.resolve(onlineTracker.countOnlineUsers()),
  ]);
  const larger = Math.max(dbCount, memoryCount);
  if (larger < ONLINE_DRIFT_MIN_ABS) return;
  const drift = Math.abs(dbCount - memoryCount) / larger;
  if (drift > ONLINE_DRIFT_RATIO) {
    await escalateFinding({
      scope: "online_counter_congruence_guard",
      summary: `Contatori online disallineati oltre soglia: DB(lastLoginAt 30min)=${dbCount}, in-memory(OnlineTracker)=${memoryCount} (drift=${(drift * 100).toFixed(0)}%). Possibile restart recente o heartbeat rotti — verificare prima di fidarsi del counter home.`,
      details: { dbCount, memoryCount, driftRatio: drift },
    });
  }
}

// ─── Guard 3 — welcome/onboarding message consistency ───────────────────────
//
// I messaggi di onboarding sono catalogati in translation_keys (position=
// "onboarding") con una colonna per lingua supportata. Un aggiornamento fatto
// per una sola lingua (es. via editor admin) lascia silenziosamente le altre
// lingue vuote o (dopo un rename di key) orfane — l'utente in quella lingua
// vede testo mancante/stale, senza alcun errore visibile lato server.
async function checkOnboardingMessageConsistency(): Promise<void> {
  const rows = await withDbRetry(() =>
    db.select().from(translationKeys).where(eq(translationKeys.position, "onboarding")),
  );
  const incomplete: Array<{ key: string; missing: string[] }> = [];
  for (const row of rows) {
    const missing = ALL_LANGS.filter((lang) => !row[lang] || row[lang]!.trim().length === 0);
    if (missing.length > 0) incomplete.push({ key: row.key, missing });
  }
  if (incomplete.length > 0) {
    await escalateFinding({
      scope: "onboarding_message_consistency_guard",
      summary: `${incomplete.length} chiave/i di onboarding con traduzioni mancanti in una o più lingue: ${incomplete.map((i) => `${i.key} [${i.missing.join(",")}]`).join("; ")}`,
      details: { incomplete },
    });
  }
}

const gatedSpatialRefSysGuard = withJobGate("guard-spatial-ref-sys", async () => {
  try {
    await checkSpatialRefSysGuard();
  } catch (err) {
    dedupWarn("guard/spatial-ref-sys", "errore guard spatial_ref_sys (non-fatal)", err);
  }
}, { critical: false });

const gatedOnlineCongruenceGuard = withJobGate("guard-online-counter-congruence", async () => {
  try {
    await checkOnlineCounterCongruence();
  } catch (err) {
    dedupWarn("guard/online-congruence", "errore guard congruenza contatori online (non-fatal)", err);
  }
}, { critical: false });

const gatedOnboardingConsistencyGuard = withJobGate("guard-onboarding-message-consistency", async () => {
  try {
    await checkOnboardingMessageConsistency();
  } catch (err) {
    dedupWarn("guard/onboarding-consistency", "errore guard consistenza onboarding (non-fatal)", err);
  }
}, { critical: false });

const _guardTimers: ReturnType<typeof setInterval>[] = [];

/**
 * Avvia i 3 guard job. Chiamata una sola volta al boot (Phase 5), come gli
 * altri scheduler — vedi server/boot-phase5-schedulers.ts.
 */
export function startQuebrachoGuards(): void {
  setTimeout(() => { void gatedSpatialRefSysGuard(); }, 4 * 60_000);
  _guardTimers.push(setInterval(() => { void gatedSpatialRefSysGuard(); }, 24 * 60 * 60 * 1000));

  setTimeout(() => { void gatedOnlineCongruenceGuard(); }, 6 * 60_000);
  _guardTimers.push(setInterval(() => { void gatedOnlineCongruenceGuard(); }, 60 * 60 * 1000));

  setTimeout(() => { void gatedOnboardingConsistencyGuard(); }, 8 * 60_000);
  _guardTimers.push(setInterval(() => { void gatedOnboardingConsistencyGuard(); }, 24 * 60 * 60 * 1000));

  console.log("[INIT] Quebracho guard jobs avviati (spatial_ref_sys, online-counter congruence, onboarding consistency)");
}

/** Solo per test. */
export function __stopQuebrachoGuardsForTests(): void {
  for (const t of _guardTimers) clearInterval(t);
  _guardTimers.length = 0;
}

export const __testables = {
  checkSpatialRefSysGuard,
  checkOnlineCounterCongruence,
  checkOnboardingMessageConsistency,
};
