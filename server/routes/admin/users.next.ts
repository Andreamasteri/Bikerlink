/**
 * users.next.ts — file successore di users.ts
 *
 * Contenuto:
 *   - POST / — Creazione manuale utente reale da parte dell'admin (Task #2836)
 *   - GET /audit — Audit real/fake users e sessioni anomale
 *   - POST /fix-isfake — Correzione bulk isFake per utenti reali
 *   - GET /stats/devices — Statistiche dispositivi
 *
 * Route di dettaglio utente (/:id/stats, /:id/profile-gaps, ecc.)
 * → users.next-detail.ts
 *
 * Route match-summary e zero-match-snapshots
 * → users.next-match-summary.ts
 */

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { sendError } from "../../lib/api-response";
import { onlineTracker } from "../../online-tracker";

const router = Router();

const adminCreateUserSchema = z.object({
  nickname: z.string().min(1, "Nickname obbligatorio").max(30, "Nickname troppo lungo").transform((s) => s.trim()),
  email: z.string().email("Email non valida").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "La password deve avere almeno 8 caratteri"),
  userType: z.enum(["biker", "zavorrina", "coppia"], {
    error: "Tipo utente non valido (biker / zavorrina / coppia)",
  }),
  sex: z.enum(["M", "F"]).optional().nullable(),
  birthYear: z.number().int().min(1920).max(new Date().getFullYear()).optional().nullable(),
  region: z.string().optional().nullable().transform((s) => s?.trim() || null),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = adminCreateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, parsed.error.issues[0].message);
    }
    const { nickname, email, password, userType, sex, birthYear, region } = parsed.data;

    const existingNickname = await storage.getUserByNickname(nickname);
    if (existingNickname) {
      return sendError(res, 409, "Nickname già in uso");
    }

    const existingEmail = await storage.getUserByEmail(email);
    if (existingEmail) {
      return sendError(res, 409, "Email già registrata");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await storage.createUser({
      nickname,
      email,
      password: hashedPassword,
      userType,
      sex: sex || null,
      birthYear: birthYear ?? null,
      region: region || null,
      country: "IT",
      isFake: false,
      status: "active",
      emailVerified: true,
      eulaAccepted: true,
    });

    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "create_user_manual",
      targetType: "user",
      targetId: newUser.id,
      details: `Utente creato manualmente dall'admin: ${nickname} (${email})`,
    });

    const { password: _pw, ...safeUser } = newUser;
    return res.status(201).json(safeUser);
  } catch (err) {
    console.error("[admin] create user error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/audit", async (_req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const realUsersMarkedFake = await db.execute(sql`
      SELECT id, nickname, email, email_verified, last_login_at, created_at, status, role, invitation_code
      FROM users
      WHERE is_fake = true
        AND role NOT IN ('admin', 'moderator')
        AND email NOT LIKE '%@fakeuser.bikerlink.it'
        AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
        AND (email_verified = true OR last_login_at >= ${thirtyDaysAgo})
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT 200
    `);

    const anomalousStatus = await db.execute(sql`
      SELECT id, nickname, email, status, role, last_login_at, created_at, is_fake
      FROM users
      WHERE status != 'active'
        AND role NOT IN ('admin', 'moderator')
        AND is_fake = false
      ORDER BY last_login_at DESC NULLS LAST
      LIMIT 200
    `);

    const realFakeCount = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_fake = false AND role NOT IN ('admin', 'moderator')) AS real_users,
        COUNT(*) FILTER (WHERE is_fake = true AND role NOT IN ('admin', 'moderator')) AS fake_users,
        COUNT(*) FILTER (
          WHERE is_fake = true
            AND email NOT LIKE '%@fakeuser.bikerlink.it'
            AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
            AND (email_verified = true OR last_login_at >= ${thirtyDaysAgo})
            AND role NOT IN ('admin', 'moderator')
        ) AS real_marked_fake,
        COUNT(*) FILTER (WHERE status != 'active' AND is_fake = false AND role NOT IN ('admin', 'moderator')) AS real_but_inactive
      FROM users
    `);

    const activeSessionsButFakeResult = await db.execute(sql`
      SELECT u.id, u.nickname, u.email, u.is_fake, u.status, u.role, u.last_login_at,
             s.expire AS session_expires
      FROM session s
      JOIN users u ON u.id = (s.sess->>'userId')
      WHERE s.expire > NOW()
        AND u.is_fake = true
        AND u.role NOT IN ('admin', 'moderator')
      ORDER BY s.expire DESC
      LIMIT 100
    `).catch(() => ({ rows: [] as unknown[] }));

    const trackerOnlineIds = new Set(onlineTracker.getOnlineUserIds());
    const trackerSize = onlineTracker.size();

    const activeRealSessionsResult = await db.execute(sql`
      SELECT DISTINCT (s.sess->>'userId') AS user_id
      FROM session s
      JOIN users u ON u.id = (s.sess->>'userId')
      WHERE s.expire > NOW()
        AND u.is_fake = false
        AND u.role NOT IN ('admin', 'moderator')
    `).catch(() => ({ rows: [] as unknown[] }));

    type UserIdRow = { user_id: string };
    const activeRealSessionUserIds = new Set(
      (activeRealSessionsResult.rows as UserIdRow[]).map(r => r.user_id).filter(Boolean)
    );
    const sessionNotInTracker = [...activeRealSessionUserIds].filter(uid => !trackerOnlineIds.has(uid));

    type CountsRow = {
      real_users: string;
      fake_users: string;
      real_marked_fake: string;
      real_but_inactive: string;
    };
    const counts = realFakeCount.rows[0] as CountsRow;

    return res.json({
      summary: {
        realUsers: parseInt(counts.real_users ?? "0", 10),
        fakeUsers: parseInt(counts.fake_users ?? "0", 10),
        realUsersIncorrectlyMarkedFake: parseInt(counts.real_marked_fake ?? "0", 10),
        realButInactive: parseInt(counts.real_but_inactive ?? "0", 10),
        onlineTrackerSize: trackerSize,
        activeRealSessions: activeRealSessionUserIds.size,
        sessionNotInTrackerCount: sessionNotInTracker.length,
        activeSessionsMarkedFake: activeSessionsButFakeResult.rows.length,
      },
      realUsersMarkedFake: realUsersMarkedFake.rows,
      anomalousStatus: anomalousStatus.rows,
      activeSessionsMarkedFake: activeSessionsButFakeResult.rows,
      sessionNotInTracker: sessionNotInTracker.slice(0, 50),
      onlineTrackerUserIds: [...trackerOnlineIds].slice(0, 50),
    });
  } catch (err) {
    console.error("[admin] users audit error:", err);
    return sendError(res, 500, "Errore audit utenti");
  }
});

router.post("/fix-isfake", async (req: Request, res: Response) => {
  try {
    const dryRun = req.query.dry === "true";

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const candidatesResult = await db.execute(sql`
      SELECT id, nickname, email, email_verified, last_login_at, created_at, invitation_code
      FROM users
      WHERE is_fake = true
        AND role NOT IN ('admin', 'moderator')
        AND email NOT LIKE '%@fakeuser.bikerlink.it'
        AND (invitation_code IS NULL OR invitation_code NOT LIKE 'mass_seed%')
        AND (email_verified = true OR last_login_at >= ${thirtyDaysAgo})
      ORDER BY last_login_at DESC NULLS LAST
    `);

    type CandidateRow = { id: string; nickname: string; email: string; email_verified: boolean; last_login_at: string | null; created_at: string };
    const candidates = candidatesResult.rows as CandidateRow[];

    if (dryRun || candidates.length === 0) {
      return res.json({
        dryRun: true,
        candidateCount: candidates.length,
        candidates: candidates.map(c => ({ id: c.id, nickname: c.nickname, email: c.email })),
      });
    }

    const ids = candidates.map(c => c.id);
    const updateResult = await db.execute(sql`
      UPDATE users SET is_fake = false, updated_at = NOW()
      WHERE id = ANY(${ids}::varchar[])
    `);

    const affected = (updateResult.rowCount as number | null) ?? 0;

    return res.json({
      dryRun: false,
      affected,
      fixedUsers: candidates.map(c => ({ id: c.id, nickname: c.nickname })),
    });
  } catch (err) {
    console.error("[admin] fix-isfake error:", err);
    return sendError(res, 500, "Errore fix isFake");
  }
});

router.get("/stats/devices", async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 0;

    const dateFilter = days > 0
      ? sql`AND last_login_at >= NOW() - INTERVAL '1 day' * ${days}`
      : sql``;

    const platformResult = await db.execute(sql`
      SELECT
        COALESCE(last_platform, 'unknown') AS platform,
        COUNT(*)::int AS count
      FROM users
      WHERE role NOT IN ('admin', 'moderator')
        ${dateFilter}
      GROUP BY last_platform
      ORDER BY count DESC
    `);

    const modelsResult = await db.execute(sql`
      SELECT
        COALESCE(last_device_model, 'Sconosciuto') AS model,
        COALESCE(last_platform, 'unknown') AS platform,
        COUNT(*)::int AS count
      FROM users
      WHERE role NOT IN ('admin', 'moderator')
        AND last_device_model IS NOT NULL
        ${dateFilter}
      GROUP BY last_device_model, last_platform
      ORDER BY count DESC
      LIMIT 30
    `);

    const totalResult = await db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE role NOT IN ('admin', 'moderator')
        ${dateFilter}
    `);

    type PlatformRow = { platform: string; count: number };
    type ModelRow = { model: string; platform: string; count: number };
    type TotalRow = { total: number };

    const total = (totalResult.rows[0] as TotalRow)?.total ?? 0;
    const platforms = platformResult.rows as PlatformRow[];
    const models = modelsResult.rows as ModelRow[];

    return res.json({ total, platforms, models });
  } catch (err) {
    console.error("[admin] device stats error:", err);
    return sendError(res, 500, "Errore statistiche dispositivi");
  }
});

// GET /match-summary e GET /zero-match-snapshots → users.next-match-summary.ts

export default router;
