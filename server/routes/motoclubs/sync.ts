import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { storage } from "../../storage";
import { motoClubMembers } from "@shared/db";
import { eq, and, count } from "drizzle-orm";
import { createRegionalClubInvite, createClubInvitesForMoto } from "./utils";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.post("/sync-garage", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const user = await storage.getUser(userId);
    if (!user) return sendError(res, 404, "Utente non trovato");

    const before = await db.select({ c: count() })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const countBefore = Number(before[0]?.c ?? 0);

    if (user.userType === "zavorrina") {
      // Zavorrina: usa le moto della wishlist
      const wishlist = await storage.getWishlist(userId);
      if (wishlist) {
        const wishlistMotos = await storage.getWishlistMotos(wishlist.id);
        for (const moto of wishlistMotos) {
          if (moto.brand) {
            await createClubInvitesForMoto(userId, moto.brand, moto.model ?? "");
          }
        }
      }
    } else {
      // Biker / coppia: usa le moto del garage
      const motos = await storage.getUserMotorcycles(userId);
      for (const moto of motos) {
        await createClubInvitesForMoto(userId, moto.brand, moto.model ?? "");
      }
    }

    if (user.region) {
      await createRegionalClubInvite(userId, user.region);
    }

    const after = await db.select({ c: count() })
      .from(motoClubMembers)
      .where(and(eq(motoClubMembers.userId, userId), eq(motoClubMembers.status, "active")));
    const countAfter = Number(after[0]?.c ?? 0);

    const joined = countAfter - countBefore;
    return res.json({
      joined,
      message: joined > 0 ? `Iscritto a ${joined} club!` : "Nessun nuovo club trovato",
    });
  } catch (e) {
    console.error("[POST /sync-garage]", e);
    return sendError(res, 500, "Errore interno");
  }
});

export default router;
