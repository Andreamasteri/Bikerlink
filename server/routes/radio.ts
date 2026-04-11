import { Router, Request, Response } from "express";
import { db } from "../db";
import { userMusicTracks } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

const CURATED_GENRES = [
  { id: "rock", label: "Rock", icon: "🎸" },
  { id: "metal", label: "Metal", icon: "🤘" },
  { id: "jazz", label: "Jazz", icon: "🎷" },
  { id: "electronic", label: "Elettronica", icon: "🎛️" },
  { id: "blues", label: "Blues", icon: "🎺" },
  { id: "country", label: "Country", icon: "🤠" },
  { id: "indie", label: "Indie", icon: "🎵" },
  { id: "80s", label: "Anni 80", icon: "📼" },
  { id: "classical", label: "Classica", icon: "🎻" },
  { id: "pop", label: "Pop", icon: "⭐" },
  { id: "punk", label: "Punk", icon: "🔊" },
  { id: "reggae", label: "Reggae", icon: "🌴" },
  { id: "hip-hop", label: "Hip-Hop", icon: "🎤" },
  { id: "soul", label: "Soul/R&B", icon: "💛" },
];

const GENRE_TAG_MAP: Record<string, string> = {
  rock: "rock",
  metal: "metal",
  jazz: "jazz",
  electronic: "electronic",
  blues: "blues",
  country: "country",
  indie: "indie",
  "80s": "80s",
  classical: "classical",
  pop: "pop",
  punk: "punk",
  reggae: "reggae",
  "hip-hop": "hip-hop",
  soul: "soul",
};

const LASTFM_TO_GENRE: Record<string, string> = {
  rock: "rock",
  "hard rock": "rock",
  "classic rock": "rock",
  metal: "metal",
  "heavy metal": "metal",
  "death metal": "metal",
  jazz: "jazz",
  electronic: "electronic",
  electronica: "electronic",
  "electronic music": "electronic",
  blues: "blues",
  country: "country",
  indie: "indie",
  "indie rock": "indie",
  "80s": "80s",
  "1980s": "80s",
  classical: "classical",
  "classical music": "classical",
  pop: "pop",
  "pop music": "pop",
  punk: "punk",
  "punk rock": "punk",
  reggae: "reggae",
  "hip-hop": "hip-hop",
  "hip hop": "hip-hop",
  rap: "hip-hop",
  soul: "soul",
  "r&b": "soul",
  "rnb": "soul",
};

const RADIO_BROWSER_HOSTS = [
  "de1.api.radio-browser.info",
  "nl1.api.radio-browser.info",
  "at1.api.radio-browser.info",
];

interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  country: string;
  votes: number;
  bitrate: number;
  tags: string;
}

interface PreviewApiItem {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  previewUrl: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
}

const FETCH_TIMEOUT_MS = 8000;

function buildFetchInit(opts: { userAgent?: string; timeoutMs?: number } = {}): RequestInit {
  const { userAgent = "BikerLink/4.0.0", timeoutMs = FETCH_TIMEOUT_MS } = opts;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return {
    headers: { "User-Agent": userAgent, "Accept": "application/json" },
    signal: controller.signal,
  };
}

async function fetchRadioBrowser(path: string): Promise<RadioBrowserStation[]> {
  let lastError: Error | null = null;
  for (const host of RADIO_BROWSER_HOSTS) {
    try {
      const url = `https://${host}/${path}`;
      const resp = await fetch(url, buildFetchInit());
      if (!resp.ok) continue;
      return (await resp.json()) as RadioBrowserStation[];
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error("Radio Browser API unreachable");
}

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
    return res.status(400).json({ error: "genre is required" });
  }

  const tag = GENRE_TAG_MAP[genre] ?? genre;

  try {
    const stations = await fetchRadioBrowser(
      `json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
    );

    const mapped = stations
      .filter((s) => !!s.url_resolved)
      .slice(0, limit)
      .map((s) => ({
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
    return res.status(502).json({ error: "Impossibile caricare le stazioni radio" });
  }
});

router.get("/preview", async (req: Request, res: Response) => {
  const { track, artist } = req.query as { track?: string; artist?: string };

  if (!track) {
    return res.status(400).json({ error: "track is required" });
  }

  const term = [track, artist].filter(Boolean).join(" ");

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=10&country=IT`;
    const resp = await fetch(url, buildFetchInit({ userAgent: "BikerLink/4.0.0", timeoutMs: 5000 }));

    if (!resp.ok) {
      return res.status(502).json({ error: "iTunes API error" });
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
    return res.status(504).json({ error: isTimeout ? "iTunes timeout" : "Impossibile caricare la preview" });
  }
});

interface PreviewResultItem {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  previewUrl: string;
  artworkUrl: string | null;
  durationMs: number;
  genre: string | null;
}

router.get("/preview-playlist", async (req: Request, res: Response) => {
  const { tracks } = req.query;

  if (!tracks) {
    return res.status(400).json({ error: "tracks is required" });
  }

  let trackList: Array<{ trackName: string; artistName: string }> = [];
  try {
    trackList = JSON.parse(decodeURIComponent(tracks as string));
  } catch {
    return res.status(400).json({ error: "tracks must be valid JSON array" });
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

router.get("/suggested-genres", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  try {
    const tracks = await db
      .select({ genres: userMusicTracks.genres })
      .from(userMusicTracks)
      .where(eq(userMusicTracks.userId, userId));

    const genreCount: Record<string, number> = {};
    for (const row of tracks) {
      for (const g of row.genres ?? []) {
        const mapped = LASTFM_TO_GENRE[g.toLowerCase()];
        if (mapped) {
          genreCount[mapped] = (genreCount[mapped] ?? 0) + 1;
        }
      }
    }

    const sorted = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, 5);

    return res.json(sorted);
  } catch (err) {
    console.error("[radio] suggested-genres error:", err);
    return res.json([]);
  }
});

export default router;
