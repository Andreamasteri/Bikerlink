import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { matchPreferences } from "@shared/db";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { requireAuth } from "../lib/auth-middleware";
import { sendSuccess, sendError } from "../lib/api-response";

const router = Router();

export const DEFAULT_PREFS = {
  bikerBikerBrand: true,
  bikerZavorrinaBrand: true,
  bikerClubBrand: true,
  zavorrinaClubBrand: true,
  bikerBikerTypeStyle: true,
  bikerZavorrinaTypeStyle: true,
  bikerBikerDistance: true,
  bikerZavorrinaDistance: true,
  bikerBikerMusic: true,
  bikerZavorrinaMusic: true,
  bikerBikerLeanAngle: true,
  bikerBikerRouteTypeZone: true,
  bikerZavorrinaRouteTypeZone: true,
  bikerBikerAvgSpeed: true,
  bikerBikerAvgDuration: true,
  bikerBikerDayTime: true,
  bikerBikerEvents: true,
  routeAffinity: true,
  musicAffinity: true,
  bioAffinity: true,
  telemetryAffinity: true,
  directMatch: true,
  topMatchesOnly: false,
  weeklyRecap: true,
};

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const [row] = await db
      .select()
      .from(matchPreferences)
      .where(eq(matchPreferences.userId, userId))
      .limit(1);

    if (!row) {
      return res.json({ preferences: DEFAULT_PREFS });
    }

    return res.json({
      preferences: {
        bikerBikerBrand: row.bikerBikerBrand,
        bikerZavorrinaBrand: row.bikerZavorrinaBrand,
        bikerClubBrand: row.bikerClubBrand,
        zavorrinaClubBrand: row.zavorrinaClubBrand,
        bikerBikerTypeStyle: row.bikerBikerTypeStyle,
        bikerZavorrinaTypeStyle: row.bikerZavorrinaTypeStyle,
        bikerBikerDistance: row.bikerBikerDistance,
        bikerZavorrinaDistance: row.bikerZavorrinaDistance,
        bikerBikerMusic: row.bikerBikerMusic,
        bikerZavorrinaMusic: row.bikerZavorrinaMusic,
        bikerBikerLeanAngle: row.bikerBikerLeanAngle,
        bikerBikerRouteTypeZone: row.bikerBikerRouteTypeZone,
        bikerZavorrinaRouteTypeZone: row.bikerZavorrinaRouteTypeZone,
        bikerBikerAvgSpeed: row.bikerBikerAvgSpeed,
        bikerBikerAvgDuration: row.bikerBikerAvgDuration,
        bikerBikerDayTime: row.bikerBikerDayTime,
        bikerBikerEvents: row.bikerBikerEvents,
        routeAffinity: row.routeAffinity,
        musicAffinity: row.musicAffinity ?? true,
        bioAffinity: row.bioAffinity ?? true,
        telemetryAffinity: row.telemetryAffinity ?? true,
        directMatch: row.directMatch,
        topMatchesOnly: row.topMatchesOnly ?? false,
        weeklyRecap: row.weeklyRecap ?? true,
      },
    });
  } catch (error) {
    console.error("[MatchPreferences] GET error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

router.put("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = req.body as Partial<typeof DEFAULT_PREFS>;

    const updates: Record<string, boolean> = Object.fromEntries(
      (Object.keys(DEFAULT_PREFS) as Array<keyof typeof DEFAULT_PREFS>)
        .filter((key) => typeof body[key] === "boolean")
        .map((key) => [key, body[key] as boolean])
    );

    const [existing] = await db
      .select({ id: matchPreferences.id })
      .from(matchPreferences)
      .where(eq(matchPreferences.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(matchPreferences)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(matchPreferences.userId, userId));
    } else {
      await db.insert(matchPreferences).values({
        userId,
        ...DEFAULT_PREFS,
        ...updates,
      });
    }

    return sendSuccess(res);
  } catch (error) {
    console.error("[MatchPreferences] PUT error:", error);
    return sendError(res, 500, "Errore interno");
  }
});

router.get("/gate", requireAuth, async (_req: Request, res: Response) => {
  try {
    const setting = await storage.getAppSetting("match_preferences_visible");
    const visible = setting?.value === "true";
    return res.json({ visible });
  } catch (error) {
    console.error("[MatchPreferences] gate error:", error);
    return res.status(500).json({ visible: false });
  }
});

export default router;
