// Task #2537 — Quarantena file su filesystem + tabella integrity_quarantine.
// Usata prima di rewrite/delete su file (autofix code-edit).
import fs from "fs/promises";
import path from "path";
import { db } from "../../db";
import { integrityQuarantine } from "@shared/db";
import { eq, and, isNull } from "drizzle-orm";
import type { Family } from "./types";

const QUARANTINE_ROOT = path.join(process.cwd(), ".local", "integrity-quarantine");
const DEFAULT_TTL_DAYS = 30;

export async function quarantineFile(opts: {
  family: Family; filePath: string; reason: string; violationId?: string | null; ttlDays?: number;
}): Promise<{ id: string; quarantinePath: string } | null> {
  const abs = path.isAbsolute(opts.filePath) ? opts.filePath : path.join(process.cwd(), opts.filePath);
  let content: string;
  try { content = await fs.readFile(abs, "utf8"); }
  catch { return null; }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const dir = path.join(QUARANTINE_ROOT, opts.family, id);
  await fs.mkdir(dir, { recursive: true });
  const qPath = path.join(dir, path.basename(opts.filePath));
  await fs.writeFile(qPath, content, "utf8");
  const ttl = new Date(Date.now() + (opts.ttlDays ?? DEFAULT_TTL_DAYS) * 86400_000);
  const [row] = await db.insert(integrityQuarantine).values({
    family: opts.family,
    sourcePath: opts.filePath,
    violationId: opts.violationId ?? null,
    payload: { content, sizeBytes: content.length, quarantinePath: path.relative(process.cwd(), qPath) },
    reason: opts.reason.slice(0, 1000),
    ttlExpiresAt: ttl,
  }).returning();
  return { id: row.id, quarantinePath: qPath };
}

export async function restoreFromQuarantine(id: string): Promise<{ ok: true; restoredPath: string } | { ok: false; message: string }> {
  const [row] = await db.select().from(integrityQuarantine).where(eq(integrityQuarantine.id, id));
  if (!row) return { ok: false, message: "Quarantena non trovata" };
  if (row.restoredAt) return { ok: false, message: "Già ripristinata" };
  if (row.purgedAt) return { ok: false, message: "Già purgata" };
  const payload = row.payload as { content?: string };
  if (typeof payload?.content !== "string") return { ok: false, message: "Payload senza content" };
  const abs = path.isAbsolute(row.sourcePath) ? row.sourcePath : path.join(process.cwd(), row.sourcePath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, payload.content, "utf8");
  await db.update(integrityQuarantine).set({ restoredAt: new Date() }).where(eq(integrityQuarantine.id, id));
  return { ok: true, restoredPath: abs };
}

export async function purgeQuarantineRow(id: string): Promise<boolean> {
  await db.update(integrityQuarantine).set({ purgedAt: new Date() }).where(eq(integrityQuarantine.id, id));
  return true;
}

export async function purgeExpired(): Promise<number> {
  const now = new Date();
  const rows = await db.select().from(integrityQuarantine)
    .where(and(isNull(integrityQuarantine.purgedAt), isNull(integrityQuarantine.restoredAt)));
  let n = 0;
  for (const r of rows) {
    if ((r.ttlExpiresAt as Date) < now) {
      await db.update(integrityQuarantine).set({ purgedAt: new Date() }).where(eq(integrityQuarantine.id, r.id));
      n++;
    }
  }
  return n;
}
