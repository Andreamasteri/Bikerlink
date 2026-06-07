import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { requireAuth } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";
import {
  proposals,
  proposalParticipants,
  proposalMatches,
  conversationParticipants,
  messages,
  userPhotos,
  userMotorcycles,
} from "@shared/db";
import { eq, or, inArray } from "drizzle-orm";

const router = Router();

router.get("/export", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }

    const { password: _pw, ...safeUser } = user;

    const [
      profile,
      photos,
      motorcycles,
      trackedRoutes,
      userCustomRoutes,
      userProposals,
      userProposalParticipations,
      userProposalMatches,
      conversationIds,
    ] = await Promise.all([
      storage.getUserProfile(userId),
      db.select().from(userPhotos).where(eq(userPhotos.userId, userId)),
      db.select().from(userMotorcycles).where(eq(userMotorcycles.userId, userId)),
      storage.getRoutes(userId),
      storage.getCustomRoutes(userId),
      db.select().from(proposals).where(eq(proposals.userId, userId)),
      db.select().from(proposalParticipants).where(eq(proposalParticipants.userId, userId)),
      db.select().from(proposalMatches).where(
        or(eq(proposalMatches.userId1, userId), eq(proposalMatches.userId2, userId))
      ),
      db.select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.userId, userId)),
    ]);

    const conversationIdList = conversationIds.map((r) => r.conversationId);
    let userMessages: typeof messages.$inferSelect[] = [];
    if (conversationIdList.length > 0) {
      userMessages = await db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, conversationIdList));
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      gdprArticle: "Art. 20 GDPR — Diritto alla portabilità dei dati",
      account: safeUser,
      profile,
      photos,
      motorcycles,
      trackedRoutes,
      customRoutes: userCustomRoutes,
      proposals: userProposals,
      proposalParticipations: userProposalParticipations,
      proposalMatches: userProposalMatches,
      conversationIds: conversationIdList,
      messages: userMessages,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bikerlink-gdpr-export-${userId}.json"`
    );
    return res.json(exportData);
  } catch (error) {
    console.error("GDPR export error:", error);
    return sendError(res, 500, "Errore durante l'esportazione dei dati");
  }
});

router.delete("/consent", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    await storage.requestUserDeletion(userId);

    req.session.destroy(() => {});

    return sendSuccess(
      res,
      { deletionScheduledIn: "30 giorni" },
      "Consenso revocato. Il tuo account e tutti i tuoi dati saranno eliminati entro 30 giorni. Hai ricevuto una conferma."
    );
  } catch (error) {
    console.error("GDPR consent revoke error:", error);
    return sendError(res, 500, "Errore durante la revoca del consenso");
  }
});

router.post("/consent", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const user = await storage.getUser(userId);
    if (!user) {
      return sendError(res, 404, "Utente non trovato");
    }

    if (!user.deletionRequestedAt) {
      return sendError(res, 400, "Nessuna richiesta di cancellazione attiva da annullare");
    }

    await storage.cancelUserDeletion(userId);

    return sendSuccess(
      res,
      undefined,
      "Consenso rinnovato. La richiesta di cancellazione è stata annullata."
    );
  } catch (error) {
    console.error("GDPR consent renew error:", error);
    return sendError(res, 500, "Errore durante il rinnovo del consenso");
  }
});

export default router;
