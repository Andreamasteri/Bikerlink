import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, abEvents } from "@shared/db";
import { sql, and, eq } from "drizzle-orm";

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
    const beforeCreatedAt = req.query.beforeCreatedAt ? String(req.query.beforeCreatedAt) : null;
    const beforeId = req.query.beforeId ? String(req.query.beforeId) : null;

    if ((beforeCreatedAt && !beforeId) || (!beforeCreatedAt && beforeId)) {
      return sendError(res, 400, "beforeCreatedAt e beforeId devono essere forniti insieme");
    }

    const VALID_EVENTS = ["view", "register", "login"] as const;
    const rawEvent = req.query.event ? String(req.query.event) : null;
    const eventFilter = rawEvent && (VALID_EVENTS as readonly string[]).includes(rawEvent) ? rawEvent : null;

    const conditions: ReturnType<typeof sql>[] = [];
    if (from) conditions.push(sql`sv.created_at >= ${from}::date`);
    if (to) conditions.push(sql`sv.created_at < ${to}::date`);
    if (eventFilter) conditions.push(sql`sv.event = ${eventFilter}`);
    if (loggedOnly) conditions.push(sql`sv.user_id IS NOT NULL`);
    if (beforeCreatedAt && beforeId) {
      conditions.push(sql`(sv.created_at, sv.id) < (${beforeCreatedAt}::timestamp, ${beforeId})`);
    }

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

    const visits = rowsResult.rows;
    const lastVisit = visits[visits.length - 1] as
      | { id?: string; createdAt?: string | Date }
      | undefined;

    return res.json({
      total: (countResult.rows[0] as { n: number }).n,
      visits,
      nextCursor: lastVisit?.id && lastVisit?.createdAt
        ? {
            beforeId: lastVisit.id,
            beforeCreatedAt: new Date(lastVisit.createdAt).toISOString(),
          }
        : null,
    });
  } catch (_error) {
    console.error("Admin site-visits list error:", _error);
    return sendError(res, 500, "Errore lettura visite sito");
  }
});

router.get("/onboarding-tags", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        eventName: abEvents.eventName,
        n: sql<number>`count(*)::int`,
      })
      .from(abEvents)
      .where(
        and(
          eq(abEvents.experimentKey, "analytics"),
          sql`${abEvents.eventName} IN (
            'onboarding_started',
            'onboarding_carousel_completed',
            'onboarding_tags_shown',
            'onboarding_tags_saved',
            'onboarding_tags_skipped'
          )`
        )
      )
      .groupBy(abEvents.eventName);

    const counts: Record<string, number> = {
      onboarding_started: 0,
      onboarding_carousel_completed: 0,
      onboarding_tags_shown: 0,
      onboarding_tags_saved: 0,
      onboarding_tags_skipped: 0,
    };
    for (const r of rows) counts[r.eventName] = r.n;

    const started = counts.onboarding_started;
    const carouselCompleted = counts.onboarding_carousel_completed;
    const shown = counts.onboarding_tags_shown;
    const saved = counts.onboarding_tags_saved;
    const skipped = counts.onboarding_tags_skipped;

    const carouselActionRows = await db.execute(sql`
      SELECT
        COALESCE(payload->>'action', 'unknown') AS action,
        COUNT(*)::int AS n
      FROM ab_events
      WHERE experiment_key = 'analytics'
        AND event_name = 'onboarding_carousel_completed'
      GROUP BY 1
    `);
    let carouselCompletedFinish = 0;
    let carouselCompletedSkip = 0;
    for (const row of carouselActionRows.rows as Array<{ action: string; n: number }>) {
      if (row.action === "complete") carouselCompletedFinish = row.n;
      else if (row.action === "skip") carouselCompletedSkip = row.n;
    }

    const skipBySlideRows = await db.execute(sql`
      SELECT
        (payload->>'reachedIndex')::int AS idx,
        COUNT(*)::int AS n
      FROM ab_events
      WHERE experiment_key = 'analytics'
        AND event_name = 'onboarding_carousel_completed'
        AND payload->>'action' = 'skip'
        AND payload->>'reachedIndex' ~ '^[0-9]+$'
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    const skipBySlide: { index: number; count: number }[] = (
      skipBySlideRows.rows as Array<{ idx: number; n: number }>
    ).map((r) => ({ index: r.idx, count: r.n }));
    const totalSkipsWithIndex = skipBySlide.reduce((sum, s) => sum + s.count, 0);
    const topSkipSlides = [...skipBySlide]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((s) => ({
        index: s.index,
        count: s.count,
        pct: totalSkipsWithIndex > 0
          ? Math.round((s.count / totalSkipsWithIndex) * 1000) / 10
          : 0,
      }));

    const avgRow = await db.execute(sql`
      SELECT
        COALESCE(AVG((payload->>'count')::int), 0)::float AS avg_count
      FROM ab_events
      WHERE experiment_key = 'analytics'
        AND event_name = 'onboarding_tags_saved'
        AND payload IS NOT NULL
        AND payload->>'count' ~ '^[0-9]+$'
    `);
    const avgTagCount = Math.round(
      ((avgRow.rows[0] as { avg_count: number } | undefined)?.avg_count ?? 0) * 10
    ) / 10;

    const pct = (num: number, den: number) =>
      den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

    const conversionRate = pct(saved, shown);
    const skipRate = pct(skipped, shown);

    return res.json({
      shown,
      saved,
      skipped,
      conversionRate,
      skipRate,
      avgTagCount,
      funnel: {
        started,
        carouselCompleted,
        carouselCompletedFinish,
        carouselCompletedSkip,
        skipBySlide,
        topSkipSlides,
        tagsShown: shown,
        tagsSaved: saved,
        tagsSkipped: skipped,
        dropOff: {
          startedToCarousel: pct(carouselCompleted, started),
          carouselToTagsShown: pct(shown, carouselCompleted),
          tagsShownToSaved: conversionRate,
          startedToSaved: pct(saved, started),
        },
      },
    });
  } catch (err) {
    console.error("Admin onboarding-tags analytics error:", err);
    return sendError(res, 500, "Errore lettura analytics onboarding tags");
  }
});

router.get("/sessions/stats", async (req: Request, res: Response) => {
  try {
    const period = parseInt(String(req.query.period ?? "7"), 10) || 7;
    const periodInterval = `${period} days`;

    const [avgDur1d, avgDur7d, avgDur30d, timeBands, exitBreakdown, top10] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(AVG(duration_seconds), 0)::float AS avg
        FROM user_sessions
        WHERE ended_at IS NOT NULL AND started_at >= NOW() - INTERVAL '1 day'
      `),
      db.execute(sql`
        SELECT COALESCE(AVG(duration_seconds), 0)::float AS avg
        FROM user_sessions
        WHERE ended_at IS NOT NULL AND started_at >= NOW() - INTERVAL '7 days'
      `),
      db.execute(sql`
        SELECT COALESCE(AVG(duration_seconds), 0)::float AS avg
        FROM user_sessions
        WHERE ended_at IS NOT NULL AND started_at >= NOW() - INTERVAL '30 days'
      `),
      db.execute(sql`
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM started_at) < 6 THEN '00-06'
            WHEN EXTRACT(HOUR FROM started_at) < 12 THEN '06-12'
            WHEN EXTRACT(HOUR FROM started_at) < 18 THEN '12-18'
            ELSE '18-24'
          END AS band,
          COUNT(*)::int AS count
        FROM user_sessions
        WHERE started_at >= NOW() - INTERVAL ${sql.raw(`'${periodInterval}'`)}
        GROUP BY 1
        ORDER BY 1
      `),
      db.execute(sql`
        SELECT
          COALESCE(exit_type, 'unknown') AS exit_type,
          COUNT(*)::int AS count
        FROM user_sessions
        WHERE ended_at IS NOT NULL AND started_at >= NOW() - INTERVAL ${sql.raw(`'${periodInterval}'`)}
        GROUP BY 1
      `),
      db.execute(sql`
        SELECT
          s.user_id,
          u.nickname,
          SUM(s.duration_seconds)::int AS total_seconds,
          COUNT(*)::int AS session_count
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.ended_at IS NOT NULL
          AND s.started_at >= NOW() - INTERVAL '30 days'
          AND u.is_fake = false
        GROUP BY s.user_id, u.nickname
        ORDER BY total_seconds DESC
        LIMIT 10
      `),
    ]);

    const bandsMap: Record<string, number> = { "00-06": 0, "06-12": 0, "12-18": 0, "18-24": 0 };
    for (const row of timeBands.rows as Array<{ band: string; count: number }>) {
      bandsMap[row.band] = row.count;
    }

    const exitMap: Record<string, number> = { background: 0, logout: 0, crash: 0 };
    let exitTotal = 0;
    for (const row of exitBreakdown.rows as Array<{ exit_type: string; count: number }>) {
      if (row.exit_type in exitMap) exitMap[row.exit_type] = row.count;
      exitTotal += row.count;
    }
    const exitPct = (key: string) => exitTotal > 0 ? Math.round((exitMap[key] / exitTotal) * 1000) / 10 : 0;

    return res.json({
      avgDurationSeconds: {
        today: Math.round((avgDur1d.rows[0] as { avg: number }).avg),
        last7d: Math.round((avgDur7d.rows[0] as { avg: number }).avg),
        last30d: Math.round((avgDur30d.rows[0] as { avg: number }).avg),
      },
      timeBands: bandsMap,
      exitType: {
        counts: exitMap,
        total: exitTotal,
        pct: {
          background: exitPct("background"),
          logout: exitPct("logout"),
          crash: exitPct("crash"),
        },
      },
      top10: top10.rows,
    });
  } catch (err) {
    console.error("[admin/sessions/stats] error:", err);
    return sendError(res, 500, "Errore statistiche sessioni");
  }
});

export default router;
