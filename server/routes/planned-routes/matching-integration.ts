/**
 * Task #2528 — Endpoint bidirezionali tra planned_routes e matching.
 *
 *  GET  /:id/compatible-bikers  → top biker suggeriti dal matcher
 *                                  `planned_route_invite` (auth, owner-only).
 *  POST /:id/invite              → crea/aggiorna un invito esplicito verso
 *                                  un biker (status="invited").
 *
 * (L'endpoint legacy `GET /compatible-bikers/:id` in sharing.ts resta per
 *  compatibilità — quello effettua una query SQL one-shot su prossimità.)
 */

import { Router, type Request, type Response } from "express";
import { sendError } from "../../lib/api-response";
import { db } from "../../db";
import { storage } from "../../storage";
import { plannedRouteInvites, users } from "@shared/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth } from "./utils";

const router = Router();

router.get("/:id/compatible-bikers", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;
  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const rows = await db
      .select({
        id: plannedRouteInvites.id,
        suggestedUserId: plannedRouteInvites.suggestedUserId,
        score: plannedRouteInvites.score,
        reasons: plannedRouteInvites.reasons,
        priority: plannedRouteInvites.priority,
        status: plannedRouteInvites.status,
        createdAt: plannedRouteInvites.createdAt,
        nickname: users.nickname,
        avatarUrl: users.avatarUrl,
      })
      .from(plannedRouteInvites)
      .innerJoin(users, eq(users.id, plannedRouteInvites.suggestedUserId))
      .where(eq(plannedRouteInvites.routeId, id))
      .orderBy(desc(plannedRouteInvites.score))
      .limit(10);

    return res.json({
      routeId: id,
      count: rows.length,
      bikers: rows.map((r) => ({
        inviteId: r.id,
        userId: r.suggestedUserId,
        nickname: r.nickname,
        avatarUrl: r.avatarUrl,
        score: r.score,
        priority: r.priority,
        status: r.status,
        reasons: r.reasons,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("[planned-routes/compatible-bikers] error:", err);
    return sendError(res, 500, "Errore caricamento suggerimenti");
  }
});

router.post("/:id/invite", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const id = req.params["id"] as string;
  const targetUserId = String((req.body as { userId?: unknown })?.userId ?? "").trim();
  if (!targetUserId) return sendError(res, 400, "userId obbligatorio");

  try {
    const route = await storage.getPlannedRoute(id);
    if (!route) return sendError(res, 404, "Percorso non trovato");
    if (route.userId !== userId) return sendError(res, 403, "Non autorizzato");

    const [existing] = await db
      .select()
      .from(plannedRouteInvites)
      .where(and(eq(plannedRouteInvites.routeId, id), eq(plannedRouteInvites.suggestedUserId, targetUserId)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(plannedRouteInvites)
        .set({ status: "invited", notifiedAt: new Date() })
        .where(eq(plannedRouteInvites.id, existing.id))
        .returning();
      return res.json({ invite: updated, alreadyExisted: true });
    }

    const [created] = await db
      .insert(plannedRouteInvites)
      .values({
        routeId: id,
        ownerId: userId,
        suggestedUserId: targetUserId,
        score: 0,
        reasons: { source: "manual" },
        priority: "normal",
        status: "invited",
        notifiedAt: new Date(),
      })
      .returning();

    return res.status(201).json({ invite: created, alreadyExisted: false });
  } catch (err) {
    console.error("[planned-routes/invite] error:", err);
    return sendError(res, 500, "Errore invio invito");
  }
});

export default router;
