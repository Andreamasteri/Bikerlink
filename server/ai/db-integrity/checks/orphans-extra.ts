// Task #2536 — Check pack extra: orfani ulteriori su tabelle realtime/log.
// Defensive con to_regclass: silenzioso se la tabella non esiste.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";
import { deleteOrphans } from "./orphans";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

async function orphanCheck(child: string, fk: string, parent: string, parentPk = "id"): Promise<CheckResult> {
  if (!(await tableExists(child)) || !(await tableExists(parent))) {
    return { ok: true, count: 0, sample: [], details: { skipped: "missing-table" } };
  }
  const safeChild = child.replace(/[^a-z0-9_]/g, "");
  const safeFk = fk.replace(/[^a-z0-9_]/g, "");
  const safeParent = parent.replace(/[^a-z0-9_]/g, "");
  const safePk = parentPk.replace(/[^a-z0-9_]/g, "");
  try {
    const cnt = await db.execute(
      sql`SELECT COUNT(*)::int AS c FROM ${sql.identifier(safeChild)} c LEFT JOIN ${sql.identifier(safeParent)} p ON c.${sql.identifier(safeFk)} = p.${sql.identifier(safePk)} WHERE c.${sql.identifier(safeFk)} IS NOT NULL AND p.${sql.identifier(safePk)} IS NULL`,
    );
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [] };
    const smp = await db.execute(
      sql`SELECT c.* FROM ${sql.identifier(safeChild)} c LEFT JOIN ${sql.identifier(safeParent)} p ON c.${sql.identifier(safeFk)} = p.${sql.identifier(safePk)} WHERE c.${sql.identifier(safeFk)} IS NOT NULL AND p.${sql.identifier(safePk)} IS NULL LIMIT 10`,
    );
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return {
      ok: false, count,
      sample: rows.map((r) => ({ pk: String(r.id ?? JSON.stringify(r).slice(0, 60)), data: r })),
      details: { child, fk, parent },
    };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

// 9 check (totale stack: orphans 11 + extra 9 = 20 in pacchetto orfani)
const checks: IntegrityCheck[] = [
  { id: "orphans-x/ride-points-user",    name: "ride_points senza utente",          category: "orphans", severity: "medium", cost: "medium", description: "Punti GPS di ride per utenti cancellati.",          query: () => orphanCheck("ride_points", "user_id", "users") },
  { id: "orphans-x/ride-points-ride",    name: "ride_points senza ride",             category: "orphans", severity: "medium", cost: "medium", description: "Punti GPS senza ride di riferimento.",             query: () => orphanCheck("ride_points", "ride_id", "rides") },
  { id: "orphans-x/planned-routes-user", name: "planned_routes senza utente",        category: "orphans", severity: "medium", cost: "cheap",  description: "Percorsi pianificati di utenti cancellati.",       query: () => orphanCheck("planned_routes", "user_id", "users") },
  {
    id: "orphans-x/sos-alerts-user",
    name: "sos_alerts senza utente",
    category: "orphans", severity: "high", cost: "cheap",
    description: "SOS attivati da utenti non più presenti.",
    query: () => orphanCheck("sos_alerts", "user_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["sos_alerts"], run: ({ dryRun }) => deleteOrphans("sos_alerts", "user_id", "users", "id", dryRun) },
  },
  {
    id: "orphans-x/sessions-user",
    name: "user_sessions senza utente",
    category: "orphans", severity: "high", cost: "cheap",
    description: "Sessioni residue dopo cancellazione utente.",
    query: () => orphanCheck("user_sessions", "user_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["user_sessions"], run: ({ dryRun }) => deleteOrphans("user_sessions", "user_id", "users", "id", dryRun) },
  },
  {
    id: "orphans-x/push-tokens-user",
    name: "user_push_tokens senza utente",
    category: "orphans", severity: "medium", cost: "cheap",
    description: "Push token residui.",
    query: () => orphanCheck("user_push_tokens", "user_id", "users"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["user_push_tokens"], run: ({ dryRun }) => deleteOrphans("user_push_tokens", "user_id", "users", "id", dryRun) },
  },
  { id: "orphans-x/blocks-blocker", name: "user_blocks senza blocker", category: "orphans", severity: "low", cost: "cheap", description: "Block list senza chi ha bloccato.", query: () => orphanCheck("user_blocks", "blocker_id", "users") },
  { id: "orphans-x/blocks-blocked", name: "user_blocks senza blocked", category: "orphans", severity: "low", cost: "cheap", description: "Block list con bersaglio cancellato.", query: () => orphanCheck("user_blocks", "blocked_id", "users") },
  {
    id: "orphans-x/chat-messages-conv",
    name: "chat_messages senza conversazione",
    category: "orphans", severity: "high", cost: "medium",
    description: "Messaggi orfani dopo cancellazione conversazione.",
    query: () => orphanCheck("chat_messages", "conversation_id", "chat_conversations"),
    autofix: { kind: "delete-orphan-log", safe: true, operation: "delete", targetTables: ["chat_messages"], run: ({ dryRun }) => deleteOrphans("chat_messages", "conversation_id", "chat_conversations", "id", dryRun) },
  },
];

export default checks;
