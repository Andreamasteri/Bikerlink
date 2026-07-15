// Task #5069 — Estratto da ota.ts per rispettare il gate 600 righe.
// Contiene: EAS GraphQL helper, syncProductionUpdates (paginata), cache TTL,
// triggerSyncInBackground, forceSyncNow.
import { db, withDbRetry } from "../../db";
import { otaReleases } from "@shared/db";
import { eq, isNull, and, sql } from "drizzle-orm";

export const EAS_PROJECT_ID = "a25192d7-72e5-46af-97d0-2d38ed9b78e3";
const EAS_GRAPHQL_URL = "https://api.expo.dev/graphql";

export async function easGraphQL(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const token = process.env.EAS_TOKEN ?? process.env.EXPO_TOKEN;
  if (!token) throw new Error("EAS_TOKEN / EXPO_TOKEN non configurato");
  const res = await fetch(EAS_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
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
export async function syncProductionUpdates(): Promise<{ inserted: number; backfilled: number }> {
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
    let data: EasData;
    try {
      data = await easGraphQL(pageQuery, { appId: EAS_PROJECT_ID, offset, limit: PAGE_LIMIT }) as EasData;
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

  let inserted = 0;
  for (const upd of updates) {
    const existing = await withDbRetry(() => db.select({ id: otaReleases.id })
      .from(otaReleases)
      .where(eq(otaReleases.easUpdateId, upd.id))
      .limit(1));

    if (existing.length > 0) continue;

    await withDbRetry(() => db.insert(otaReleases).values({
      easUpdateId: upd.id,
      easGroupId: upd.group ?? null,
      channel: "production",
      runtimeVersion: upd.runtimeVersion ?? null,
      message: upd.message ?? null,
      status: "pending",
      publishedAt: upd.createdAt ? new Date(upd.createdAt) : new Date(),
    }).onConflictDoNothing());
    inserted++;
  }

  for (const upd of updates) {
    if (!upd.group) continue;
    await withDbRetry(() => db.update(otaReleases)
      .set({ easGroupId: upd.group })
      .where(and(eq(otaReleases.easUpdateId, upd.id), isNull(otaReleases.easGroupId))));
  }

  await withDbRetry(() => db.execute(sql`
    UPDATE ota_releases r
    SET ota_version = src.ota_version
    FROM ota_releases src
    WHERE r.ota_version IS NULL
      AND r.eas_group_id IS NOT NULL
      AND src.eas_group_id = r.eas_group_id
      AND src.ota_version IS NOT NULL
  `));

  const noVersionRecords = await withDbRetry(() => db
    .select({ id: otaReleases.id, message: otaReleases.message, easGroupId: otaReleases.easGroupId })
    .from(otaReleases)
    .where(isNull(otaReleases.otaVersion)));

  let backfilled = 0;
  for (const rec of noVersionRecords) {
    const match = rec.message?.match(/^\[OTA:([\d.]+)\]/);
    if (!match) continue;
    const parsed = match[1];
    const groupId = rec.easGroupId;
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
  }

  return { inserted, backfilled };
}

// Cache TTL in-memory di 60s sul sync EAS, con dedup delle richieste in volo.
const SYNC_TTL_MS = 60_000;
let _lastSyncAt = 0;
let _syncInFlight: Promise<{ inserted: number; backfilled: number }> | null = null;

// Innesca il sync EAS in background senza bloccare il chiamante.
export function triggerSyncInBackground(): void {
  if (Date.now() - _lastSyncAt < SYNC_TTL_MS) return;
  if (_syncInFlight) return;
  _syncInFlight = syncProductionUpdates()
    .then(() => { _lastSyncAt = Date.now(); return { inserted: 0, backfilled: 0 }; })
    .catch((err) => { console.warn("[ota] background sync warning:", err); return { inserted: 0, backfilled: 0 }; })
    .finally(() => { _syncInFlight = null; });
}

// Forza un sync immediato resettando la cache TTL (usato dal POST /sync manuale).
export async function forceSyncNow(): Promise<{ inserted: number; backfilled: number }> {
  _lastSyncAt = 0;
  _syncInFlight = null;
  const result = await syncProductionUpdates();
  _lastSyncAt = Date.now();
  return result;
}
