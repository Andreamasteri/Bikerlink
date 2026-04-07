import { Router, type Request, type Response } from "express";
import { db } from "../db";
import {
  bikerZavarrinaMatches,
  bikerBikerMatches,
  proposalMatches,
  users,
} from "@shared/schema";
import { and, eq, or } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const friendMap = new Map<string, { id: string; nickname: string; userType: string; gender: string | null }>();

    const bzMatches = await db
      .select()
      .from(bikerZavarrinaMatches)
      .where(
        and(
          eq(bikerZavarrinaMatches.status, "accepted"),
          or(
            eq(bikerZavarrinaMatches.bikerId, userId),
            eq(bikerZavarrinaMatches.zavarrinaId, userId)
          )
        )
      );

    for (const m of bzMatches) {
      const otherId = m.bikerId === userId ? m.zavarrinaId : m.bikerId;
      if (!friendMap.has(otherId)) {
        const other = await db
          .select({ id: users.id, nickname: users.nickname, userType: users.userType, sex: users.sex })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (other[0]) {
          friendMap.set(otherId, {
            id: other[0].id,
            nickname: other[0].nickname,
            userType: other[0].userType,
            gender: other[0].sex ?? null,
          });
        }
      }
    }

    const bbMatches = await db
      .select()
      .from(bikerBikerMatches)
      .where(
        and(
          eq(bikerBikerMatches.status, "accepted"),
          or(
            eq(bikerBikerMatches.biker1Id, userId),
            eq(bikerBikerMatches.biker2Id, userId)
          )
        )
      );

    for (const m of bbMatches) {
      const otherId = m.biker1Id === userId ? m.biker2Id : m.biker1Id;
      if (!friendMap.has(otherId)) {
        const other = await db
          .select({ id: users.id, nickname: users.nickname, userType: users.userType, sex: users.sex })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (other[0]) {
          friendMap.set(otherId, {
            id: other[0].id,
            nickname: other[0].nickname,
            userType: other[0].userType,
            gender: other[0].sex ?? null,
          });
        }
      }
    }

    const pMatches = await db
      .select()
      .from(proposalMatches)
      .where(
        and(
          eq(proposalMatches.status, "accepted"),
          or(
            eq(proposalMatches.userId1, userId),
            eq(proposalMatches.userId2, userId)
          )
        )
      );

    for (const m of pMatches) {
      const otherId = m.userId1 === userId ? m.userId2 : m.userId1;
      if (!friendMap.has(otherId)) {
        const other = await db
          .select({ id: users.id, nickname: users.nickname, userType: users.userType, sex: users.sex })
          .from(users)
          .where(eq(users.id, otherId))
          .limit(1);
        if (other[0]) {
          friendMap.set(otherId, {
            id: other[0].id,
            nickname: other[0].nickname,
            userType: other[0].userType,
            gender: other[0].sex ?? null,
          });
        }
      }
    }

    return res.json([...friendMap.values()]);
  } catch (error) {
    console.error("Get friends error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
