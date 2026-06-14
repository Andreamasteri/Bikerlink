import WebSocket from "ws";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { users } from "@shared/db";
import { eq } from "drizzle-orm";
import { sendError } from "../../lib/api-response";

const router = Router();

interface VesselData {
  mmsi: number;
  name: string;
  lat: number;
  lng: number;
  cog: number;
  sog: number;
  trueHeading: number;
  shipType: number;
  updatedAt: number;
}

const vesselCache = new Map<number, VesselData>();
const VESSEL_TTL_MS = 5 * 60 * 1000;
const _maxVesselsParsed = parseInt(process.env.MAX_VESSELS ?? "2000", 10);
const MAX_VESSELS = Number.isFinite(_maxVesselsParsed) && _maxVesselsParsed > 0 ? _maxVesselsParsed : 2000;

function parseBbox(raw: string): [[number, number], [number, number]] | null {
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [minLat, minLon, maxLat, maxLon] = parts;
  return [[minLat, minLon], [maxLat, maxLon]];
}

function getSubscriptionBbox(): [[number, number], [number, number]] {
  const raw = process.env.AISSTREAM_BBOX;
  if (raw) {
    const bbox = parseBbox(raw);
    if (bbox) {
      console.log(`[ais-relay] using bbox from env: ${raw}`);
      return bbox;
    }
    console.warn("[ais-relay] AISSTREAM_BBOX malformed, falling back to global");
  }
  return [[-90, -180], [90, 180]];
}

function evictOldestVessels() {
  if (vesselCache.size <= MAX_VESSELS) return;
  const sorted = Array.from(vesselCache.entries()).sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  const toRemove = vesselCache.size - MAX_VESSELS;
  for (let i = 0; i < toRemove; i++) {
    vesselCache.delete(sorted[i][0]);
  }
}

let wsClient: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connectAisStream() {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    console.warn("[ais-relay] AISSTREAM_API_KEY not set — AIS relay disabled");
    return;
  }

  if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    wsClient = new WebSocket("wss://stream.aisstream.io/v0/stream");

    wsClient.on("open", () => {
      console.log("[ais-relay] connected to aisstream.io");
      const sub = {
        APIKey: apiKey,
        BoundingBoxes: [getSubscriptionBbox()],
        FilterMessageTypes: ["PositionReport"],
      };
      wsClient!.send(JSON.stringify(sub));
    });

    wsClient.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          MessageType?: string;
          Message?: {
            PositionReport?: {
              UserID?: number;
              Latitude?: number;
              Longitude?: number;
              Cog?: number;
              Sog?: number;
              TrueHeading?: number;
            };
          };
          MetaData?: {
            ShipName?: string;
            ShipType?: number;
            MMSI?: number;
          };
        };

        if (msg.MessageType !== "PositionReport") return;

        const pr = msg.Message?.PositionReport;
        const meta = msg.MetaData;
        if (!pr) return;

        const mmsi = pr.UserID ?? meta?.MMSI ?? 0;
        if (!mmsi) return;

        const lat = pr.Latitude ?? 0;
        const lng = pr.Longitude ?? 0;
        if (lat === 0 && lng === 0) return;

        vesselCache.set(mmsi, {
          mmsi,
          name: (meta?.ShipName ?? "").trim() || `MMSI ${mmsi}`,
          lat,
          lng,
          cog: pr.Cog ?? 0,
          sog: pr.Sog ?? 0,
          trueHeading: pr.TrueHeading ?? pr.Cog ?? 0,
          shipType: meta?.ShipType ?? 0,
          updatedAt: Date.now(),
        });
        evictOldestVessels();
      } catch {
      }
    });

    wsClient.on("close", (code) => {
      console.warn(`[ais-relay] disconnected (code=${code}) — reconnecting in 30s`);
      wsClient = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectAisStream, 30_000);
    });

    wsClient.on("error", (err) => {
      console.error("[ais-relay] ws error:", err.message);
      wsClient?.terminate();
      wsClient = null;
    });
  } catch (err) {
    console.error("[ais-relay] connect error:", err);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [mmsi, v] of vesselCache) {
    if (now - v.updatedAt > VESSEL_TTL_MS) {
      vesselCache.delete(mmsi);
    }
  }
}, 60_000);

connectAisStream();

router.get("/vessels", async (req: Request, res: Response) => {
  try {
    if (!req.session?.userId) {
      return sendError(res, 401, "Non autenticato");
    }

    const [userRow] = await db
      .select({ aisEnabled: users.aisEnabled })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!userRow?.aisEnabled) {
      return sendError(res, 403, "Accesso AIS non autorizzato");
    }

    const { bbox } = req.query as { bbox?: string };
    const now = Date.now();
    let vessels = Array.from(vesselCache.values()).filter(
      (v) => now - v.updatedAt <= VESSEL_TTL_MS
    );

    if (bbox) {
      const parts = bbox.split(",").map(Number);
      if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
        const [minLon, minLat, maxLon, maxLat] = parts;
        vessels = vessels.filter(
          (v) => v.lat >= minLat && v.lat <= maxLat && v.lng >= minLon && v.lng <= maxLon
        );
      }
    }

    return res.json(vessels.slice(0, 500));
  } catch (err) {
    console.error("[ais/vessels] error:", err);
    return sendError(res, 500, "Errore interno del server");
  }
});

export default router;
export { connectAisStream };
