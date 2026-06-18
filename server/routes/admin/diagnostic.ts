import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { db } from "../../db";
import { sendError } from "../../lib/api-response";
import { diagnosticReports, diagnosticQueue } from "@shared/db";
import { users } from "@shared/db";
import { and, desc, eq, gte, gt, ilike, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { storage } from "../../storage";
import { sendDiagnosticCommand, getOnlineUsers } from "../../diagnostic-ws";
import { onlineTracker } from "../../online-tracker";

const REPORTS_DIR = path.join(process.cwd(), "server", "diagnostics", "reports");

function ensureReportsDir() {
  try { fs.mkdirSync(REPORTS_DIR, { recursive: true }); } catch { /* already exists */ }
}

interface DiagFileEntry {
  filename: string;
  userId: string;
  timestamp: string;
  sizeBytes: number;
}

function parseFilename(filename: string): { userId: string; timestamp: string } | null {
  const match = /^diag_([a-f0-9-]{36})_(.+)_[a-f0-9]{8}\.json$/.exec(filename);
  if (!match) return null;
  const rawTs = (match[2] ?? "").replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
  return { userId: match[1] ?? "unknown", timestamp: rawTs };
}

export function cleanupOldDiagFiles(): void {
  try {
    ensureReportsDir();
    const cutoffMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(REPORTS_DIR);
    let deleted = 0;
    for (const name of entries) {
      if (!name.endsWith(".json")) continue;
      const filepath = path.join(REPORTS_DIR, name);
      try {
        const stat = fs.statSync(filepath);
        if (stat.mtimeMs < cutoffMs) {
          fs.unlinkSync(filepath);
          deleted++;
        }
      } catch { /* skip unreadable files */ }
    }
    if (deleted > 0) console.log(`[diagnostic/files] Cleanup: rimossi ${deleted} file più vecchi di 30 giorni`);
  } catch (e) {
    console.warn("[diagnostic/files] Cleanup error:", e);
  }
}

const router = Router();

router.get("/diagnostic-reports", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));
    const offset = (page - 1) * limit;

    const onlyFailed = req.query.onlyFailed === "true";
    const onlyRemote = req.query.onlyRemote === "true";
    const appVersion = typeof req.query.appVersion === "string" && req.query.appVersion ? req.query.appVersion : undefined;
    const userId = typeof req.query.userId === "string" && req.query.userId ? req.query.userId.trim() : undefined;
    const nickname = typeof req.query.nickname === "string" && req.query.nickname ? req.query.nickname.trim() : undefined;
    const platform = typeof req.query.platform === "string" && req.query.platform ? req.query.platform.trim() : undefined;
    const dateFrom = typeof req.query.dateFrom === "string" && req.query.dateFrom ? req.query.dateFrom.trim() : undefined;
    const dateTo = typeof req.query.dateTo === "string" && req.query.dateTo ? req.query.dateTo.trim() : undefined;

    const conditions = [];

    if (onlyFailed) {
      conditions.push(sql`(${diagnosticReports.summary}->>'failed')::int > 0`);
    }
    if (onlyRemote) {
      conditions.push(eq(diagnosticReports.triggeredBy, "admin"));
    }
    if (appVersion) {
      conditions.push(eq(diagnosticReports.appVersion, appVersion));
    }
    if (userId) {
      conditions.push(eq(diagnosticReports.userId, userId));
    }
    if (platform) {
      conditions.push(eq(diagnosticReports.platform, platform));
    }
    if (nickname) {
      conditions.push(ilike(users.nickname, `%${nickname}%`));
    }
    if (dateFrom) {
      try {
        const from = new Date(dateFrom);
        if (!isNaN(from.getTime())) {
          conditions.push(gte(diagnosticReports.runAt, from));
        }
      } catch {/* invalid date — ignore */}
    }
    if (dateTo) {
      try {
        const to = new Date(dateTo);
        if (!isNaN(to.getTime())) {
          to.setHours(23, 59, 59, 999);
          conditions.push(lte(diagnosticReports.runAt, to));
        }
      } catch {/* invalid date — ignore */}
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      db.select({
        id: diagnosticReports.id,
        userId: diagnosticReports.userId,
        triggeredBy: diagnosticReports.triggeredBy,
        appVersion: diagnosticReports.appVersion,
        platform: diagnosticReports.platform,
        deviceModel: diagnosticReports.deviceModel,
        runAt: diagnosticReports.runAt,
        sentryEventId: diagnosticReports.sentryEventId,
        summary: diagnosticReports.summary,
        results: diagnosticReports.results,
        nickname: users.nickname,
      })
        .from(diagnosticReports)
        .leftJoin(users, eq(diagnosticReports.userId, users.id))
        .where(where)
        .orderBy(desc(diagnosticReports.runAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(diagnosticReports)
        .leftJoin(users, eq(diagnosticReports.userId, users.id))
        .where(where),
    ]);

    const total = countRows[0]?.count ?? 0;

    return res.json({ reports: rows, total, page, limit });
  } catch (err) {
    console.error("[admin/diagnostic-reports] GET error:", err);
    return sendError(res, 500, "Errore lettura report");
  }
});

router.post("/diagnostic-reports/trigger/:userId", async (req: Request, res: Response) => {
  try {
    const { userId } = req.params as { userId: string };
    const showBanner = req.body?.showBanner === true;

    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const delivered = sendDiagnosticCommand(userId, showBanner);

    if (!delivered) {
      await db.insert(diagnosticQueue).values({
        userId,
        commandedBy: (req as Request & { currentUser?: { id: string } }).currentUser?.id,
        showBanner,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).onConflictDoNothing();
      return res.json({ status: "queued", message: "Comando in coda — verrà eseguito alla prossima connessione" });
    }

    return res.json({ status: "sent", message: "Comando inviato" });
  } catch (err) {
    console.error("[admin/diagnostic-reports] trigger error:", err);
    return sendError(res, 500, "Errore invio comando");
  }
});

router.post("/diagnostic/request", async (req: Request, res: Response) => {
  try {
    const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : null;
    if (!userId) return sendError(res, 400, "userId obbligatorio");

    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const existing = await db.select({ id: diagnosticQueue.id })
      .from(diagnosticQueue)
      .where(
        and(
          eq(diagnosticQueue.userId, userId),
          isNull(diagnosticQueue.executedAt),
          gt(diagnosticQueue.expiresAt, new Date()),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return sendError(res, 409, "Esiste già un comando pendente per questo utente");
    }

    const adminId = (req as Request & { currentUser?: { id: string } }).currentUser?.id;
    await db.insert(diagnosticQueue).values({
      userId,
      commandedBy: adminId ?? null,
      showBanner: false,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    return res.json({ ok: true, message: "Comando in coda — l'app lo eseguirà al prossimo polling" });
  } catch (err) {
    console.error("[admin/diagnostic/request] POST error:", err);
    return sendError(res, 500, "Errore creazione comando");
  }
});

router.get("/diagnostic/search-users", async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q || q.length < 2) return res.json({ users: [] });

    const rows = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(
        or(
          ilike(users.nickname, `%${q}%`),
          sql`lower(${users.id}) like lower(${"%" + q + "%"})`
        )
      )
      .limit(20);

    return res.json({ users: rows });
  } catch (err) {
    console.error("[admin/diagnostic/search-users] error:", err);
    return sendError(res, 500, "Errore ricerca utenti");
  }
});

router.get("/diagnostic-reports/online-users", (_req: Request, res: Response) => {
  try {
    const onlineUsers = getOnlineUsers();
    return res.json({ users: onlineUsers });
  } catch (err) {
    console.error("[admin/diagnostic-reports] online-users error:", err);
    return sendError(res, 500, "Errore");
  }
});

router.get("/diagnostic/active-users", async (_req: Request, res: Response) => {
  try {
    const userIds = onlineTracker.getOnlineUserIds();
    if (userIds.length === 0) return res.json({ users: [] });

    const wsUsers = getOnlineUsers();
    const wsSet = new Set(wsUsers.map(u => u.userId));

    const rows = await db
      .select({ id: users.id, nickname: users.nickname })
      .from(users)
      .where(inArray(users.id, userIds));

    const nicknameMap = new Map(rows.map(r => [r.id, r.nickname]));

    const result = userIds.map(userId => ({
      userId,
      nickname: nicknameMap.get(userId) ?? null,
      wsConnected: wsSet.has(userId),
    }));

    return res.json({ users: result });
  } catch (err) {
    console.error("[admin/diagnostic/active-users] error:", err);
    return sendError(res, 500, "Errore caricamento utenti attivi");
  }
});

router.get("/diagnostic/files", (req: Request, res: Response) => {
  try {
    ensureReportsDir();
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10)));

    const allFiles: DiagFileEntry[] = [];
    try {
      const entries = fs.readdirSync(REPORTS_DIR);
      for (const name of entries) {
        if (!name.endsWith(".json")) continue;
        const filepath = path.join(REPORTS_DIR, name);
        let stat: fs.Stats;
        try { stat = fs.statSync(filepath); } catch { continue; }
        const parsed = parseFilename(name);
        allFiles.push({
          filename: name,
          userId: parsed?.userId ?? "unknown",
          timestamp: parsed?.timestamp ?? stat.mtime.toISOString(),
          sizeBytes: stat.size,
        });
      }
    } catch { /* directory may not exist yet */ }

    allFiles.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const total = allFiles.length;
    const files = allFiles.slice((page - 1) * limit, page * limit);

    return res.json({ files, total, page, limit });
  } catch (err) {
    console.error("[admin/diagnostic/files] GET error:", err);
    return sendError(res, 500, "Errore lettura file diagnostica");
  }
});

router.get("/diagnostic/files/:filename", (req: Request, res: Response) => {
  try {
    const { filename } = req.params as { filename: string };
    if (!/^diag_[a-f0-9-]+_.+_[a-f0-9]{8}\.json$/.test(filename) || filename.includes("/") || filename.includes("\\")) {
      return sendError(res, 400, "Nome file non valido");
    }
    const filepath = path.resolve(REPORTS_DIR, filename);
    if (!filepath.startsWith(REPORTS_DIR + path.sep) && filepath !== REPORTS_DIR) {
      return sendError(res, 400, "Percorso non valido");
    }
    if (!fs.existsSync(filepath)) {
      return sendError(res, 404, "File non trovato");
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.sendFile(filepath);
  } catch (err) {
    console.error("[admin/diagnostic/files] download error:", err);
    return sendError(res, 500, "Errore download file");
  }
});

router.delete("/diagnostic/files/:filename", (req: Request, res: Response) => {
  try {
    const { filename } = req.params as { filename: string };
    if (!/^diag_[a-f0-9-]+_.+_[a-f0-9]{8}\.json$/.test(filename) || filename.includes("/") || filename.includes("\\")) {
      return sendError(res, 400, "Nome file non valido");
    }
    const filepath = path.resolve(REPORTS_DIR, filename);
    if (!filepath.startsWith(REPORTS_DIR + path.sep) && filepath !== REPORTS_DIR) {
      return sendError(res, 400, "Percorso non valido");
    }
    if (!fs.existsSync(filepath)) {
      return sendError(res, 404, "File non trovato");
    }
    fs.unlinkSync(filepath);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/diagnostic/files] delete error:", err);
    return sendError(res, 500, "Errore eliminazione file");
  }
});

router.delete("/diagnostic-reports/cleanup", async (_req: Request, res: Response) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { rowCount } = await db.delete(diagnosticReports).where(lt(diagnosticReports.runAt, cutoff));
    await db.delete(diagnosticQueue).where(
      or(
        lt(diagnosticQueue.expiresAt, new Date()),
        and(isNull(diagnosticQueue.executedAt), gt(diagnosticQueue.createdAt, new Date(0)))
      )
    );
    return res.json({ deleted: rowCount ?? 0 });
  } catch (err) {
    console.error("[admin/diagnostic-reports] cleanup error:", err);
    return sendError(res, 500, "Errore pulizia");
  }
});

export default router;
