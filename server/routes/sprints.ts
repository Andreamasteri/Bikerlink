import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { sprintResults } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response): string | null {
  if (!req.session.userId) {
    res.status(401).json({ message: "Non autenticato" });
    return null;
  }
  return req.session.userId;
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const { sprint0to100Ms, maxAccelerationG, maxDecelerationG, maxTiltDeg, routeId } = req.body;

    if (!sprint0to100Ms || typeof sprint0to100Ms !== "number" || sprint0to100Ms <= 0) {
      return res.status(400).json({ message: "Tempo sprint non valido" });
    }

    const [result] = await db
      .insert(sprintResults)
      .values({
        userId,
        routeId: routeId ?? null,
        sprint0to100Ms: Math.round(sprint0to100Ms),
        maxAccelerationG: maxAccelerationG ?? 0,
        maxDecelerationG: maxDecelerationG ?? 0,
        maxTiltDeg: maxTiltDeg ?? 0,
      })
      .returning();

    return res.status(201).json(result);
  } catch (error) {
    console.error("Save sprint error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = requireAuth(req, res);
    if (!userId) return;

    const sprints = await db
      .select()
      .from(sprintResults)
      .where(eq(sprintResults.userId, userId))
      .orderBy(asc(sprintResults.sprint0to100Ms))
      .limit(100);

    return res.json(sprints);
  } catch (error) {
    console.error("Get sprints error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

export default router;
