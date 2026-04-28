import { Router, Request, Response } from "express";
import { db } from "../db";
import { userLastfmSessions, userMusicTracks } from "@shared/schema";
import { eq } from "drizzle-orm";
import dnsPromises from "dns/promises";
import net from "net";
import { Agent } from "undici";

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
  { id: "epic-metal", label: "Epic Metal", icon: "⚔️" },
  { id: "jazz", label: "Jazz", icon: "🎷" },
  { id: "electronic", label: "Elettronica", icon: "🎛️" },
  { id: "blues", label: "Blues", icon: "🎺" },
  { id: "country", label: "Country", icon: "🤠" },
  { id: "indie", label: "Indie", icon: "🎵" },
  { id: "80s", label: "Anni 80", icon: "📼" },
  { id: "90s", label: "Anni 90", icon: "💿" },
  { id: "anime", label: "Anime", icon: "🎌" },
  { id: "anime-8090", label: "Anime 80-90", icon: "📺" },
  { id: "eurobeat", label: "Eurobeat", icon: "🏎️" },
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
  "epic-metal": "epic metal",
  jazz: "jazz",
  electronic: "electronic",
  blues: "blues",
  country: "country",
  indie: "indie",
  "80s": "80s",
  "90s": "90s",
  anime: "anime",
  "anime-8090": "anime 80s",
  eurobeat: "eurobeat",
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
  "alternative rock": "rock",
  metal: "metal",
  "heavy metal": "metal",
  "death metal": "metal",
  "black metal": "metal",
  "thrash metal": "metal",
  "doom metal": "metal",
  "speed metal": "metal",
  metalcore: "metal",
  "progressive metal": "metal",
  "alternative metal": "metal",
  "nu metal": "metal",
  "symphonic metal": "epic-metal",
  "power metal": "epic-metal",
  "epic metal": "epic-metal",
  "epic black metal": "epic-metal",
  "folk metal": "epic-metal",
  "viking metal": "epic-metal",
  "melodic metal": "epic-metal",
  "melodic death metal": "epic-metal",
  "battle metal": "epic-metal",
  jazz: "jazz",
  "jazz fusion": "jazz",
  electronic: "electronic",
  electronica: "electronic",
  "electronic music": "electronic",
  "edm": "electronic",
  "techno": "electronic",
  "house": "electronic",
  "trance": "electronic",
  "ambient": "electronic",
  "disco": "electronic",
  blues: "blues",
  "electric blues": "blues",
  country: "country",
  "country rock": "country",
  indie: "indie",
  "indie rock": "indie",
  "indie pop": "indie",
  "alternative": "rock",
  "alternative indie": "indie",
  "80s": "80s",
  "1980s": "80s",
  "new wave": "80s",
  "synth-pop": "80s",
  "90s": "90s",
  "1990s": "90s",
  "90s pop": "90s",
  "90s rock": "90s",
  "grunge": "90s",
  "britpop": "90s",
  anime: "anime",
  "anime music": "anime",
  "anime ost": "anime",
  "j-pop": "anime",
  "j-rock": "anime",
  "japanese music": "anime",
  "anime 80s": "anime-8090",
  "anime 90s": "anime-8090",
  "anisong": "anime-8090",
  "anison": "anime-8090",
  "retro anime": "anime-8090",
  "80s anime": "anime-8090",
  "90s anime": "anime-8090",
  "anime classics": "anime-8090",
  "classic anime": "anime-8090",
  eurobeat: "eurobeat",
  "italo dance": "eurobeat",
  "italo disco": "eurobeat",
  "euro dance": "eurobeat",
  "eurodance": "eurobeat",
  classical: "classical",
  "classical music": "classical",
  pop: "pop",
  "pop music": "pop",
  "italian pop": "pop",
  "italo pop": "pop",
  "dance pop": "pop",
  punk: "rock",
  "punk rock": "rock",
  "hardcore punk": "punk",
  reggae: "reggae",
  "reggaeton": "reggae",
  "hip-hop": "hip-hop",
  "hip hop": "hip-hop",
  rap: "hip-hop",
  "trap": "hip-hop",
  soul: "soul",
  "r&b": "soul",
  "rnb": "soul",
  "rhythm and blues": "soul",
  funk: "electronic",
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
  const fallbackTag = genre === "anime-8090" ? "anisong" : null;

  try {
    let stations = await fetchRadioBrowser(
      `json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
    );

    if (fallbackTag && stations.filter((s) => !!s.url_resolved).length < 3) {
      const fallback = await fetchRadioBrowser(
        `json/stations/bytag/${encodeURIComponent(fallbackTag)}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
      );
      const existingIds = new Set(stations.map((s) => s.stationuuid));
      stations = [...stations, ...fallback.filter((s) => !existingIds.has(s.stationuuid))];
    }

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

// SSRF guard: classify a single IPv4/IPv6 address as private/internal.
// More robust than a hostname regex — handles decimal/octal/hex IPv4 forms
// (e.g. http://2130706433/ → 127.0.0.1) once they are normalized to dotted
// form, and IPv4-mapped IPv6 in both dotted and hex forms.
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(n => Number(n));
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;                         // 0.0.0.0/8 current network
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true;                       // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;          // 169.254.0.0/16 link-local + AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0) return true;            // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a >= 224) return true;                        // 224.0.0.0/4 multicast + reserved + 255.255.255.255
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  // fe80::/10 link-local
  if (/^fe[89ab]/.test(lower)) return true;
  // fc00::/7 unique local
  if (/^f[cd]/.test(lower)) return true;
  // IPv4-mapped IPv6 — both forms
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice(7);
    if (rest.includes(".")) return isPrivateIPv4(rest);
    const hex = rest.replace(":", "");
    if (/^[0-9a-f]{1,8}$/.test(hex)) {
      const num = parseInt(hex.padStart(8, "0"), 16);
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
    return true;
  }
  return false;
}

function isPrivateIP(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true; // not parseable → treat as blocked
}

// SSRF defense — connect-time DNS guard.
// `validateStreamUrl()` resolves DNS once before the fetch, but Node's fetch
// then resolves DNS *again* at connect time. Between the two lookups an
// attacker who controls the authoritative DNS for a hostname can flip the
// answer (DNS rebinding) and force the connect to land on a private IP.
// To eliminate this TOCTOU window we route every fetch through an undici
// Agent whose `connect.lookup` is the only DNS resolution that actually
// matters for the socket — and that lookup *itself* drops every private
// address. Even a perfectly-timed rebind can no longer steer the connect
// to 127.0.0.1 / 169.254.169.254 / 10.x.x.x / etc.
const safeDispatcher = new Agent({
  connect: {
    lookup: (hostname: string, options: any, callback: any) => {
      dnsPromises.lookup(hostname, { all: true, verbatim: true })
        .then(addrs => {
          let pool = addrs.filter(a => !isPrivateIP(a.address));
          const family = options?.family;
          if (family === 4) pool = pool.filter(a => a.family === 4);
          else if (family === 6) pool = pool.filter(a => a.family === 6);
          if (pool.length === 0) {
            return callback(new Error("SSRF: hostname resolves only to blocked addresses"));
          }
          // Honor `all` flag: undici (and net.connect lookup) call with
          // `all: true` to receive the full address list and pick one
          // themselves; otherwise use the legacy 3-arg form.
          if (options?.all) {
            callback(null, pool);
          } else {
            const first = pool[0];
            callback(null, first.address, first.family);
          }
        })
        .catch(err => callback(err as Error));
    },
  },
});

// Validate a URL: resolve hostname via DNS and ensure no resolved address is
// private/loopback/link-local. Closes (a) DNS rebinding attacks, (b) decimal/
// octal/hex IPv4 encodings that bypass naive regex blocking, (c) hostnames
// like "localhost.attacker.com" that resolve to 127.0.0.1.
async function validateStreamUrl(urlStr: string): Promise<URL | null> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) return null;
  if (hostname.toLowerCase() === "localhost") return null;

  // IP literal — validate directly
  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) return null;
    return parsed;
  }

  // Hostname → resolve and validate every returned address. Note: a tiny
  // TOCTOU window remains between DNS lookup and the actual fetch, but
  // forbidding private resolved IPs eliminates the practical attack
  // (DNS rebinding requires the attacker to control the resolver and the
  // victim's recursive cache simultaneously, which is far harder than the
  // bare regex bypass closed here).
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsPromises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    return null;
  }
  if (addresses.length === 0) return null;
  for (const a of addresses) {
    if (isPrivateIP(a.address)) return null;
  }
  return parsed;
}

// Whitelist content-types that legitimately come from an audio stream.
// Anything else (text/html, application/json, etc.) means the upstream
// is NOT a real stream — refusing turns the SSRF read-back into an empty
// 502 even if all URL/IP checks were somehow bypassed.
function isAllowedStreamContentType(ct: string | null): boolean {
  if (!ct) return true; // some shoutcast/icecast servers omit Content-Type — accept
  const c = ct.toLowerCase().split(";")[0].trim();
  if (c.startsWith("audio/")) return true;
  if (c.startsWith("video/")) return true; // some webradios serve hls .ts
  if (c === "application/ogg") return true;
  if (c === "application/octet-stream") return true;
  if (c === "application/vnd.apple.mpegurl") return true; // HLS
  if (c === "application/x-mpegurl") return true;        // HLS legacy
  if (c === "application/dash+xml") return true;
  return false;
}

router.get("/stream", requireAuth, async (req: Request, res: Response) => {
  const rawUrl = req.query.url;
  const firstFromArray = Array.isArray(rawUrl) && typeof rawUrl[0] === "string" ? rawUrl[0] : undefined;
  const streamUrl: string | undefined =
    typeof rawUrl === "string" ? rawUrl : firstFromArray;

  if (!streamUrl) {
    return res.status(400).json({ error: "url is required" });
  }

  if (!(await validateStreamUrl(streamUrl))) {
    return res.status(400).json({ error: "url is not valid or not allowed" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    // redirect: "manual" prevents auto-following — we re-validate any redirect target
    // dispatcher: safeDispatcher closes the DNS-rebinding TOCTOU between
    // validateStreamUrl()'s lookup and fetch's connect-time lookup.
    const upstream = await fetch(streamUrl, {
      headers: {
        "User-Agent": "BikerLink/4.0.0",
        "Icy-MetaData": "1",
      },
      signal: controller.signal,
      redirect: "manual",
      dispatcher: safeDispatcher,
    } as Parameters<typeof fetch>[1]);

    let finalResponse = upstream;

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get("location");
      if (!location) {
        clearTimeout(timer);
        return res.status(502).json({ error: "Redirect without Location header" });
      }
      let redirectTarget: URL;
      try {
        redirectTarget = new URL(location, streamUrl);
      } catch {
        clearTimeout(timer);
        return res.status(400).json({ error: "Invalid redirect target" });
      }
      if (!(await validateStreamUrl(redirectTarget.href))) {
        clearTimeout(timer);
        return res.status(400).json({ error: "Redirect target is not allowed" });
      }
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 10000);
      try {
        finalResponse = await fetch(redirectTarget.href, {
          headers: {
            "User-Agent": "BikerLink/4.0.0",
            "Icy-MetaData": "1",
          },
          signal: controller2.signal,
          redirect: "manual",
          dispatcher: safeDispatcher,
        } as Parameters<typeof fetch>[1]);
        clearTimeout(timer2);
        if (finalResponse.status >= 300 && finalResponse.status < 400) {
          return res.status(400).json({ error: "Too many redirects" });
        }
      } catch (err2) {
        clearTimeout(timer2);
        if (!res.headersSent) {
          return res.status(502).json({ error: "Cannot connect to redirected stream" });
        }
        return;
      }
    }

    clearTimeout(timer);

    if (!finalResponse.ok) {
      return res.status(502).json({ error: `Upstream error: ${finalResponse.status}` });
    }

    const contentType = finalResponse.headers.get("Content-Type") || "audio/mpeg";
    if (!isAllowedStreamContentType(finalResponse.headers.get("Content-Type"))) {
      // SSRF defense-in-depth: even if URL/IP validation were bypassed, this
      // prevents the proxy from returning HTML/JSON/etc. from internal services.
      return res.status(415).json({ error: "Upstream content-type is not an audio/video stream" });
    }
    const transferEncoding = finalResponse.headers.get("Transfer-Encoding");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-cache, no-store");
    if (transferEncoding) {
      res.setHeader("Transfer-Encoding", transferEncoding);
    }

    if (!finalResponse.body) {
      return res.status(502).json({ error: "No response body from upstream" });
    }

    req.on("close", () => {
      controller.abort();
    });

    const reader = finalResponse.body.getReader();
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!res.writable) break;
          res.write(Buffer.from(value));
        }
      } catch {
      } finally {
        res.end();
      }
    };
    pump();
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === "AbortError";
    console.error(`[radio] stream proxy error${isTimeout ? " (timeout)" : ""}:`, err);
    if (!res.headersSent) {
      return res.status(isTimeout ? 504 : 502).json({ error: isTimeout ? "Stream timeout" : "Cannot connect to stream" });
    }
  }
});

function buildLastfmUrl(params: Record<string, string>, apiKey: string): string {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  return url.toString();
}

function aggregateGenresFromTags(
  tags: Array<{ name?: string; count?: string | number }>,
  weight = 1
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const tag of tags) {
    const tagName = (tag.name ?? "").toLowerCase().trim();
    const mapped = LASTFM_TO_GENRE[tagName];
    if (mapped) {
      result[mapped] = (result[mapped] ?? 0) + Number(tag.count ?? 1) * weight;
    }
  }
  return result;
}

router.get("/suggested-genres", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;

  try {
    const [session] = await db
      .select({ lastfmUsername: userLastfmSessions.lastfmUsername })
      .from(userLastfmSessions)
      .where(eq(userLastfmSessions.userId, userId))
      .limit(1);

    if (!session?.lastfmUsername || !process.env.LASTFM_API_KEY) {
      return res.json([]);
    }

    const apiKey = process.env.LASTFM_API_KEY;
    const username = session.lastfmUsername;
    const genreScore: Record<string, number> = {};
    let artistStrategySucceeded = false;

    try {
      const artistsResp = await fetch(
        buildLastfmUrl({ method: "user.getTopArtists", user: username, limit: "10", period: "overall" }, apiKey),
        { signal: AbortSignal.timeout(6000) }
      );
      if (!artistsResp.ok) throw new Error(`Last.fm artists API ${artistsResp.status}`);

      const artistsData = await artistsResp.json() as {
        topartists?: { artist?: Array<{ name?: string; playcount?: string }> }
      };
      const topArtists = (artistsData?.topartists?.artist ?? []).slice(0, 5);

      if (topArtists.length > 0) {
        const tagResults = await Promise.allSettled(
          topArtists.map(async (artist) => {
            const name = artist.name ?? "";
            const playcount = Number(artist.playcount ?? 1);
            const tagsResp = await fetch(
              buildLastfmUrl({ method: "artist.getTopTags", artist: name, limit: "10" }, apiKey),
              { signal: AbortSignal.timeout(5000) }
            );
            if (!tagsResp.ok) throw new Error(`artist.getTopTags ${tagsResp.status}`);
            const tagsData = await tagsResp.json() as {
              toptags?: { tag?: Array<{ name?: string; count?: string | number }> }
            };
            const artistTags = tagsData?.toptags?.tag ?? [];
            const partial = aggregateGenresFromTags(artistTags, playcount);
            for (const [genre, score] of Object.entries(partial)) {
              genreScore[genre] = (genreScore[genre] ?? 0) + score;
            }
          })
        );

        const succeededCount = tagResults.filter((r) => r.status === "fulfilled").length;
        artistStrategySucceeded = succeededCount > 0;
        console.log(`[radio] suggested-genres: ${succeededCount}/${topArtists.length} artist tag calls succeeded`);
      }
    } catch (artistErr) {
      console.warn("[radio] suggested-genres: artist strategy failed, falling back to user tags", artistErr);
    }

    if (!artistStrategySucceeded) {
      try {
        const tagsResp = await fetch(
          buildLastfmUrl({ method: "user.getTopTags", user: username }, apiKey),
          { signal: AbortSignal.timeout(5000) }
        );
        if (tagsResp.ok) {
          const tagsData = await tagsResp.json() as {
            toptags?: { tag?: Array<{ name?: string; count?: string }> }
          };
          const userTags = tagsData?.toptags?.tag ?? [];
          const partial = aggregateGenresFromTags(userTags);
          for (const [genre, score] of Object.entries(partial)) {
            genreScore[genre] = (genreScore[genre] ?? 0) + score;
          }
        }
      } catch (fallbackErr) {
        console.warn("[radio] suggested-genres: fallback user.getTopTags also failed", fallbackErr);
      }
    }

    try {
      const savedTracks = await db
        .select({
          artistName: userMusicTracks.artistName,
          genres: userMusicTracks.genres,
          provider: userMusicTracks.provider,
        })
        .from(userMusicTracks)
        .where(eq(userMusicTracks.userId, userId))
        .limit(50);

      const legacyTracks = savedTracks.filter((t) => t.provider !== "lastfm");
      for (const track of legacyTracks) {
        for (const genre of (track.genres ?? [])) {
          const mapped = LASTFM_TO_GENRE[genre.toLowerCase().trim()];
          if (mapped) {
            genreScore[mapped] = (genreScore[mapped] ?? 0) + 0.6;
          }
        }
      }

      const lastfmTracks = savedTracks.filter((t) => t.provider === "lastfm");
      const uniqueArtists = [...new Set(lastfmTracks.map((t) => t.artistName).filter(Boolean))].slice(0, 10);
      if (uniqueArtists.length > 0 && apiKey) {
        const savedTagResults = await Promise.allSettled(
          uniqueArtists.map(async (artistName) => {
            const tagsResp = await fetch(
              buildLastfmUrl({ method: "artist.getTopTags", artist: artistName, limit: "10" }, apiKey),
              { signal: AbortSignal.timeout(5000) }
            );
            if (!tagsResp.ok) throw new Error(`artist.getTopTags saved ${tagsResp.status}`);
            const tagsData = await tagsResp.json() as {
              toptags?: { tag?: Array<{ name?: string; count?: string | number }> }
            };
            const artistTags = tagsData?.toptags?.tag ?? [];
            const partial = aggregateGenresFromTags(artistTags, 0.6);
            for (const [genre, score] of Object.entries(partial)) {
              genreScore[genre] = (genreScore[genre] ?? 0) + score;
            }
          })
        );
        const savedSucceeded = savedTagResults.filter((r) => r.status === "fulfilled").length;
        console.log(`[radio] suggested-genres: ${savedSucceeded}/${uniqueArtists.length} saved-tracks artist tag calls succeeded`);
      }
    } catch (savedErr) {
      console.warn("[radio] suggested-genres: saved tracks strategy failed", savedErr);
    }

    const sorted = Object.entries(genreScore)
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
