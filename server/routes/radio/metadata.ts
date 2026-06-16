import { Router, Request, Response } from "express";
import { 
  previewPlaylistRateLimiter, 
  buildFetchInit, 
  PreviewApiItem, 
  PreviewResultItem 
} from "./utils";
import { sendError } from "../../lib/api-response";

const router = Router();

router.get("/preview", async (req: Request, res: Response) => {
  const { track, artist } = req.query as { track?: string; artist?: string };

  if (!track) {
    return sendError(res, 400, "track is required");
  }

  const term = [track, artist].filter(Boolean).join(" ");

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=10&country=IT`;
    const resp = await fetch(url, buildFetchInit({ userAgent: "BikerLink/4.0.0", timeoutMs: 5000 }));

    if (!resp.ok) {
      return sendError(res, 502, "iTunes API error");
    }

    const data = (await resp.json()) as { results?: PreviewApiItem[] };
    const results = (data.results ?? [])
      .filter((r) => !!r.previewUrl)
      .map((r) => ({
        trackId: String(r.trackId),
        trackName: r.trackName,
        artistName: r.artistName,
        albumName: r.collectionName ?? null,
        previewUrl: r.previewUrl,
        artworkUrl: r.artworkUrl100?.replace("100x100bb", "300x300bb") ?? null,
        durationMs: r.trackTimeMillis ?? 30000,
        genre: r.primaryGenreName ?? null,
      }));

    return res.json(results);
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(`[radio] preview error${isTimeout ? " (timeout)" : ""}:`, err);
    return sendError(res, 504, isTimeout ? "iTunes timeout" : "Impossibile caricare la preview");
  }
});

// SECURITY (Task #1450): previewPlaylistRateLimiter applied here to cap
// outbound iTunes fanout from unauthenticated callers.
router.get("/preview-playlist", previewPlaylistRateLimiter, async (req: Request, res: Response) => {
  const { tracks } = req.query;

  if (!tracks) {
    return sendError(res, 400, "tracks is required");
  }

  let trackList: Array<{ trackName: string; artistName: string }> = [];
  try {
    trackList = JSON.parse(decodeURIComponent(tracks as string));
  } catch {
    return sendError(res, 400, "tracks must be valid JSON array");
  }

  const results: PreviewResultItem[] = [];

  for (const t of trackList.slice(0, 20)) {
    try {
      const term = [t.trackName, t.artistName].filter(Boolean).join(" ");
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=1&country=IT`;
      const resp = await fetch(url, buildFetchInit({ timeoutMs: 6000 }));
      if (!resp.ok) continue;
      const data = (await resp.json()) as { results?: PreviewApiItem[] };
      const item = (data.results ?? []).find((r) => !!r.previewUrl);
      if (item) {
        results.push({
          trackId: String(item.trackId),
          trackName: item.trackName,
          artistName: item.artistName,
          albumName: item.collectionName ?? null,
          previewUrl: item.previewUrl,
          artworkUrl: item.artworkUrl100?.replace("100x100bb", "300x300bb") ?? null,
          durationMs: item.trackTimeMillis ?? 30000,
          genre: item.primaryGenreName ?? null,
        });
      }
    } catch (err) {
      console.warn("[radio] preview-playlist item error:", err);
    }
  }

  return res.json(results);
});

export default router;
