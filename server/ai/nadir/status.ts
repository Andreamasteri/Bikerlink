/**
 * Nadir — stato aggregato per il pannello admin (Task #75, step 5).
 *
 * Espone in un colpo solo: ultimo esito reindicizzazione, salute ricerca (con
 * streak notti fallite), conteggio frammenti per origine attualmente indicizzati,
 * modello di embedding attivo (per identità) e metadati del manuale.
 */
import { sql } from "drizzle-orm";
import { db, withDbRetry } from "../../db";
import { EMBEDDING_MODEL_TAG } from "../../embeddings";
import {
  NADIR_COMMENT_ENTITY_TYPE,
  NADIR_CONVERSATION_ENTITY_TYPE,
  NADIR_FIELD,
  NADIR_MANUAL_ENTITY_TYPE,
  entityTypeToOrigin,
} from "./constants";
import { getNadirManual } from "./manual";
import {
  getNadirSearchHealth,
  type NadirIndexStatus,
  type NadirSearchHealth,
} from "./reindex";
import { storage } from "../../storage";
import { NADIR_INDEX_STATUS_KEY } from "./constants";

export interface NadirStatus {
  /** Modello di embedding di default configurato (identità del sottosistema). */
  defaultModel: string;
  /** Modello effettivamente usato nell'ultima reindicizzazione (può differire in fallback). */
  lastRunModel: string | null;
  indexStatus: NadirIndexStatus | null;
  searchHealth: NadirSearchHealth | null;
  /** Frammenti attualmente indicizzati per origine (conteggio reale dallo store). */
  indexedCounts: { manual: number; conversation: number; comment: number };
  manual: { length: number; empty: boolean };
}

async function getIndexedCounts(): Promise<NadirStatus["indexedCounts"]> {
  const counts = { manual: 0, conversation: 0, comment: 0 };
  try {
    const res = await withDbRetry(() =>
      db.execute<{ entity_type: string; cnt: string }>(sql`
        SELECT entity_type, COUNT(*) AS cnt
        FROM embeddings
        WHERE field = ${NADIR_FIELD}
          AND entity_type IN (
            ${NADIR_MANUAL_ENTITY_TYPE},
            ${NADIR_CONVERSATION_ENTITY_TYPE},
            ${NADIR_COMMENT_ENTITY_TYPE}
          )
        GROUP BY entity_type
      `),
    );
    for (const row of (res.rows ?? []) as { entity_type: string; cnt: string }[]) {
      const origin = entityTypeToOrigin(row.entity_type);
      if (origin) counts[origin] = parseInt(row.cnt, 10) || 0;
    }
  } catch {
    /* best-effort: conteggi a 0 se lo store non risponde */
  }
  return counts;
}

async function getIndexStatus(): Promise<NadirIndexStatus | null> {
  const row = await storage.getAppSetting(NADIR_INDEX_STATUS_KEY);
  const raw = row?.valueJson;
  if (raw && typeof raw === "object") return raw as NadirIndexStatus;
  return null;
}

export async function getNadirStatus(): Promise<NadirStatus> {
  const [manual, indexStatus, searchHealth, indexedCounts] = await Promise.all([
    getNadirManual(),
    getIndexStatus(),
    getNadirSearchHealth(),
    getIndexedCounts(),
  ]);
  return {
    defaultModel: EMBEDDING_MODEL_TAG,
    lastRunModel: indexStatus?.model ?? null,
    indexStatus,
    searchHealth,
    indexedCounts,
    manual: { length: manual.length, empty: manual.trim().length === 0 },
  };
}
