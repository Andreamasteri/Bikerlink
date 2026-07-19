// Task #5069 — Estratto da ota.ts per rispettare il gate 600 righe.
// Contiene: EAS GraphQL helper, syncProductionUpdates (paginata), cache TTL,
// triggerSyncInBackground, forceSyncNow.
import { db, withDbRetry } from "../../db";
import { otaReleases } from "@shared/db";
import { eq, isNull, and, sql, inArray } from "drizzle-orm";
import { writeWatchdogLog } from "../../ai/watchdog/log";

export const EAS_PROJECT_ID = "a25192d7-72e5-46af-97d0-2d38ed9b78e3";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

export async function easGraphQL(query: string, variables?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const token = process.env.EAS_TOKEN ?? process.env.EXPO_TOKEN;
  if (!token) throw new Error("EAS_TOKEN / EXPO_TOKEN non configurato");
  const res = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) {
    let body = "";
    try { body = await res.text(); } catch { /* ignore */ }
    throw new Error(`EAS GraphQL HTTP ${res.status}: ${body}`);
  }
  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors && (json.errors as unknown[]).length > 0) {
    throw new Error(`EAS GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Sincronizza il branch EAS `production` nel DB locale per tracking admin.
// Task #2503: i nuovi update sincronizzati da EAS finiscono come `pending`.
// Usa paginazione (limit 100 per pagina) per recuperare tutti gli update.
export async function syncProductionUpdates(signal?: AbortSignal): Promise<{ inserted: number; backfilled: number }> {
  const PAGE_LIMIT = 100;

  type EasUpdate = { id: string; group?: string; message?: string; runtimeVersion?: string; createdAt?: string };
  type EasData = { app?: { byId?: { updateBranches?: Array<{ id: string; name: string; updates?: EasUpdate[] }> } } };

  const pageQuery = `
    query GetBranchUpdates($appId: String!, $offset: Int!, $limit: Int!) {
      app {
        byId(appId: $appId) {
          updateBranches(offset: 0, limit: 10) {
            id
            name
            updates(offset: $offset, limit: $limit) {
              id
              group
              message
              runtimeVersion
              createdAt
            }
          }
        }
      }
    }
  `;

  const updates: EasUpdate[] = [];
  let offset = 0;
  while (true) {
    signal?.throwIfAborted();
    let data: EasData;
    try {
      data = await easGraphQL(pageQuery, { appId: EAS_PROJECT_ID, offset, limit: PAGE_LIMIT }, signal) as EasData;
    } catch (err) {
      console.warn("[ota-sync] EAS GraphQL error:", err);
      throw err;
    }

    const branches = data?.app?.byId?.updateBranches ?? [];
    const productionBranch = branches.find((b) => b.name === "production");
    const page = productionBranch?.updates ?? [];
    updates.push(...page);

    if (page.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
  }

  console.log(`[ota-sync] recuperati ${updates.length} update dal branch production`);
  if (updates.length === 0) return { inserted: 0, backfilled: 0 };

  // Task #802 — Bulk SELECT: una sola query per trovare tutti gli ID già presenti,
  // invece del loop N+1 originale (1 SELECT per update × 200+ update = timeout proxy).
  const allEasIds = updates.map((u) => u.id);
  let existingSet: Set<string>;
  try {
    const existingRows = await withDbRetry(() =>
      db.select({ easUpdateId: otaReleases.easUpdateId })
        .from(otaReleases)
        .where(inArray(otaReleases.easUpdateId, allEasIds))
    );
    existingSet = new Set(existingRows.map((r) => r.easUpdateId));
  } catch (err) {
    console.warn("[ota-sync] DB error fetching existing IDs, aborting sync:", err);
    throw err;
  }

  const missing = updates.filter((u) => !existingSet.has(u.id));
  console.log(`[ota-sync] ${missing.length} nuovi update da inserire (${existingSet.size} già presenti)`);

  // Task #394 — IDs di EAS update non presenti localmente al momento del check.
  const gapIds: string[] = missing.map((u) => u.id);
  const errorIds: string[] = [];

  // Task #802 — Bulk INSERT: un singolo insert per tutti i record mancanti.
  let inserted = 0;
  if (missing.length > 0) {
    try {
      const insertedRows = await withDbRetry(() =>
        db.insert(otaReleases).values(
          missing.map((u) => ({
            easUpdateId: u.id,
            easGroupId: u.group ?? null,
            channel: "production",
            runtimeVersion: u.runtimeVersion ?? null,
            message: u.message ?? null,
            status: "pending",
            publishedAt: u.createdAt ? new Date(u.createdAt) : new Date(),
          }))
        ).onConflictDoNothing().returning({ id: otaReleases.id })
      );
      inserted = insertedRows.length;
    } catch (err) {
      console.warn("[ota-sync] DB error during bulk insert, skipping:", err);
      errorIds.push(...gapIds);
    }
  }

  // Task #394 — Emetti segnale watchdog se ci sono update EAS non riconciliati
  // con il DB locale. Severity "warn" (non critico): il sync ritenterà al prossimo
  // ciclo. Non blocca il completamento del job.
  if (gapIds.length > 0) {
    const unreconciled = errorIds.filter((id) => gapIds.includes(id));
    void writeWatchdogLog({
      kind: "signal",
      scope: "horus.ota.sync_gap",
      status: "warn",
      summary: `OTA sync: trovati ${gapIds.length} update EAS non presenti localmente (${inserted} inseriti, ${unreconciled.length} non riconciliati per errore DB)`,
      details: {
        gapIds,
        insertedCount: inserted,
        unreconciledIds: unreconciled,
        errorIds,
      },
    }).catch((e) => console.warn("[ota-sync] writeWatchdogLog error (non-fatal):", e));
  }

  // Task #802 — Backfill easGroupId solo per i record già esistenti (i nuovi
  // hanno già il gruppo impostato nel bulk insert). Questo loop tocca solo i
  // record legacy privi di easGroupId, in pratica quasi zero in produzione.
  for (const upd of updates) {
    if (!upd.group) continue;
    if (!existingSet.has(upd.id)) continue; // già inserito con il gruppo corretto
    try {
      await withDbRetry(() => db.update(otaReleases)
        .set({ easGroupId: upd.group })
        .where(and(eq(otaReleases.easUpdateId, upd.id), isNull(otaReleases.easGroupId))));
    } catch (err) {
      console.warn(`[ota-sync] DB error backfilling group for EAS update ${upd.id}:`, err);
    }
  }

  try {
    await withDbRetry(() => db.execute(sql`
      UPDATE ota_releases r
      SET ota_version = src.ota_version
      FROM ota_releases src
      WHERE r.ota_version IS NULL
        AND r.eas_group_id IS NOT NULL
        AND src.eas_group_id = r.eas_group_id
        AND src.ota_version IS NOT NULL
    `));
  } catch (err) {
    console.warn("[ota-sync] DB error propagating ota_version by group:", err);
  }

  let noVersionRecords: { id: string; message: string | null; easGroupId: string | null }[];
  try {
    noVersionRecords = await withDbRetry(() => db
      .select({ id: otaReleases.id, message: otaReleases.message, easGroupId: otaReleases.easGroupId })
      .from(otaReleases)
      .where(isNull(otaReleases.otaVersion)));
  } catch (err) {
    console.warn("[ota-sync] DB error fetching no-version records, skipping backfill:", err);
    return { inserted, backfilled: 0 };
  }

  let backfilled = 0;
  for (const rec of noVersionRecords) {
    const match = rec.message?.match(/^\[OTA:([\d.]+)\]/);
    if (!match) continue;
    const parsed = match[1];
    const groupId = rec.easGroupId;
    try {
      if (groupId) {
        await withDbRetry(() => db.update(otaReleases)
          .set({ otaVersion: parsed })
          .where(eq(otaReleases.easGroupId, groupId)));
      } else {
        await withDbRetry(() => db.update(otaReleases)
          .set({ otaVersion: parsed })
          .where(eq(otaReleases.id, rec.id)));
      }
      backfilled++;
    } catch (err) {
      console.warn(`[ota-sync] DB error backfilling ota_version for record ${rec.id}:`, err);
    }
  }

  return { inserted, backfilled };
}

// Cache TTL in-memory di 60s sul sync EAS, con dedup delle richieste in volo.
const SYNC_TTL_MS = 60_000;
let _lastSyncAt = 0;
let _syncInFlight: Promise<{ inserted: number; backfilled: number }> | null = null;

const BACKGROUND_SYNC_TIMEOUT_MS = 60_000;

// Innesca il sync EAS in background senza bloccare il chiamante.
export function triggerSyncInBackground(): void {
  if (Date.now() - _lastSyncAt < SYNC_TTL_MS) return;
  if (_syncInFlight) return;

  // AbortController propagates cancellation into fetch calls and the pagination
  // loop inside syncProductionUpdates, so the underlying work actually stops
  // rather than just the caller-side promise being abandoned.
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    console.warn(`[ota] background sync timed out after ${BACKGROUND_SYNC_TIMEOUT_MS / 1000}s — aborting`);
    controller.abort(new Error(`background OTA sync timed out after ${BACKGROUND_SYNC_TIMEOUT_MS / 1000}s`));
  }, BACKGROUND_SYNC_TIMEOUT_MS);

  // _syncInFlight points at the real underlying promise; deduplication stays
  // correct for the full duration of the actual work (not just until the timer fires).
  _syncInFlight = syncProductionUpdates(controller.signal)
    .then((result) => { _lastSyncAt = Date.now(); return result; })
    .catch((err) => {
      // On abort/timeout or other errors: do NOT update _lastSyncAt so the next
      // scheduled tick can retry.
      console.warn("[ota] background sync warning:", err);
      return { inserted: 0, backfilled: 0 };
    })
    .finally(() => {
      clearTimeout(timeoutHandle);
      _syncInFlight = null;
    });
}

// Forza un sync immediato resettando la cache TTL (usato dal POST /sync manuale).
export async function forceSyncNow(): Promise<{ inserted: number; backfilled: number }> {
  _lastSyncAt = 0;
  _syncInFlight = null;
  const result = await syncProductionUpdates();
  _lastSyncAt = Date.now();
  return result;
}
