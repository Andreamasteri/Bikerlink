import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { routes } from "@shared/schema";
import { eq, and, asc, isNotNull } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const sprints = await db
      .select({
        id: routes.id,
        title: routes.title,
        sprint0to100Ms: routes.sprint0to100Ms,
        maxAccelerationG: routes.maxAccelerationG,
        maxDecelerationG: routes.maxDecelerationG,
        maxTiltDeg: routes.maxTiltDeg,
        maxSpeedKmh: routes.maxSpeedKmh,
        startedAt: routes.startedAt,
        stoppedAt: routes.stoppedAt,
      })
      .from(routes)
      .where(
        and(
          eq(routes.userId, userId),
          eq(routes.isSprint, true),
          eq(routes.status, "completed"),
          isNotNull(routes.sprint0to100Ms)
        )
      )
      .orderBy(asc(routes.sprint0to100Ms))
      .limit(100);

    return res.json(sprints);
  } catch (error) {
    console.error("Get sprints error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
