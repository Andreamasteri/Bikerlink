// LARGE-FILE-LOCKED — limite: 728 righe (attuali: 728)
// Aggiungi nuove funzionalità in: server/routes/admin/users-extra.ts
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, userLastfmSessions, userMusicTracks, proposals, conversationParticipants, messages, reports, moderatorLogs, adClicks, adCampaigns, userDevices } from "@shared/db";
import { userStatusSchema, userRoleSchema, userEmailAdminSchema, adminSetPasswordSchema, primalSchema } from "@shared/validators";
import { eq, and, ne, sql, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { isProtectedUser } from "../../constants";
import { closeSseClient } from "../../chat-sse";
import { revokeAllUserSessions } from "../../session-utils";
import { sendSuccess, sendError } from "../../lib/api-response";
import { onlineTracker } from "../../online-tracker";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const usersList = await storage.getAllUsers();
    const [sessionsRows, tracksRows] = await Promise.all([
      db.select({ userId: userLastfmSessions.userId }).from(userLastfmSessions),
      db.selectDistinct({ userId: userMusicTracks.userId }).from(userMusicTracks),
    ]);
    const lastfmUserIds = new Set([
      ...sessionsRows.map((r) => r.userId),
      ...tracksRows.map((r) => r.userId),
    ]);
    const safeUsers = usersList.map(({ password: _password, ...u }) => ({
      ...u,
      hasLastfmData: lastfmUserIds.has(u.id),
    }));
    return res.json(safeUsers);
  } catch (_error) {
    console.error("Admin get users error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/stats/summary", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        userType: users.userType,
        sex: users.sex,
        isFake: users.isFake,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(and(ne(users.role, "admin"), ne(users.role, "moderator")))
      .groupBy(users.userType, users.sex, users.isFake);

    const sum = (type?: string, sex?: string | null, fake?: boolean) =>
      rows
        .filter((r) =>
          (type === undefined || r.userType === type) &&
          (sex === undefined || r.sex === sex) &&
          (fake === undefined || r.isFake === fake)
        )
        .reduce((s, r) => s + r.count, 0);

    return res.json({
      totale: {
        real: sum(undefined, undefined, false),
        fake: sum(undefined, undefined, true),
      },
      biker: {
        total: { real: sum("biker", undefined, false), fake: sum("biker", undefined, true) },
        M: { real: sum("biker", "M", false), fake: sum("biker", "M", true) },
        F: { real: sum("biker", "F", false), fake: sum("biker", "F", true) },
      },
      zavorrina: {
        total: { real: sum("zavorrina", undefined, false), fake: sum("zavorrina", undefined, true) },
        M: { real: sum("zavorrina", "M", false), fake: sum("zavorrina", "M", true) },
        F: { real: sum("zavorrina", "F", false), fake: sum("zavorrina", "F", true) },
      },
      coppia: {
        total: { real: sum("coppia", undefined, false), fake: sum("coppia", undefined, true) },
      },
    });
  } catch (err) {
    console.error("[admin] users stats summary error:", err);
    return sendError(res, 500, "Errore interno");
  }
});

router.put("/:id/status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsedUs = userStatusSchema.safeParse(req.body);
    if (!parsedUs.success) return sendError(res, 400, parsedUs.error.issues[0].message);
    const { status } = parsedUs.data;
    const targetUser = await storage.getUser(id);
    if (!targetUser) return sendError(res, 404, "Utente non trovato");
    if (isProtectedUser(targetUser.nickname)) {
      return sendError(res, 403, "Utente di sistema non modificabile");
    }
    const user = await storage.updateUser(id, { status });
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `set_status_${status}`,
      targetType: "user",
      targetId: id,
      details: `Status cambiato a ${status}`,
    });
    if (status === "suspended" || status === "blocked") {
      closeSseClient(id);
    }
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (_error) {
    console.error("Admin update user status error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/role", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsedUr = userRoleSchema.safeParse(req.body);
    if (!parsedUr.success) return sendError(res, 400, parsedUr.error.issues[0].message);
    const { role } = parsedUr.data;
    const targetUser = await storage.getUser(id);
    if (!targetUser) return sendError(res, 404, "Utente non trovato");
    if (isProtectedUser(targetUser.nickname)) {
      return sendError(res, 403, "Utente di sistema non modificabile");
    }
    const user = await storage.updateUser(id, { role });
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: `set_role_${role}`,
      targetType: "user",
      targetId: id,
      details: `Ruolo cambiato a ${role}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (_error) {
    console.error("Admin update user role error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/email", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsedUe = userEmailAdminSchema.safeParse(req.body);
    if (!parsedUe.success) return sendError(res, 400, parsedUe.error.issues[0].message);
    const { email } = parsedUe.data;
    const targetUser = await storage.getUser(id);
    if (!targetUser) return sendError(res, 404, "Utente non trovato");
    if (isProtectedUser(targetUser.nickname)) {
      return sendError(res, 403, "Utente di sistema non modificabile");
    }
    const user = await storage.updateUser(id, { email });
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "update_email",
      targetType: "user",
      targetId: id,
      details: `Email aggiornata a ${email}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (_error) {
    console.error("Admin update user email error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/password", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsedAsp = adminSetPasswordSchema.safeParse(req.body);
    if (!parsedAsp.success) return sendError(res, 400, parsedAsp.error.issues[0].message);
    const { password } = parsedAsp.data;
    const targetUser = await storage.getUser(id);
    if (!targetUser) return sendError(res, 404, "Utente non trovato");
    if (isProtectedUser(targetUser.nickname)) {
      return sendError(res, 403, "Utente di sistema non modificabile");
    }
    let revoked = 0;
    try {
      revoked = await revokeAllUserSessions(id);
    } catch (e) {
      console.error(`[ADMIN PASSWORD RESET] Session revocation failed for user ${id}:`, e);
      return res.status(500).json({
        message: "Errore temporaneo nella revoca delle sessioni. Riprova tra qualche istante.",
      });
    }
    closeSseClient(id);
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await storage.updateUser(id, { password: hashedPassword });
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "reset_password",
      targetType: "user",
      targetId: id,
      details: `Password resettata (revocate ${revoked} sessioni)`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (_error) {
    console.error("Admin update user password error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.put("/:id/primal", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const parsedPr = primalSchema.safeParse(req.body);
    if (!parsedPr.success) return sendError(res, 400, parsedPr.error.issues[0].message);
    const { isPrimal } = parsedPr.data;
    const user = await storage.updateUser(id, { isPrimal });
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "set_primal",
      targetType: "user",
      targetId: id,
      details: `Status Primal: ${isPrimal}`,
    });
    const { password: _, ...safeUser } = user;
    return res.json(safeUser);
  } catch (_error) {
    console.error("Admin update user primal status error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const targetUser = await storage.getUser(id);
    if (!targetUser) return sendError(res, 404, "Utente non trovato");
    if (isProtectedUser(targetUser.nickname)) {
      return sendError(res, 403, "Utente di sistema non eliminabile");
    }
    await storage.deleteUser(id);
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "delete_user",
      targetType: "user",
      targetId: id,
      details: `Utente eliminato: ${targetUser.nickname}`,
    });
    return sendSuccess(res, undefined, "Utente eliminato");
  } catch (_error) {
    console.error("Admin delete user error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.delete("/:id/lastfm", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await db.delete(userLastfmSessions).where(eq(userLastfmSessions.userId, id));
    await db.delete(userMusicTracks).where(eq(userMusicTracks.userId, id));
    await storage.createModeratorLog({
      moderatorId: req.session.userId!,
      action: "clear_lastfm_data",
      targetType: "user",
      targetId: id,
      details: "Dati Last.fm (sessioni e brani) eliminati",
    });
    return sendSuccess(res, undefined, "Dati Last.fm eliminati");
  } catch (_error) {
    console.error("Admin clear lastfm data error:", _error);
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

router.get("/match-summary", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const countResult = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM users
      WHERE is_fake = false AND role NOT IN ('admin', 'moderator')
    `);
    type CountRow = { cnt?: string };
    const total = parseInt(((countResult.rows[0] as CountRow)?.cnt) ?? "0", 10);

    const usersResult = await db.execute(sql`
      SELECT
        u.id, u.nickname, u.avatar_url, u.user_type, u.role, u.status,
        COALESCE(bb.cnt, 0)::text as bb_count,
        COALESCE(bz.cnt, 0)::text as bz_count,
        null as bb_counts
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_biker_matches m
        WHERE m.biker1_id = u.id OR m.biker2_id = u.id
      ) bb ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
        WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
      ) bz ON true
      WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
      ORDER BY u.nickname
      LIMIT ${limit} OFFSET ${offset}
    `);

    type UserRow = { id: string; nickname: string; avatar_url: string | null; user_type: string | null; role: string; status: string; bb_count: string; bz_count: string; bb_counts: null };
    const mappedUsers = (usersResult.rows as UserRow[]).map((row) => ({
      id: row.id,
      nickname: row.nickname,
      avatarUrl: row.avatar_url,
      userType: row.user_type,
      role: row.role,
      status: row.status,
      bbCount: parseInt(row.bb_count || "0", 10),
      bzCount: parseInt(row.bz_count || "0", 10),
      bbCounts: row.bb_counts,
    }));

    return res.json({ users: mappedUsers, total, page });
  } catch (_error) {
    console.error("Admin match-summary error:", _error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id/stats", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const [user, profile] = await Promise.all([
      storage.getUser(id),
      storage.getUserProfile(id),
    ]);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const [
      proposalsCreatedRows,
      conversationsRows,
      messagesSentRows,
      reportsFiledRows,
      reportsReceivedRows,
      motorcycles,
      moderatorLogsRows,
      adClicksRows,
    ] = await Promise.all([
      db.select({ cnt: count() }).from(proposals).where(eq(proposals.userId, id)),
      db.select({ cnt: count() }).from(conversationParticipants).where(eq(conversationParticipants.userId, id)),
      db.select({ cnt: count() }).from(messages).where(eq(messages.senderId, id)),
      db.select({ cnt: count() }).from(reports).where(eq(reports.reporterId, id)),
      db.select({ cnt: count() }).from(reports).where(eq(reports.reportedUserId, id)),
      storage.getUserMotorcycles(id),
      db.select({
        action: moderatorLogs.action,
        createdAt: moderatorLogs.createdAt,
        moderatorId: moderatorLogs.moderatorId,
      }).from(moderatorLogs).where(eq(moderatorLogs.targetId, id)).orderBy(moderatorLogs.createdAt),
      db.select({
        id: adClicks.id,
        clickedAt: adClicks.createdAt,
        adTitle: adCampaigns.name,
      }).from(adClicks)
        .leftJoin(adCampaigns, eq(adClicks.campaignId, adCampaigns.id))
        .where(eq(adClicks.userId, id))
        .orderBy(adClicks.createdAt),
    ]);

    const devicesRows = await db.select({
      model: userDevices.model,
      platform: userDevices.platform,
      osVersion: userDevices.osVersion,
      firstSeenAt: userDevices.firstSeenAt,
      lastSeenAt: userDevices.lastSeenAt,
    }).from(userDevices)
      .where(eq(userDevices.userId, id))
      .orderBy(sql`${userDevices.lastSeenAt} DESC`);

    const moderatorNicknameMap: Record<string, string> = {};
    const moderatorIds = [...new Set(moderatorLogsRows.map((l) => l.moderatorId).filter(Boolean))] as string[];
    if (moderatorIds.length > 0) {
      const mods = await storage.getUsersByIds(moderatorIds);
      for (const mod of mods) {
        moderatorNicknameMap[mod.id] = mod.nickname;
      }
    }

    const { password: _pw, ...safeUser } = user;

    return res.json({
      user: {
        id: safeUser.id,
        nickname: safeUser.nickname,
        email: safeUser.email,
        userType: safeUser.userType,
        role: safeUser.role,
        status: safeUser.status,
        createdAt: safeUser.createdAt,
        lastLoginAt: safeUser.lastLoginAt ?? null,
        lastLogoutAt: safeUser.lastLogoutAt ?? null,
        lastAppCloseAt: safeUser.lastAppCloseAt ?? null,
        ghostMode: safeUser.ghostMode ?? false,
        isOnline: false,
        isFake: safeUser.isFake ?? false,
        isPrimal: safeUser.isPrimal ?? false,
        totalKm: profile?.totalKm ?? null,
        totalRides: profile?.totalRides ?? null,
        isAvailable: profile?.isAvailable ?? false,
        bio: profile?.bio ?? null,
        latitude: profile?.latitude ?? null,
        longitude: profile?.longitude ?? null,
      },
      stats: {
        proposalsCreated: proposalsCreatedRows[0]?.cnt ?? 0,
        conversationsCount: conversationsRows[0]?.cnt ?? 0,
        messagesSent: messagesSentRows[0]?.cnt ?? 0,
        reportsFiled: reportsFiledRows[0]?.cnt ?? 0,
        reportsReceived: reportsReceivedRows[0]?.cnt ?? 0,
      },
      adClicks: adClicksRows.map((c) => ({
        id: c.id,
        adTitle: c.adTitle ?? "Sconosciuto",
        clickedAt: c.clickedAt,
      })),
      motorcycles: motorcycles.map((m) => ({
        brand: m.brand,
        model: m.model,
        year: m.year,
        displacement: m.displacement ?? 0,
        motorcycleType: m.motorcycleType ?? "",
        ridingStyle: m.ridingStyle ?? "",
      })),
      moderatorLogs: moderatorLogsRows.map((l) => ({
        action: l.action,
        createdAt: l.createdAt,
        moderatorNickname: l.moderatorId ? (moderatorNicknameMap[l.moderatorId] ?? l.moderatorId) : "Sistema",
      })),
      devices: devicesRows.map((d) => ({
        model: d.model,
        platform: d.platform,
        osVersion: d.osVersion,
        firstSeenAt: d.firstSeenAt,
        lastSeenAt: d.lastSeenAt,
      })),
    });
  } catch (_error) {
    console.error("Admin get user stats error:", _error);
    return sendError(res, 500, "Errore lettura statistiche");
  }
});

router.get("/:id/geo-insights", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    return res.json({ userId: id, insights: [] });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura geo-insights");
  }
});

router.get("/:userId/sessions", async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const result = await db.execute(sql`
      SELECT
        sid,
        sess->>'sessionType' as session_type,
        expire
      FROM session
      WHERE sess->>'userId' = ${userId}
      ORDER BY expire DESC
    `);

    type SessionRow = { sid: string; session_type: string | null; expire: string | null };
    const rows = result.rows as SessionRow[];

    const sessionItems = rows.map((r) => ({
      sid: r.sid,
      displaySid: `…${r.sid.slice(-8)}`,
      sessionType: r.session_type ?? "web",
      expiry: r.expire ?? null,
    }));

    const webCount = sessionItems.filter((s) => s.sessionType === "web").length;
    const mobileCount = sessionItems.filter((s) => s.sessionType !== "web").length;

    return res.json({
      sessions: sessionItems,
      webCount,
      mobileCount,
      total: sessionItems.length,
    });
  } catch (_error) {
    return sendError(res, 500, "Errore lettura sessioni");
  }
});

router.delete("/:userId/sessions/:sid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid;
    await db.execute(sql`DELETE FROM session WHERE sid = ${sid}`);
    return sendSuccess(res);
  } catch (_error) {
    return sendError(res, 500, "Errore eliminazione sessione");
  }
});

export default router;
