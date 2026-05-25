import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";
import {
  DEFAULT_MAPS_CONFIG,
  RENDERER_OPTIONS,
  TILE_OPTIONS,
  ROUTING_OPTIONS,
  ROUTING_PROFILE_OPTIONS,
  isValidRollout,
  isValidRenderer,
  isValidTile,
  isValidRouting,
  isValidProfile,
  type MapsConfig,
} from "@shared/maps-config";

const router = Router();

const KEYS = {
  rollout: "maps_rollout",
  renderer: "maps_renderer",
  tile: "maps_tile",
  routing: "routing_engine",
  profile: "routing_profile",
  renderer_notes: "maps_renderer_notes",
  routing_notes: "maps_routing_notes",
} as const;

async function readSetting(key: string, fallback: string): Promise<string> {
  try {
    const s = await storage.getAppSetting(key);
    const v = s?.value?.trim();
    return v && v.length > 0 ? v : fallback;
  } catch {
    return fallback;
  }
}

async function readMapsConfig(): Promise<MapsConfig> {
  const [rollout, renderer, tile, routing, profile, rNotes, routNotes] = await Promise.all([
    readSetting(KEYS.rollout, DEFAULT_MAPS_CONFIG.rollout),
    readSetting(KEYS.renderer, DEFAULT_MAPS_CONFIG.renderer),
    readSetting(KEYS.tile, DEFAULT_MAPS_CONFIG.tile),
    readSetting(KEYS.routing, DEFAULT_MAPS_CONFIG.routing),
    readSetting(KEYS.profile, DEFAULT_MAPS_CONFIG.profile),
    readSetting(KEYS.renderer_notes, ""),
    readSetting(KEYS.routing_notes, ""),
  ]);
  return {
    rollout: isValidRollout(rollout) ? rollout : DEFAULT_MAPS_CONFIG.rollout,
    renderer: isValidRenderer(renderer) ? renderer : DEFAULT_MAPS_CONFIG.renderer,
    tile: isValidTile(tile) ? tile : DEFAULT_MAPS_CONFIG.tile,
    routing: isValidRouting(routing) ? routing : DEFAULT_MAPS_CONFIG.routing,
    profile: isValidProfile(profile) ? profile : DEFAULT_MAPS_CONFIG.profile,
    renderer_notes: rNotes,
    routing_notes: routNotes,
  };
}

router.get("/config", async (_req: Request, res: Response) => {
  try {
    const cfg = await readMapsConfig();
    return res.json({
      ...cfg,
      available_renderers: RENDERER_OPTIONS,
      available_tiles: TILE_OPTIONS,
      available_routings: ROUTING_OPTIONS,
      available_profiles: ROUTING_PROFILE_OPTIONS,
    });
  } catch (err) {
    console.error("[admin/maps/config] error:", err);
    return sendError(res, 500, "Errore lettura configurazione mappe");
  }
});

router.put("/rollout", async (req: Request, res: Response) => {
  try {
    const { rollout } = req.body ?? {};
    if (!isValidRollout(rollout)) return sendError(res, 400, "Valore rollout non valido");
    await storage.upsertAppSetting(KEYS.rollout, rollout);
    return res.json({ rollout });
  } catch (err) {
    console.error("[admin/maps/rollout] error:", err);
    return sendError(res, 500, "Errore salvataggio rollout");
  }
});

router.put("/renderer", async (req: Request, res: Response) => {
  try {
    const { renderer, tile } = req.body ?? {};
    if (!isValidRenderer(renderer)) return sendError(res, 400, "Renderer non valido");
    if (!isValidTile(tile)) return sendError(res, 400, "Tile provider non valido");
    await Promise.all([
      storage.upsertAppSetting(KEYS.renderer, renderer),
      storage.upsertAppSetting(KEYS.tile, tile),
    ]);
    return res.json({ renderer, tile });
  } catch (err) {
    console.error("[admin/maps/renderer] error:", err);
    return sendError(res, 500, "Errore salvataggio renderer");
  }
});

router.put("/routing", async (req: Request, res: Response) => {
  try {
    const { engine, profile } = req.body ?? {};
    if (!isValidRouting(engine)) return sendError(res, 400, "Engine routing non valido");
    if (!isValidProfile(profile)) return sendError(res, 400, "Profilo routing non valido");
    await Promise.all([
      storage.upsertAppSetting(KEYS.routing, engine),
      storage.upsertAppSetting(KEYS.profile, profile),
    ]);
    return res.json({ engine, profile });
  } catch (err) {
    console.error("[admin/maps/routing] error:", err);
    return sendError(res, 500, "Errore salvataggio routing");
  }
});

router.put("/notes", async (req: Request, res: Response) => {
  try {
    const { renderer_notes, routing_notes } = req.body ?? {};
    const ops: Promise<unknown>[] = [];
    if (typeof renderer_notes === "string") {
      if (renderer_notes.length > 10000) return sendError(res, 400, "Note renderer troppo lunghe (max 10000)");
      ops.push(storage.upsertAppSetting(KEYS.renderer_notes, renderer_notes));
    }
    if (typeof routing_notes === "string") {
      if (routing_notes.length > 10000) return sendError(res, 400, "Note routing troppo lunghe (max 10000)");
      ops.push(storage.upsertAppSetting(KEYS.routing_notes, routing_notes));
    }
    if (ops.length === 0) return sendError(res, 400, "Nessuna nota fornita");
    await Promise.all(ops);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/maps/notes] error:", err);
    return sendError(res, 500, "Errore salvataggio note");
  }
});

router.put("/users/:id/map-tester", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    const { enabled } = req.body ?? {};
    if (!id) return sendError(res, 400, "ID utente mancante");
    if (typeof enabled !== "boolean") return sendError(res, 400, "Campo 'enabled' booleano richiesto");
    const [updated] = await db.update(users).set({ mapTester: enabled, updatedAt: new Date() }).where(eq(users.id, id)).returning({ id: users.id, mapTester: users.mapTester });
    if (!updated) return sendError(res, 404, "Utente non trovato");
    return res.json({ id: updated.id, mapTester: updated.mapTester });
  } catch (err) {
    console.error("[admin/maps/users/:id/map-tester] error:", err);
    return sendError(res, 500, "Errore aggiornamento flag map tester");
  }
});

export default router;
