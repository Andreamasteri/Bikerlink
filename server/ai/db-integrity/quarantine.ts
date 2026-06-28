// Task #2536 — Quarantena: prima di ogni delete automatico, copia la riga in
// dbIntegrityQuarantine (TTL 30 giorni). Permette restore o purge anticipato.
import { db } from "../../db";
import { dbIntegrityQuarantine } from "@shared/db";
import { eq, lt, and, isNull, sql } from "drizzle-orm";

const TTL_DAYS = 30;

export async function quarantineRows(params: {
  sourceTable: string;
  rows: Array<{ pk: string; payload: Record<string, unknown> }>;
  reason: string;
  violationId?: string;
}): Promise<number> {
  if (!params.rows.length) return 0;
  const ttl = new Date(Date.now() + TTL_DAYS * 86_400_000);
  const values = params.rows.map((r) => ({
    sourceTable: params.sourceTable,
    sourcePk: r.pk.slice(0, 80),
    payload: r.payload,
    reason: params.reason.slice(0, 1000),
    ttlExpiresAt: ttl,
    violationId: params.violationId ?? null,
  }));
  try {
    await db.insert(dbIntegrityQuarantine).values(values);
    return values.length;
  } catch (err) {
    console.warn("[db-integrity/quarantine] insert error:", (err as Error).message);
    return 0;
  }
}

export async function restoreFromQuarantine(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const [row] = await db.select().from(dbIntegrityQuarantine).where(eq(dbIntegrityQuarantine.id, id));
    if (!row) return { ok: false, message: "Riga quarantena non trovata" };
    if (row.restoredAt) return { ok: false, message: "Riga già ripristinata" };
    if (row.purgedAt) return { ok: false, message: "Riga già purgata" };
    const { ALLOWED_RESTORE_TABLES } = await import("./framework-restore-allow");
    if (!ALLOWED_RESTORE_TABLES.has(row.sourceTable)) {
      return { ok: false, message: `Tabella ${row.sourceTable} non in whitelist restore` };
    }
    const payload = row.payload as Record<string, unknown>;
    const cols = Object.keys(payload);
    if (!cols.length) return { ok: false, message: "Payload vuoto" };
    // Sanitizzazione difensiva: solo nomi colonna [a-zA-Z0-9_].
    const safeCols = cols.filter((c) => /^[a-zA-Z0-9_]+$/.test(c));
    if (safeCols.length !== cols.length) return { ok: false, message: "Colonne con caratteri non sicuri" };
    const safeTable = row.sourceTable.replace(/[^a-zA-Z0-9_]/g, "");
    const colSql = sql.join(safeCols.map((c) => sql.identifier(c)), sql`, `);
    const valSql = sql.join(
      safeCols.map((c) => {
        const v = payload[c];
        // jsonb/object → stringify per node-postgres (PG cast text→jsonb in INSERT)
        if (v !== null && typeof v === "object" && !(v instanceof Date)) return sql`${JSON.stringify(v)}`;
        return sql`${v as unknown}`;
      }),
      sql`, `,
    );
    await db.execute(
      sql`INSERT INTO ${sql.identifier(safeTable)} (${colSql}) VALUES (${valSql}) ON CONFLICT DO NOTHING`,
    );
    await db.update(dbIntegrityQuarantine).set({ restoredAt: new Date() }).where(eq(dbIntegrityQuarantine.id, id));
    return { ok: true, message: "Riga ripristinata" };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

export async function purgeQuarantineRow(id: string): Promise<boolean> {
  try {
    await db.update(dbIntegrityQuarantine).set({ purgedAt: new Date() }).where(eq(dbIntegrityQuarantine.id, id));
    return true;
  } catch { return false; }
}

export async function cleanupExpiredQuarantine(): Promise<number> {
  const now = new Date();
  const res = await db
    .update(dbIntegrityQuarantine)
    .set({ purgedAt: now })
    .where(and(lt(dbIntegrityQuarantine.ttlExpiresAt, now), isNull(dbIntegrityQuarantine.purgedAt)))
    .returning({ id: dbIntegrityQuarantine.id });
  return res.length;
}
