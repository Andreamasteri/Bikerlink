import { Router, Request, Response } from "express";
import { fetchRadioBrowser, CURATED_GENRES, GENRE_TAG_MAP, RadioBrowserStation } from "./utils";
import { sendError } from "../../lib/api-response";

const router = Router();

router.get("/genres", (_req: Request, res: Response) => {
  res.json(CURATED_GENRES);
});

router.get("/stations", async (req: Request, res: Response) => {
  const rawGenre = req.query.genre;
  const genre = typeof rawGenre === "string"
    ? rawGenre
    : Array.isArray(rawGenre) && typeof rawGenre[0] === "string"
    ? rawGenre[0]
    : undefined;
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  if (!genre) {
    return sendError(res, 400, "genre is required");
  }

  const tag = GENRE_TAG_MAP[genre] ?? genre;
  const fallbackTag = genre === "anime-8090" ? "anisong" : null;

  try {
    let stations: RadioBrowserStation[] = await fetchRadioBrowser(
      `json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
    );

    if (fallbackTag && stations.filter((s: RadioBrowserStation) => !!s.url_resolved).length < 3) {
      const fallback = await fetchRadioBrowser(
        `json/stations/bytag/${encodeURIComponent(fallbackTag)}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
      );
      const existingIds = new Set(stations.map((s: RadioBrowserStation) => s.stationuuid));
      stations = [...stations, ...fallback.filter((s: RadioBrowserStation) => !existingIds.has(s.stationuuid))];
    }

    const mapped = stations
      .filter((s: RadioBrowserStation) => !!s.url_resolved)
      .slice(0, limit)
      .map((s: RadioBrowserStation) => ({
        id: s.stationuuid,
        name: s.name?.trim() || "Stazione senza nome",
        streamUrl: s.url_resolved,
        favicon: s.favicon || null,
        country: s.country || null,
        votes: s.votes || 0,
        bitrate: s.bitrate || 0,
        tags: s.tags || "",
      }));

    return res.json(mapped);
  } catch (err) {
    console.error("[radio] stations error:", err);
    return sendError(res, 502, "Impossibile caricare le stazioni radio");
  }
});

export default router;
