// Task #2536 — Check pack: stati impossibili.
import { sql } from "drizzle-orm";
import { db } from "../../../db";
import type { IntegrityCheck, CheckResult } from "../types";

async function tableExists(name: string): Promise<boolean> {
  const r = await db.execute(sql`SELECT to_regclass(${name}) IS NOT NULL AS ok`);
  return Boolean((r.rows?.[0] as { ok?: boolean } | undefined)?.ok);
}

async function rawCheck(label: string, countSql: string, sampleSql: string, details?: Record<string, unknown>): Promise<CheckResult> {
  try {
    const cnt = await db.execute(sql.raw(countSql));
    const count = Number((cnt.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
    if (!count) return { ok: true, count: 0, sample: [], details };
    const smp = await db.execute(sql.raw(sampleSql));
    const rows = (smp.rows ?? []) as Array<Record<string, unknown>>;
    return {
      ok: false, count,
      sample: rows.map((r) => ({ pk: String(r.id ?? JSON.stringify(r).slice(0, 60)), data: r })),
      details: { label, ...(details ?? {}) },
    };
  } catch (err) {
    return { ok: true, count: 0, sample: [], details: { skipped: (err as Error).message } };
  }
}

const checks: IntegrityCheck[] = [
  {
    id: "invalid-states/users-role",
    name: "users.role fuori enum",
    category: "invalid-states", severity: "high", cost: "cheap",
    description: "Valori di role non riconosciuti.",
    async query() {
      if (!(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      return rawCheck("invalid-role",
        `SELECT COUNT(*)::int AS c FROM users WHERE role NOT IN ('user','admin','moderator','super_admin')`,
        `SELECT id, nickname, role FROM users WHERE role NOT IN ('user','admin','moderator','super_admin') LIMIT 10`,
      );
    },
    // Enum-normalize safe: mappa varianti note (case, trim) ai valori canonici.
    autofix: {
      kind: "normalize-enum", safe: true,
      operation: "update", targetTables: ["users"],
      async run({ dryRun }) {
        if (!(await tableExists("users"))) return { applied: false, affected: 0, summary: "no users table" };
        const mapping: Array<[string, string]> = [
          ["USER", "user"], ["User", "user"], [" user", "user"], ["user ", "user"],
          ["ADMIN", "admin"], ["Admin", "admin"],
          ["MODERATOR", "moderator"], ["Moderator", "moderator"], ["mod", "moderator"],
          ["SUPER_ADMIN", "super_admin"], ["superadmin", "super_admin"], ["super-admin", "super_admin"],
        ];
        if (dryRun) {
          const inList = mapping.map(([k]) => `'${k.replace(/'/g, "''")}'`).join(",");
          const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM users WHERE role IN (${inList})`));
          const n = Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
          return { applied: false, affected: n, summary: `[dry-run] ${n} role da normalizzare` };
        }
        let total = 0;
        for (const [from, to] of mapping) {
          const r = await db.execute(sql`UPDATE users SET role = ${to} WHERE role = ${from}`);
          total += r.rowCount ?? 0;
        }
        return { applied: total > 0, affected: total, summary: `normalizzati ${total} valori users.role` };
      },
    },
  },
  {
    id: "invalid-states/users-status",
    name: "users.status fuori enum",
    category: "invalid-states", severity: "high", cost: "cheap",
    description: "Valori di status non riconosciuti.",
    async query() {
      if (!(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      return rawCheck("invalid-status",
        `SELECT COUNT(*)::int AS c FROM users WHERE status NOT IN ('active','suspended','deleted','pending','blocked')`,
        `SELECT id, nickname, status FROM users WHERE status NOT IN ('active','suspended','deleted','pending','blocked') LIMIT 10`,
      );
    },
    autofix: {
      kind: "normalize-enum", safe: true,
      operation: "update", targetTables: ["users"],
      async run({ dryRun }) {
        if (!(await tableExists("users"))) return { applied: false, affected: 0, summary: "no users table" };
        const mapping: Array<[string, string]> = [
          ["ACTIVE", "active"], ["Active", "active"],
          ["SUSPENDED", "suspended"], ["Suspended", "suspended"],
          ["DELETED", "deleted"], ["Deleted", "deleted"],
          ["PENDING", "pending"], ["Pending", "pending"],
        ];
        if (dryRun) {
          const inList = mapping.map(([k]) => `'${k.replace(/'/g, "''")}'`).join(",");
          const r = await db.execute(sql.raw(`SELECT COUNT(*)::int AS c FROM users WHERE status IN (${inList})`));
          const n = Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
          return { applied: false, affected: n, summary: `[dry-run] ${n} status da normalizzare` };
        }
        let total = 0;
        for (const [from, to] of mapping) {
          const r = await db.execute(sql`UPDATE users SET status = ${to} WHERE status = ${from}`);
          total += r.rowCount ?? 0;
        }
        return { applied: total > 0, affected: total, summary: `normalizzati ${total} valori users.status` };
      },
    },
  },
  {
    id: "invalid-states/shadowban-scaduto-attivo",
    name: "Shadow-ban scaduto ma utente ancora flaggato",
    category: "invalid-states", severity: "medium", cost: "cheap",
    description: "shadowBannedUntil < NOW() ma compare in match recenti come bannato.",
    async query() {
      if (!(await tableExists("users"))) return { ok: true, count: 0, sample: [] };
      return rawCheck("shadowban-stale",
        `SELECT COUNT(*)::int AS c FROM users WHERE shadow_banned_until IS NOT NULL AND shadow_banned_until < NOW() AND shadow_banned_at IS NOT NULL`,
        `SELECT id, nickname, shadow_banned_until FROM users WHERE shadow_banned_until IS NOT NULL AND shadow_banned_until < NOW() AND shadow_banned_at IS NOT NULL LIMIT 10`,
      );
    },
    autofix: {
      kind: "mark-stale", safe: true,
      operation: "update", targetTables: ["users"],
      async run({ dryRun }) {
        if (!(await tableExists("users"))) return { applied: false, affected: 0, summary: "no users table" };
        if (dryRun) {
          const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM users WHERE shadow_banned_until IS NOT NULL AND shadow_banned_until < NOW() AND shadow_banned_at IS NOT NULL`);
          const n = Number((r.rows?.[0] as { c?: number } | undefined)?.c ?? 0);
          return { applied: false, affected: n, summary: `[dry-run] ${n} shadow-ban scaduti` };
        }
        const r = await db.execute(sql`UPDATE users SET shadow_banned_at = NULL, shadow_ban_reason = NULL, shadow_banned_until = NULL WHERE shadow_banned_until < NOW()`);
        const n = r.rowCount ?? 0;
        return { applied: n > 0, affected: n, summary: `auto-unban di ${n} utenti con shadow-ban scaduto` };
      },
    },
  },
  {
    id: "invalid-states/match-score-out-of-range",
    name: "Score match fuori range [0,1]",
    category: "invalid-states", severity: "high", cost: "cheap",
    description: "Match con score negativi o > 1.",
    async query() {
      const results: CheckResult[] = [];
      for (const t of ["biker_zavorrina_matches", "biker_biker_matches", "matches"]) {
        if (!(await tableExists(t))) continue;
        // Lo score può vivere in colonna 'score' o dentro 'score_breakdown' JSONB.
        const r = await rawCheck(`score-${t}`,
          `SELECT COUNT(*)::int AS c FROM "${t}" WHERE (score_breakdown->>'final')::float < 0 OR (score_breakdown->>'final')::float > 1`,
          `SELECT id, score_breakdown FROM "${t}" WHERE (score_breakdown->>'final')::float < 0 OR (score_breakdown->>'final')::float > 1 LIMIT 10`,
          { table: t },
        );
        if (!r.ok) results.push(r);
      }
      if (!results.length) return { ok: true, count: 0, sample: [] };
      const total = results.reduce((a, x) => a + x.count, 0);
      return { ok: false, count: total, sample: results.flatMap((x) => x.sample).slice(0, 10), details: { sources: results.map((x) => x.details) } };
    },
  },
  {
    id: "invalid-states/reports-resolved-no-actor",
    name: "Report risolti senza resolvedBy/resolvedAt",
    category: "invalid-states", severity: "medium", cost: "cheap",
    description: "status=resolved ma senza chi/quando.",
    async query() {
      if (!(await tableExists("reports"))) return { ok: true, count: 0, sample: [] };
      return rawCheck("reports-resolved",
        `SELECT COUNT(*)::int AS c FROM reports WHERE status = 'resolved' AND (resolved_by IS NULL OR resolved_at IS NULL)`,
        `SELECT id, status, resolved_by, resolved_at FROM reports WHERE status = 'resolved' AND (resolved_by IS NULL OR resolved_at IS NULL) LIMIT 10`,
      );
    },
  },
  {
    id: "invalid-states/reports-category-enum",
    name: "Report con category fuori enum",
    category: "invalid-states", severity: "medium", cost: "cheap",
    description: "Categorie report non riconosciute.",
    async query() {
      if (!(await tableExists("reports"))) return { ok: true, count: 0, sample: [] };
      return rawCheck("reports-category",
        `SELECT COUNT(*)::int AS c FROM reports WHERE category NOT IN ('spam','harassment','fake_profile','inappropriate_content','scam','other','hate_speech','sexual_content','underage','violence')`,
        `SELECT id, category FROM reports WHERE category NOT IN ('spam','harassment','fake_profile','inappropriate_content','scam','other','hate_speech','sexual_content','underage','violence') LIMIT 10`,
      );
    },
  },
];
export default checks;
