// LARGE-FILE-LOCKED — limite: 728 righe (attuali: 728)
// Aggiungi nuove funzionalità in: server/routes/admin/users-extra.ts
// Motivo: file delicato di dimensione media. Splittare ora introduce rischio.
//         Vedi Task #2584 (regola 600 righe) e Task "Lock dimensione file priorità media".

import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users, userLastfmSessions, userMusicTracks, otaBootEvents, otaReleases } from "@shared/db";
import { userStatusSchema, userRoleSchema, userEmailAdminSchema, adminSetPasswordSchema, primalSchema, isReservedEmailLocalPart } from "@shared/validators";
import { eq, and, ne, sql, inArray, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { isProtectedUser } from "../../constants";
import { closeSseClient } from "../../chat-sse";
import { revokeAllUserSessions } from "../../session-utils";
import { sendSuccess, sendError } from "../../lib/api-response";
import { invalidateAdminAuthCache } from "../../lib/admin-auth-cache";

const router = Router();

/**
 * Estrae il contatore sequenziale OTA dal terzo segmento di un versionName.
 * Es. "72D.10.125" → 125, "70.10.123" → 123. Restituisce null se assente/non valido.
 */
function otaNumberFromVersion(v?: string | null): number | null {
  if (!v || v === "unknown") return null;
  const parts = v.split(".");
  if (parts.length < 3) return null;
  const seg = parts[2];
  // Solo terzo segmento puramente numerico (es. "125"); evita "125abc" → 125.
  if (!/^\d+$/.test(seg)) return null;
  return parseInt(seg, 10);
}

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

    const userIds = usersList.map((u) => u.id);
    const otaByUserId: Record<string, string> = {};
    if (userIds.length > 0) {
      const latestBootRows = await db
        .selectDistinctOn([otaBootEvents.userId], {
          userId: otaBootEvents.userId,
          otaVersion: otaReleases.otaVersion,
        })
        .from(otaBootEvents)
        .innerJoin(otaReleases, eq(otaBootEvents.releaseId, otaReleases.id))
        .where(
          and(
            inArray(otaBootEvents.userId, userIds),
            eq(otaBootEvents.eventType, "boot_success"),
          ),
        )
        .orderBy(otaBootEvents.userId, desc(otaBootEvents.createdAt), desc(otaBootEvents.id));

      for (const row of latestBootRows) {
        if (row.userId && row.otaVersion) {
          otaByUserId[row.userId] = row.otaVersion;
        }
      }
    }

    const safeUsers = usersList.map(({ password: _password, ...u }) => {
      const bootOta = otaByUserId[u.id] ?? null;
      // OTA "corrente" del dispositivo = terzo segmento del versionName realmente
      // riportato dall'heartbeat (lo stesso contatore sequenziale mostrato nel Profilo,
      // es. "72D.10.125" → #125). Non dipendiamo più esclusivamente dal join su
      // boot_success, che resta solo come fallback per dispositivi legacy.
      const lastOtaNumber = otaNumberFromVersion(u.lastAppVersion) ?? otaNumberFromVersion(bootOta);
      return {
        ...u,
        hasLastfmData: lastfmUserIds.has(u.id),
        lastOtaVersion: bootOta,
        lastOtaNumber,
      };
    });
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

// NOTE (Task #129 — audit): there is intentionally NO PUT /:id/nickname endpoint.
// Renaming an existing user's nickname from the admin panel is not supported.
// The only nickname-write paths that exist are:
//   • POST /api/auth/register (public signup)
//   • POST /api/admin/users  (admin-create, users.next.ts)
//   • PUT  /api/users/me     (self-service rename, routes/users/profile.ts)
// All three call isReservedNickname() from shared/validators/auth.ts.
// If a nickname-rename admin endpoint is ever added here, it MUST call
// isReservedNickname() to prevent agent-lookalike names (Ares, Nadir, Bowie,
// Quebracho, Horus) from being assigned by an admin to an existing account.

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
      // Task #397 — evict immediately so the demoted admin can't ride the
      // 10-second cache window after suspension/block.
      invalidateAdminAuthCache(id);
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
    // Task #397 — if the target user was an admin and is now demoted, evict
    // their cache entry immediately so they can't keep calling admin endpoints
    // for up to 10 more seconds.
    if (role !== "admin") {
      invalidateAdminAuthCache(id);
    }
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
    if (isReservedEmailLocalPart(email)) {
      return sendError(res, 400, "Email non consentita: imita un agente AI interno");
    }
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

export default router;
