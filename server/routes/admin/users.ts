import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, userLastfmSessions, userMusicTracks } from "@shared/db";
import { userStatusSchema, userRoleSchema, userEmailAdminSchema, adminSetPasswordSchema, primalSchema } from "@shared/validators";
import { eq, and, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { isProtectedUser } from "../../constants";
import { closeSseClient } from "../../chat-sse";
import { revokeAllUserSessions } from "../../session-utils";
import { sendSuccess, sendError } from "../../lib/api-response";

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
    const safeUsers = usersList.map(({ password, ...u }) => ({
      ...u,
      hasLastfmData: lastfmUserIds.has(u.id),
    }));
    return res.json(safeUsers);
  } catch (error) {
    console.error("Admin get users error:", error);
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
  } catch (error) {
    console.error("Admin update user status error:", error);
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
  } catch (error) {
    console.error("Admin update user role error:", error);
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
  } catch (error) {
    console.error("Admin update user email error:", error);
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
  } catch (error) {
    console.error("Admin update user password error:", error);
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
  } catch (error) {
    console.error("Admin update user primal status error:", error);
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
  } catch (error) {
    console.error("Admin delete user error:", error);
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
  } catch (error) {
    console.error("Admin clear lastfm data error:", error);
    return sendError(res, 500, "Errore interno del server");
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
    const total = parseInt((countResult.rows[0] as any)?.cnt ?? "0", 10);

    const usersResult = await db.execute(sql`
      SELECT
        u.id, u.nickname, u.avatar_url, u.user_type, u.role, u.status,
        COALESCE(bb.cnt, 0)::text as bb_count,
        COALESCE(bz.cnt, 0)::text as bz_count,
        null as bb_counts
      FROM users u
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_biker_matches m
        WHERE m.biker_id_1 = u.id OR m.biker_id_2 = u.id
      ) bb ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as cnt FROM biker_zavorrina_matches m
        WHERE m.biker_id = u.id OR m.zavorrina_id = u.id
      ) bz ON true
      WHERE u.is_fake = false AND u.role NOT IN ('admin', 'moderator')
      ORDER BY u.nickname
      LIMIT ${limit} OFFSET ${offset}
    `);

    const mappedUsers = (usersResult.rows as any[]).map((row) => ({
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
  } catch (error) {
    console.error("Admin match-summary error:", error);
    return sendError(res, 500, "Errore interno del server");
  }
});

router.get("/:id/stats", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    return res.json({ userId: id, stats: {} });
  } catch (error) {
    return sendError(res, 500, "Errore lettura statistiche");
  }
});

router.get("/:id/geo-insights", async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    return res.json({ userId: id, insights: [] });
  } catch (error) {
    return sendError(res, 500, "Errore lettura geo-insights");
  }
});

router.get("/:userId/sessions", async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    const sessions = await db.execute(sql`SELECT sid, sess->'userId' as user_id, expire FROM session WHERE sess->>'userId' = ${userId}`);
    return res.json(sessions.rows);
  } catch (error) {
    return sendError(res, 500, "Errore lettura sessioni");
  }
});

router.delete("/:userId/sessions/:sid", async (req: Request, res: Response) => {
  try {
    const sid = req.params.sid;
    await db.execute(sql`DELETE FROM session WHERE sid = ${sid}`);
    return sendSuccess(res);
  } catch (error) {
    return sendError(res, 500, "Errore eliminazione sessione");
  }
});

export default router;
