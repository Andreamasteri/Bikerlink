import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, moderatorLogs, siteVisits } from "@shared/db";
import { sql, desc } from "drizzle-orm";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const [totalUsers, activeUsers, totalVisits, pendingReports] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(users),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(sql`last_login_at >= NOW() - INTERVAL '30 days'`),
      db.select({ count: sql<number>`count(*)::int` }).from(siteVisits),
      storage.getPendingReportsCount(),
    ]);

    return res.json({
      users: {
        total: totalUsers[0].count,
        active30d: activeUsers[0].count,
      },
      visits: {
        total: totalVisits[0].count,
      },
      reports: {
        pending: pendingReports,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Admin get analytics error:", error);
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
  } catch (error) {
    return sendError(res, 500, "Errore export CSV");
  }
});

router.get("/users-list", async (_req: Request, res: Response) => {
  try {
    const usersList = await storage.getAllUsers();
    return res.json(usersList.map(({ password, ...u }) => u));
  } catch (error) {
    return sendError(res, 500, "Errore lettura utenti");
  }
});

router.get("/active-users", async (req: Request, res: Response) => {
  try {
    const days = parseInt(String(req.query.days ?? "30"), 10) || 30;
    const active = await db.select().from(users).where(sql`last_login_at >= NOW() - INTERVAL '${sql.raw(days.toString())} days'`);
    return res.json(active.map(({ password, ...u }) => u));
  } catch (error) {
    return sendError(res, 500, "Errore lettura utenti attivi");
  }
});

router.get("/online-now", async (_req: Request, res: Response) => {
  try {
    const online = await db.select().from(users).where(sql`last_login_at >= NOW() - INTERVAL '5 minutes'`);
    return res.json(online.map(({ password, ...u }) => u));
  } catch (error) {
    return sendError(res, 500, "Errore lettura utenti online");
  }
});

router.get("/ad-clicks", async (_req: Request, res: Response) => {
  try {
    return res.json({ clicks: [] });
  } catch (error) {
    return sendError(res, 500, "Errore lettura click pubblicità");
  }
});

router.get("/pending-reports", async (_req: Request, res: Response) => {
  try {
    const reports = await storage.getReports();
    return res.json(reports.filter(r => !r.resolvedAt));
  } catch (error) {
    return sendError(res, 500, "Errore lettura segnalazioni pendenti");
  }
});

router.get("/site-visits/summary", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`SELECT page_path, COUNT(*) as visits FROM site_visits GROUP BY page_path ORDER BY visits DESC`);
    return res.json(result.rows);
  } catch (error) {
    return sendError(res, 500, "Errore lettura visite sito");
  }
});

router.get("/site-visits", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 1000);
    const visits = await db.select().from(siteVisits).orderBy(desc(siteVisits.createdAt)).limit(limit);
    return res.json(visits);
  } catch (error) {
    return sendError(res, 500, "Errore lettura visite sito");
  }
});

export default router;
