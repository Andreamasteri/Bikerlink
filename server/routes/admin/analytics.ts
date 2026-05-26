import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users } from "@shared/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const [totalUsers, onlineNow, activeWeek, pendingReports] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`last_login_at >= NOW() - INTERVAL '5 minutes'`),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`last_login_at >= NOW() - INTERVAL '7 days'`),
      storage.getPendingReportsCount(),
    ]);

    return res.json({
      totalUsers: totalUsers[0].count,
      onlineUsersNow: onlineNow[0].count,
      activeUsersWeek: activeWeek[0].count,
      workshopContactsMonth: 0,
      totalAdClicks: 0,
      activeCampaigns: 0,
      pendingReports,
      timestamp: new Date().toISOString(),
    });
  } catch (_error) {
    console.error("Admin get analytics error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/export-csv", async (_req: Request, res: Response) => {
  try {
    const usersList = await storage.getAllUsers();
    let csv = "ID,Nickname,Email,Role,Status,Created At\n";
    for (const u of usersList) {
      csv += `${u.id},"${u.nickname}","${u.email}",${u.role},${u.status},${u.createdAt}\n`;
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=users_export.csv");
    return res.send(csv);
  } catch (_error) {
    return sendError(res, 500, "Errore export CSV");
  }
});

router.get("/users-list", async (_req: Request, res: Response) => {
  try {
    const usersList = await storage.getAllUsers();
    return res.json(usersList.map(({ password: _password, ...u }) => u));
  } catch (_error) {
    return sendError(res, 500, "Errore lettura utenti");
  }
});

router.get("/active-users", async (req: Request, res: Response) => {
  try {
    const days = parseInt(String(req.query.days ?? "30"), 10) || 30;
    const active = await db.select().from(users).where(sql`last_login_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'`);
    return res.json(active.map(({ password: _password, ...u }) => u));
  } catch (_error) {
    return sendError(res, 500, "Errore lettura utenti attivi");
  }
});

router.get("/online-now", async (_req: Request, res: Response) => {
  try {
    const online = await db.select().from(users).where(sql`last_login_at >= NOW() - INTERVAL '5 minutes'`);
    return res.json(online.map(({ password: _password, ...u }) => u));
  } catch (_error) {
    return sendError(res, 500, "Errore lettura utenti online");
  }
});

router.get("/ad-clicks", async (_req: Request, res: Response) => {
  try {
    return res.json({ clicks: [] });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura click pubblicità");
  }
});

router.get("/pending-reports", async (_req: Request, res: Response) => {
  try {
    const reports = await storage.getReports();
    return res.json(reports.filter(r => !r.resolvedAt));
  } catch (_error) {
    return sendError(res, 500, "Errore lettura segnalazioni pendenti");
  }
});

router.get("/site-visits/summary", async (_req: Request, res: Response) => {
  try {
    const [viewsToday, views7d, views30d, viewsTotal,
           uniqueToday, unique7d, unique30d, uniqueTotal,
           reg30d, regTotal, login30d, loginTotal] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'view' AND created_at >= NOW() - INTERVAL '1 day'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'view' AND created_at >= NOW() - INTERVAL '7 days'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'view' AND created_at >= NOW() - INTERVAL '30 days'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'view'`),
      db.execute(sql`SELECT COUNT(DISTINCT visitor_id)::int AS n FROM site_visits WHERE event = 'view' AND created_at >= NOW() - INTERVAL '1 day'`),
      db.execute(sql`SELECT COUNT(DISTINCT visitor_id)::int AS n FROM site_visits WHERE event = 'view' AND created_at >= NOW() - INTERVAL '7 days'`),
      db.execute(sql`SELECT COUNT(DISTINCT visitor_id)::int AS n FROM site_visits WHERE event = 'view' AND created_at >= NOW() - INTERVAL '30 days'`),
      db.execute(sql`SELECT COUNT(DISTINCT visitor_id)::int AS n FROM site_visits WHERE event = 'view'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'register' AND created_at >= NOW() - INTERVAL '30 days'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'register'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'login' AND created_at >= NOW() - INTERVAL '30 days'`),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM site_visits WHERE event = 'login'`),
    ]);

    return res.json({
      views: {
        today: (viewsToday.rows[0] as { n: number }).n,
        last7d: (views7d.rows[0] as { n: number }).n,
        last30d: (views30d.rows[0] as { n: number }).n,
        total: (viewsTotal.rows[0] as { n: number }).n,
      },
      uniqueVisitors: {
        today: (uniqueToday.rows[0] as { n: number }).n,
        last7d: (unique7d.rows[0] as { n: number }).n,
        last30d: (unique30d.rows[0] as { n: number }).n,
        total: (uniqueTotal.rows[0] as { n: number }).n,
      },
      registrations: {
        last30d: (reg30d.rows[0] as { n: number }).n,
        total: (regTotal.rows[0] as { n: number }).n,
      },
      logins: {
        last30d: (login30d.rows[0] as { n: number }).n,
        total: (loginTotal.rows[0] as { n: number }).n,
      },
    });
  } catch (_error) {
    console.error("Admin site-visits summary error:", _error);
    return sendError(res, 500, "Errore lettura visite sito");
  }
});

router.get("/site-visits", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const loggedOnly = req.query.loggedOnly === "1";

    const VALID_EVENTS = ["view", "register", "login"] as const;
    const rawEvent = req.query.event ? String(req.query.event) : null;
    const eventFilter = rawEvent && (VALID_EVENTS as readonly string[]).includes(rawEvent) ? rawEvent : null;

    const conditions: ReturnType<typeof sql>[] = [];
    if (from) conditions.push(sql`sv.created_at >= ${from}::date`);
    if (to) conditions.push(sql`sv.created_at < ${to}::date`);
    if (eventFilter) conditions.push(sql`sv.event = ${eventFilter}`);
    if (loggedOnly) conditions.push(sql`sv.user_id IS NOT NULL`);

    const whereClause = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const [countResult, rowsResult] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM site_visits sv
        ${whereClause}
      `),
      db.execute(sql`
        SELECT
          sv.id,
          sv.visitor_id AS "visitorId",
          sv.user_id AS "userId",
          u.nickname AS "userNickname",
          sv.event,
          sv.path,
          sv.referrer,
          sv.user_agent AS "userAgent",
          sv.ip_prefix AS "ipPrefix",
          sv.lang,
          sv.country,
          sv.created_at AS "createdAt"
        FROM site_visits sv
        LEFT JOIN users u ON u.id = sv.user_id
        ${whereClause}
        ORDER BY sv.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    return res.json({
      total: (countResult.rows[0] as { n: number }).n,
      visits: rowsResult.rows,
    });
  } catch (_error) {
    console.error("Admin site-visits list error:", _error);
    return sendError(res, 500, "Errore lettura visite sito");
  }
});

export default router;
