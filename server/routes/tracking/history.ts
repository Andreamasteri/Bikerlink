import { Router, type Request, type Response } from "express";
import { storage } from "../../storage";
import { requireUserId } from "../../lib/auth-middleware";

const router = Router();

type RawPoint = { latitude: number; longitude: number; [key: string]: any };

function perpendicularDistance(p: RawPoint, a: RawPoint, b: RawPoint): number {
  const dx = b.longitude - a.longitude;
  const dy = b.latitude - a.latitude;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((p.longitude - a.longitude) ** 2 + (p.latitude - a.latitude) ** 2);
  }
  const t = ((p.longitude - a.longitude) * dx + (p.latitude - a.latitude) * dy) / (dx * dx + dy * dy);
  const closestLng = a.longitude + t * dx;
  const closestLat = a.latitude + t * dy;
  return Math.sqrt((p.longitude - closestLng) ** 2 + (p.latitude - closestLat) ** 2);
}

function rdp(points: RawPoint[], epsilon: number): RawPoint[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function decimateRoutePoints(points: RawPoint[], maxPoints: number): RawPoint[] {
  if (points.length <= maxPoints) return points;
  const EPSILON_START = 0.0001;
  let epsilon = EPSILON_START;
  let result = rdp(points, epsilon);
  while (result.length > maxPoints && epsilon < 0.1) {
    epsilon *= 1.5;
    result = rdp(points, epsilon);
  }
  if (result.length > maxPoints) {
    const step = (result.length - 1) / (maxPoints - 1);
    const sampled: RawPoint[] = [result[0]];
    for (let i = 1; i < maxPoints - 1; i++) sampled.push(result[Math.round(i * step)]);
    sampled.push(result[result.length - 1]);
    return sampled;
  }
  return result;
}

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const rawPoints = await storage.getRoutePoints(id);
    const simplified = req.query.simplified !== "false";
    const points = simplified ? decimateRoutePoints(rawPoints, 450) : rawPoints;
    return res.json({ ...route, points });
  } catch (error) {
    console.error("Get route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    await storage.deleteRoute(id);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.post("/:id/like", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }

    const updated = await storage.updateRoute(id, {
      likes: (route.likes || 0) + 1,
    } as any);

    return res.json(updated);
  } catch (error) {
    console.error("Like route error:", error);
    return res.status(500).json({ message: "Errore interno del server" });
  }
});

router.get("/:id/export.gpx", async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = req.params.id as string;
    const route = await storage.getRoute(id);

    if (!route) {
      return res.status(404).json({ message: "Percorso non trovato" });
    }
    if (route.userId !== userId) {
      return res.status(403).json({ message: "Non autorizzato" });
    }

    const points = await storage.getRoutePoints(id);

    const routeName = (route.title || `BikerLink-${id.slice(0, 8)}`).replace(/[<>&"]/g, (c) =>
      c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;"
    );
    const creatorTime = route.startedAt
      ? new Date(route.startedAt).toISOString()
      : new Date().toISOString();

    const trkpts = points
      .map((p) => {
        const time = new Date(p.timestamp).toISOString();
        const ele = p.altitude != null ? `\n        <ele>${p.altitude.toFixed(2)}</ele>` : "";
        const spd =
          p.speedKmh != null
            ? `\n        <extensions><speed>${(p.speedKmh / 3.6).toFixed(3)}</speed></extensions>`
            : "";
        return `    <trkpt lat="${p.latitude.toFixed(7)}" lon="${p.longitude.toFixed(7)}">${ele}\n        <time>${time}</time>${spd}\n    </trkpt>`;
      })
      .join("\n");

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BikerLink" xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${routeName}</name>
    <time>${creatorTime}</time>
  </metadata>
  <trk>
    <name>${routeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    const safeName = routeName.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 60);
    res.setHeader("Content-Type", "application/gpx+xml");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.gpx"`);
    return res.send(gpx);
  } catch (error) {
    console.error("GPX export error:", error);
    return res.status(500).json({ message: "Errore durante l'esportazione GPX" });
  }
});

export default router;
