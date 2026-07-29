// Task #2536 — Check pack: embeddings (dimensione, freshness, mancanze).
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck } from "../types";

const EXPECTED_DIM = 1536;

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

const checks: IntegrityCheck[] = [
  {
    id: "embeddings/wrong-dimension",
    name: "Embeddings con dimensione vettore errata",
    category: "embeddings", severity: "high", cost: "medium",
    description: `Vettori embedding la cui lunghezza differisce da ${EXPECTED_DIM}.`,
    async query() {
      if (!(await tableExists("embeddings"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM embeddings WHERE vector_dims(embedding) <> ${EXPECTED_DIM}`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT id, entity_type, entity_id, field, model, vector_dims(embedding) AS dim FROM embeddings WHERE vector_dims(embedding) <> ${EXPECTED_DIM} LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })), details: { expected: EXPECTED_DIM } };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
  {
    id: "embeddings/stale-active-users",
    name: "Embeddings stale (>90gg) per utenti attivi",
    category: "embeddings", severity: "medium", cost: "medium",
    description: "Vettori non aggiornati da oltre 90 giorni per utenti attivi.",
    async query() {
      if (!(await tableExists("embeddings")) || !(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM embeddings e JOIN users u ON u.id = e.entity_id WHERE e.entity_type = 'user' AND u.status = 'active' AND e.updated_at < NOW() - INTERVAL '90 days'`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT e.id, e.entity_id, e.updated_at FROM embeddings e JOIN users u ON u.id = e.entity_id WHERE e.entity_type = 'user' AND u.status = 'active' AND e.updated_at < NOW() - INTERVAL '90 days' LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
  {
    id: "embeddings/missing-for-active-users",
    name: "Utenti attivi con bio senza embedding corrente",
    category: "embeddings", severity: "medium", cost: "expensive",
    expensive: true,
    description: "Utenti attivi con bio non vuota che non hanno un embedding bio aggiornato.",
    async query() {
      if (!(await tableExists("embeddings")) || !(await tableExists("users")) || !(await tableExists("user_profiles"))) return { ok: true, count: 0, sample: [] };
      try {
        const cnt = await db.execute(sql`
          SELECT COUNT(*)::int AS c
          FROM users u
          JOIN user_profiles up ON up.user_id = u.id
          WHERE u.status = 'active'
            AND u.is_fake = false
            AND up.bio IS NOT NULL
            AND trim(up.bio) != ''
            AND NOT EXISTS (
              SELECT 1
              FROM embeddings e
              WHERE e.entity_type = 'user'
                AND e.entity_id = u.id
                AND e.field = 'bio'
                AND e.source_hash = encode(sha256(trim(up.bio)::bytea), 'hex')
            )
        `);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`
          SELECT u.id, u.nickname
          FROM users u
          JOIN user_profiles up ON up.user_id = u.id
          WHERE u.status = 'active'
            AND u.is_fake = false
            AND up.bio IS NOT NULL
            AND trim(up.bio) != ''
            AND NOT EXISTS (
              SELECT 1
              FROM embeddings e
              WHERE e.entity_type = 'user'
                AND e.entity_id = u.id
                AND e.field = 'bio'
                AND e.source_hash = encode(sha256(trim(up.bio)::bytea), 'hex')
            )
          LIMIT 10
        `);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
  {
    id: "embeddings/model-mismatch",
    name: "Embeddings con modello dichiarato sconosciuto",
    category: "embeddings", severity: "medium", cost: "cheap",
    description: "Vettori con campo 'model' non in lista bianca.",
    async query() {
      if (!(await tableExists("embeddings"))) return { ok: true, count: 0, sample: [] };
      try {
        const KNOWN_MODELS = [
          'text-embedding-3-small',
          'text-embedding-3-large',
          'text-embedding-ada-002',
          'local:Xenova/multilingual-e5-small',
        ];
        const inSql = sql.join(KNOWN_MODELS.map((m) => sql`${m}`), sql`, `);
        const cnt = await db.execute(sql`SELECT COUNT(*)::int AS c FROM embeddings WHERE model IS NULL OR model NOT IN (${inSql})`);
        const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
        if (!count) return { ok: true, count: 0, sample: [] };
        const smp = await db.execute(sql`SELECT id, entity_type, entity_id, model FROM embeddings WHERE model IS NULL OR model NOT IN (${inSql}) LIMIT 10`);
        const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
        return { ok: false, count, sample: rows.map((r) => ({ pk: String(r.id), data: r })) };
      } catch (err) {
        return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
      }
    },
  },
];
export default checks;
