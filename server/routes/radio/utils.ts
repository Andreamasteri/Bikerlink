import { Request, Response, NextFunction } from "express";
export { requireAuth } from "../../lib/auth-middleware";
import { sendError } from "../../lib/api-response";
import dnsPromises from "dns/promises";
import net from "net";
import { Agent } from "undici";
import { getTrustedClientIp } from "../../lib/abuse-rate-limit";

// SECURITY (Task #1450): Rate limiter for the public preview-playlist
// endpoint. One unauthenticated request can fan out into up to 20 outbound
// iTunes fetches, making it a network-egress amplifier. A 30 req / 5 min
// cap per IP keeps legitimate interactive use entirely unaffected while
// making large-scale amplification attacks impractical.
export const previewPlaylistHitMap = new Map<string, { count: number; resetAt: number }>();
export const PREVIEW_RATE_LIMIT_MAX = 30;
export const PREVIEW_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export function previewPlaylistRateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = getTrustedClientIp(req) ?? "unknown";
  const now = Date.now();
  const entry = previewPlaylistHitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    previewPlaylistHitMap.set(ip, { count: 1, resetAt: now + PREVIEW_RATE_LIMIT_WINDOW_MS });
    return next();
  }
  if (entry.count >= PREVIEW_RATE_LIMIT_MAX) {
    return sendError(res, 429, "Troppe richieste");
  }
  entry.count++;
  return next();
}


export const CURATED_GENRES = [
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

export const GENRE_TAG_MAP: Record<string, string> = {
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

export const LASTFM_TO_GENRE: Record<string, string> = {
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

export const RADIO_BROWSER_HOSTS = [
  "de1.api.radio-browser.info",
  "nl1.api.radio-browser.info",
  "at1.api.radio-browser.info",
];

export interface RadioBrowserStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  favicon: string;
  country: string;
  votes: number;
  bitrate: number;
  tags: string;
}

export interface PreviewApiItem {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  previewUrl: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
  primaryGenreName?: string;
}

export interface PreviewResultItem {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  previewUrl: string;
  artworkUrl: string | null;
  durationMs: number;
  genre: string | null;
}

export const FETCH_TIMEOUT_MS = 8000;

export function buildFetchInit(opts: { userAgent?: string; timeoutMs?: number } = {}): RequestInit {
  const { userAgent = "BikerLink/4.0.0", timeoutMs = FETCH_TIMEOUT_MS } = opts;
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return {
    headers: { "User-Agent": userAgent, "Accept": "application/json" },
    signal: controller.signal,
  };
}

export async function fetchRadioBrowser(path: string): Promise<RadioBrowserStation[]> {
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

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(n => Number(n));
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1" || lower === "::") return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (/^f[cd]/.test(lower)) return true;
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

export function isPrivateIP(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

export const safeDispatcher = new Agent({
  connect: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export async function validateStreamUrl(urlStr: string): Promise<URL | null> {
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

  if (net.isIP(hostname)) {
    if (isPrivateIP(hostname)) return null;
    return parsed;
  }

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

export function isAllowedStreamContentType(ct: string | null): boolean {
  if (!ct) return true;
  const c = ct.toLowerCase().split(";")[0].trim();
  if (c.startsWith("audio/")) return true;
  if (c.startsWith("video/")) return true;
  if (c === "application/ogg") return true;
  // application/octet-stream intentionally excluded: it allows proxying arbitrary
  // binary file downloads from public CDNs, turning this into a general-purpose relay.
  if (c === "application/vnd.apple.mpegurl") return true;
  if (c === "application/x-mpegurl") return true;
  if (c === "application/dash+xml") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Per-user stream rate limiter: max STREAM_RATE_LIMIT_MAX new stream requests
// per STREAM_RATE_LIMIT_WINDOW_MS per authenticated user ID.
// ---------------------------------------------------------------------------
export const streamRateLimitMap = new Map<string, { count: number; resetAt: number }>();
export const STREAM_RATE_LIMIT_MAX = 10;
export const STREAM_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function checkStreamRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = streamRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    streamRateLimitMap.set(userId, { count: 1, resetAt: now + STREAM_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= STREAM_RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Per-user concurrent stream cap: at most STREAM_MAX_CONCURRENT open proxy
// connections per authenticated user at any given time.
// ---------------------------------------------------------------------------
export const STREAM_MAX_CONCURRENT = 2;
const activeStreamMap = new Map<string, number>();

export function acquireStreamSlot(userId: string): boolean {
  const current = activeStreamMap.get(userId) ?? 0;
  if (current >= STREAM_MAX_CONCURRENT) return false;
  activeStreamMap.set(userId, current + 1);
  return true;
}

export function releaseStreamSlot(userId: string): void {
  const current = activeStreamMap.get(userId) ?? 0;
  if (current <= 1) {
    activeStreamMap.delete(userId);
  } else {
    activeStreamMap.set(userId, current - 1);
  }
}

// Max bytes relayed per stream connection before the server closes the pipe.
// Legitimate radio streams are infinite (no Content-Length), so a hard byte
// cap stops the proxy from relaying multi-gigabyte file downloads.
export const STREAM_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

// Maximum wall-clock duration for a single proxied connection (ms).
export const STREAM_MAX_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// Content-Length ceiling: if the upstream declares a finite body this large
// it is almost certainly a file download, not a radio stream.
export const STREAM_MAX_CONTENT_LENGTH = 50 * 1024 * 1024; // 50 MB

export function buildLastfmUrl(params: Record<string, string>, apiKey: string): string {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  return url.toString();
}

export function aggregateGenresFromTags(
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
