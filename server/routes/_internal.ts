import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Pool } from "pg";
import { db } from "../db";
import { sendError } from "../lib/api-response";
import { messages, conversations } from "@shared/db/conversations";
import { users } from "@shared/db/users";
import { proposals } from "@shared/db/proposals";
import { eq, gte, sql } from "drizzle-orm";
import { getSessionHealthStats } from "../session-health";

const router = Router();

const EXPORTS_DIR = path.resolve(process.cwd(), "exports");

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) {
      const padded = Buffer.alloc(bufA.length);
      bufB.copy(padded, 0, 0, Math.min(bufB.length, bufA.length));
      crypto.timingSafeEqual(bufA, padded);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function requireExportToken(req: Request, res: Response): boolean {
  const expectedToken = process.env.CHAT_EXPORT_TOKEN;
  if (!expectedToken) {
    sendError(res, 503, "Export non configurato (CHAT_EXPORT_TOKEN mancante)");
    return false;
  }

  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.set("WWW-Authenticate", "Bearer");
    sendError(res, 401, "Token richiesto");
    return false;
  }

  const providedToken = authHeader.substring(7).trim();
  if (!timingSafeCompare(providedToken, expectedToken)) {
    sendError(res, 401, "Token non valido");
    return false;
  }

  return true;
}

router.get("/tasks-export", (req: Request, res: Response) => {
  if (!requireExportToken(req, res)) return;

  const part = typeof req.query.part === "string" ? req.query.part : null;

  let filePath: string;
  if (part) {
    const sanitized = part.replace(/[^0-9]/g, "").padStart(2, "0");
    filePath = path.join(EXPORTS_DIR, `bikerlink-tasks-part-${sanitized}.md`);
  } else {
    filePath = path.join(EXPORTS_DIR, "bikerlink-tasks.md");
  }

  if (!fs.existsSync(filePath)) {
    return sendError(res, 404, "Export non trovato. Rigenera exports/bikerlink-tasks.md eseguendo lo script.");
  }

  const content = fs.readFileSync(filePath, "utf-8");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Export-File", path.basename(filePath));
  return res.send(content);
});

router.get("/chat-export", async (req: Request, res: Response) => {
  if (!requireExportToken(req, res)) return;

  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const dateLabel = now.toLocaleDateString("it-IT", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const timeLabel = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

    const [todayMessages, newUsers, newProposals, totalUsers, totalMessages] = await Promise.all([
      db
        .select({
          id: messages.id,
          content: messages.content,
          messageType: messages.messageType,
          createdAt: messages.createdAt,
          senderNickname: users.nickname,
          senderType: users.userType,
          conversationId: messages.conversationId,
          conversationType: conversations.conversationType,
          conversationTitle: conversations.title,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderId, users.id))
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .where(gte(messages.createdAt, todayStart))
        .orderBy(messages.createdAt),

      db
        .select({
          id: users.id,
          nickname: users.nickname,
          userType: users.userType,
          region: users.region,
          createdAt: users.createdAt,
          isFake: users.isFake,
        })
        .from(users)
        .where(gte(users.createdAt, todayStart))
        .orderBy(users.createdAt),

      db
        .select({
          id: proposals.id,
          proposalType: proposals.proposalType,
          status: proposals.status,
          createdAt: proposals.createdAt,
        })
        .from(proposals)
        .where(gte(proposals.createdAt, todayStart)),

      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(messages),
    ]);

    const lines: string[] = [];

    lines.push(`# BikerLink — Attività del giorno`);
    lines.push(`**${dateLabel}** — generato alle ${timeLabel}`);
    lines.push(``);

    lines.push(`## Riepilogo`);
    lines.push(`| Metrica | Oggi | Totale |`);
    lines.push(`|---------|------|--------|`);
    lines.push(`| Nuovi utenti | ${newUsers.length} | ${totalUsers[0]?.count ?? "?"} |`);
    lines.push(`| Messaggi inviati | ${todayMessages.length} | ${totalMessages[0]?.count ?? "?"} |`);
    lines.push(`| Nuovi match/proposte | ${newProposals.length} | — |`);
    lines.push(``);

    lines.push(`## Nuovi utenti (${newUsers.length})`);
    if (newUsers.length === 0) {
      lines.push(`_Nessun nuovo utente oggi._`);
    } else {
      lines.push(`| Ora | Nickname | Tipo | Regione | Fake |`);
      lines.push(`|-----|----------|------|---------|------|`);
      for (const u of newUsers) {
        const ora = new Date(u.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        lines.push(`| ${ora} | ${u.nickname} | ${u.userType} | ${u.region ?? "—"} | ${u.isFake ? "✓" : ""} |`);
      }
    }
    lines.push(``);

    lines.push(`## Nuove proposte/match (${newProposals.length})`);
    if (newProposals.length === 0) {
      lines.push(`_Nessuna proposta oggi._`);
    } else {
      lines.push(`| Ora | Tipo | Stato |`);
      lines.push(`|-----|------|-------|`);
      for (const p of newProposals) {
        const ora = new Date(p.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        lines.push(`| ${ora} | ${p.proposalType ?? "—"} | ${p.status ?? "—"} |`);
      }
    }
    lines.push(``);

    lines.push(`## Messaggi di oggi (${todayMessages.length})`);
    if (todayMessages.length === 0) {
      lines.push(`_Nessun messaggio oggi._`);
    } else {
      const byConv = new Map<string, typeof todayMessages>();
      for (const m of todayMessages) {
        const key = m.conversationId;
        if (!byConv.has(key)) byConv.set(key, []);
        byConv.get(key)!.push(m);
      }

      for (const [, msgs] of byConv) {
        const first = msgs[0];
        const convLabel = first.conversationTitle
          ? `"${first.conversationTitle}"`
          : `[${first.conversationType}]`;
        lines.push(`### Conversazione ${convLabel} — ${msgs.length} msg`);
        for (const m of msgs) {
          const ora = new Date(m.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
          const testo = m.messageType !== "text"
            ? `_(${m.messageType})_`
            : (m.content ?? "").replace(/\n/g, " ").slice(0, 300);
          lines.push(`- **${ora}** [${m.senderNickname}] ${testo}`);
        }
        lines.push(``);
      }
    }

    const markdown = lines.join("\n");

    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Export-Date", now.toISOString());
    return res.send(markdown);
  } catch (err) {
    console.error("[chat-export] Errore:", err);
    return sendError(res, 500, "Errore interno durante l'export");
  }
});

router.post("/purge-fake-users", async (req: Request, res: Response) => {
  if (!requireExportToken(req, res)) return;

  const applyMode = req.body?.apply === true;
  const FAKE_EMAIL_DOMAIN = "@fakeuser.bikerlink.it";

  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    const statsRows = await pool.query<{
      total: string; by_is_fake: string; by_email_domain: string; by_invitation_code: string;
    }>(`
      SELECT
        COUNT(*)                                                       AS total,
        COUNT(*) FILTER (WHERE is_fake = true)                        AS by_is_fake,
        COUNT(*) FILTER (WHERE email LIKE $1)                         AS by_email_domain,
        COUNT(*) FILTER (WHERE invitation_code LIKE 'mass_seed%')     AS by_invitation_code
      FROM users
      WHERE is_fake = true OR email LIKE $1 OR invitation_code LIKE 'mass_seed%'
    `, [`%${FAKE_EMAIL_DOMAIN}`]);

    const s = statsRows.rows[0];
    const total = parseInt(s?.total ?? "0", 10);
    const dryRunInfo = {
      total,
      by_is_fake: parseInt(s?.by_is_fake ?? "0", 10),
      by_email_domain: parseInt(s?.by_email_domain ?? "0", 10),
      by_invitation_code: parseInt(s?.by_invitation_code ?? "0", 10),
    };

    if (!applyMode) {
      await pool.end();
      return res.json({ mode: "dry-run", ...dryRunInfo });
    }

    if (total === 0) {
      await pool.end();
      return res.json({ mode: "apply", deleted: 0, remaining: 0, message: "Already clean" });
    }

    const idsResult = await pool.query<{ id: string }>(`
      SELECT id FROM users
      WHERE is_fake = true OR email LIKE $1 OR invitation_code LIKE 'mass_seed%'
    `, [`%${FAKE_EMAIL_DOMAIN}`]);
    const ids = idsResult.rows.map(r => r.id);

    const deleteResult = await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [ids]);
    const deleted = deleteResult.rowCount ?? 0;

    const verifyResult = await pool.query<{ remaining: string }>(`
      SELECT COUNT(*) AS remaining FROM users
      WHERE is_fake = true OR email LIKE $1 OR invitation_code LIKE 'mass_seed%'
    `, [`%${FAKE_EMAIL_DOMAIN}`]);
    const remaining = parseInt(verifyResult.rows[0]?.remaining ?? "0", 10);

    await pool.end();

    console.log(`[internal/purge-fake-users] APPLY: deleted=${deleted} remaining=${remaining}`);
    return res.json({ mode: "apply", deleted, remaining, scan: dryRunInfo });
  } catch (err) {
    console.error("[internal/purge-fake-users] ERROR:", err);
    return sendError(res, 500, "Errore durante la purge");
  }
});

router.get("/health", (_req: Request, res: Response) => {
  const stats = getSessionHealthStats();
  const httpStatus = stats.status === "critical" ? 503 : 200;
  return res.status(httpStatus).json({
    ok: stats.status !== "critical",
    sessionStore: stats,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
