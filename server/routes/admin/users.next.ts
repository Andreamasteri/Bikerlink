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
import { isReservedNickname, isReservedEmailLocalPart } from "@shared/validators";

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

    // Task #119 — la creazione utente da admin bypassava il signup pubblico,
    // lasciando una via per creare account che imitano un agente AI (Ares,
    // Nadir, Bowie, Quebracho, Horus) sia nel nickname sia nell'email.
    if (isReservedNickname(nickname)) {
      return sendError(res, 400, "Nickname non disponibile");
    }
    if (isReservedEmailLocalPart(email)) {
      return sendError(res, 400, "Indirizzo email non consentito");
    }

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

// GET /stats/push-tokens/admins — Copertura token push specifica per gli admin.
// Mostra per ogni admin: nickname, role, se ha token (push_tokens app_id=main
// OPPURE users.expoPushToken), e quando è stato registrato l'ultimo token.
// Separato dal report utenti normali perché gli admin sono esclusi da quello.
router.get("/stats/push-tokens/admins", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT
        u.id,
        u.nickname,
        u.role,
        u.expo_push_token,
        u.push_token_error,
        u.push_token_error_at,
        pt.token        AS pt_token,
        pt.updated_at   AS pt_updated_at
      FROM users u
      LEFT JOIN push_tokens pt
        ON pt.user_id = u.id AND pt.app_id = 'main'
      WHERE u.role IN ('admin', 'moderator')
        AND u.is_fake = false
      ORDER BY u.role, u.nickname
    `);

    type Row = {
      id: string;
      nickname: string;
      role: string;
      expo_push_token: string | null;
      push_token_error: string | null;
      push_token_error_at: string | null;
      pt_token: string | null;
      pt_updated_at: string | null;
    };

    const rows = result.rows as Row[];

    // Aggrega per (id, nickname, role): un admin può avere più righe se ha
    // token registrati su più device (join 1:N con push_tokens).
    const adminMap = new Map<string, {
      id: string;
      nickname: string;
      role: string;
      hasToken: boolean;
      tokenCount: number;
      lastRegisteredAt: string | null;
      error: string | null;
    }>();

    for (const r of rows) {
      let entry = adminMap.get(r.id);
      if (!entry) {
        entry = {
          id: r.id,
          nickname: r.nickname,
          role: r.role,
          hasToken: false,
          tokenCount: 0,
          lastRegisteredAt: null,
          error: r.push_token_error ?? null,
        };
        adminMap.set(r.id, entry);
      }
      // Token da push_tokens (preferito)
      if (r.pt_token) {
        entry.hasToken = true;
        entry.tokenCount += 1;
        if (r.pt_updated_at && (!entry.lastRegisteredAt || r.pt_updated_at > entry.lastRegisteredAt)) {
          entry.lastRegisteredAt = r.pt_updated_at;
        }
      }
      // Fallback: users.expo_push_token
      if (!entry.hasToken && r.expo_push_token) {
        entry.hasToken = true;
        entry.tokenCount = Math.max(entry.tokenCount, 1);
        if (r.push_token_error_at && (!entry.lastRegisteredAt || r.push_token_error_at > entry.lastRegisteredAt)) {
          entry.lastRegisteredAt = r.push_token_error_at;
        }
      }
    }

    const admins = [...adminMap.values()];
    const totalAdmins = admins.length;
    const withToken = admins.filter((a) => a.hasToken).length;
    const withoutToken = totalAdmins - withToken;

    return res.json({
      summary: { totalAdmins, withToken, withoutToken },
      admins,
    });
  } catch (err) {
    console.error("[admin] push-tokens/admins error:", err);
    return sendError(res, 500, "Errore copertura token admin");
  }
});

// GET /match-summary e GET /zero-match-snapshots → users.next-match-summary.ts

// GET /stats/push-tokens — Diagnostica aggregata: quanti/quali utenti reali
// non hanno un expoPushToken e perché (raggruppato per push_token_error e piattaforma).
router.get("/stats/push-tokens", async (_req: Request, res: Response) => {
  try {
    const summaryResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (
          WHERE is_fake = false AND role NOT IN ('admin', 'moderator')
        ) AS total_real,
        COUNT(*) FILTER (
          WHERE is_fake = false AND role NOT IN ('admin', 'moderator')
            AND expo_push_token IS NOT NULL AND expo_push_token <> ''
        ) AS with_token,
        COUNT(*) FILTER (
          WHERE is_fake = false AND role NOT IN ('admin', 'moderator')
            AND (expo_push_token IS NULL OR expo_push_token = '')
        ) AS without_token
      FROM users
    `);

    const causesResult = await db.execute(sql`
      SELECT
        COALESCE(push_token_error, 'NESSUNA_CAUSA') AS cause,
        COALESCE(push_token_error_platform, 'unknown') AS platform,
        COUNT(*) AS cnt,
        MAX(push_token_error_at) AS last_at
      FROM users
      WHERE is_fake = false
        AND role NOT IN ('admin', 'moderator')
        AND (expo_push_token IS NULL OR expo_push_token = '')
      GROUP BY
        COALESCE(push_token_error, 'NESSUNA_CAUSA'),
        COALESCE(push_token_error_platform, 'unknown')
      ORDER BY cause, cnt DESC
    `);

    type SummaryRow = { total_real: string; with_token: string; without_token: string };
    type CausePlatformRow = {
      cause: string;
      platform: string;
      cnt: string;
      last_at: string | null;
    };

    const s = summaryResult.rows[0] as SummaryRow | undefined;

    type CauseEntry = {
      cause: string;
      count: number;
      lastAt: string | null;
      byPlatform: { ios: number; android: number; web: number; unknown: number };
    };

    const causeMap = new Map<string, CauseEntry>();
    for (const row of causesResult.rows as CausePlatformRow[]) {
      const cnt = parseInt(row.cnt ?? "0", 10);
      let entry = causeMap.get(row.cause);
      if (!entry) {
        entry = {
          cause: row.cause,
          count: 0,
          lastAt: row.last_at,
          byPlatform: { ios: 0, android: 0, web: 0, unknown: 0 },
        };
        causeMap.set(row.cause, entry);
      }
      entry.count += cnt;
      if (row.last_at && (!entry.lastAt || row.last_at > entry.lastAt)) {
        entry.lastAt = row.last_at;
      }
      const p = row.platform.toLowerCase();
      if (p === "ios") entry.byPlatform.ios += cnt;
      else if (p === "android") entry.byPlatform.android += cnt;
      else if (p === "web") entry.byPlatform.web += cnt;
      else entry.byPlatform.unknown += cnt;
    }

    const causes = [...causeMap.values()].sort((a, b) => b.count - a.count);

    return res.json({
      summary: {
        totalReal: parseInt(s?.total_real ?? "0", 10),
        withToken: parseInt(s?.with_token ?? "0", 10),
        withoutToken: parseInt(s?.without_token ?? "0", 10),
      },
      causes,
    });
  } catch (err) {
    console.error("[admin] push-tokens stats error:", err);
    return sendError(res, 500, "Errore statistiche push token");
  }
});

// GET /stats/push-tokens/users — Lista paginata degli utenti senza push token per causa.
// Query params: cause (stringa, default 'NESSUNA_CAUSA'), page (default 1), limit (default 20, max 100).
router.get("/stats/push-tokens/users", async (req: Request, res: Response) => {
  try {
    const cause = (req.query.cause as string) || "NESSUNA_CAUSA";
    const rawPage = parseInt((req.query.page as string) || "1", 10);
    const rawLimit = parseInt((req.query.limit as string) || "20", 10);
    const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 20;
    const offset = (page - 1) * limit;

    const causeCondition =
      cause === "NESSUNA_CAUSA"
        ? sql`push_token_error IS NULL`
        : sql`push_token_error = ${cause}`;

    const countResult = await db.execute(sql`
      SELECT COUNT(*) AS total
      FROM users
      WHERE is_fake = false
        AND role NOT IN ('admin', 'moderator')
        AND (expo_push_token IS NULL OR expo_push_token = '')
        AND ${causeCondition}
    `);

    const usersResult = await db.execute(sql`
      SELECT
        id,
        nickname,
        push_token_error_platform AS platform,
        push_token_error_detail   AS detail,
        push_token_error_at       AS error_at
      FROM users
      WHERE is_fake = false
        AND role NOT IN ('admin', 'moderator')
        AND (expo_push_token IS NULL OR expo_push_token = '')
        AND ${causeCondition}
      ORDER BY push_token_error_at DESC NULLS LAST, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    type UserRow = {
      id: string;
      nickname: string;
      platform: string | null;
      detail: string | null;
      error_at: string | null;
    };

    const total = parseInt((countResult.rows[0] as { total: string }).total ?? "0", 10);

    return res.json({
      cause,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      users: (usersResult.rows as UserRow[]).map((r) => ({
        id: r.id,
        nickname: r.nickname,
        platform: r.platform ?? null,
        detail: r.detail ?? null,
        errorAt: r.error_at ?? null,
      })),
    });
  } catch (err) {
    console.error("[admin] push-tokens users error:", err);
    return sendError(res, 500, "Errore lista utenti push token");
  }
});

export default router;
