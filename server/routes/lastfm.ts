import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { storage } from "../storage";
import {
  userLastfmSessions,
  userMusicTracks,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

const router = Router();

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Non autenticato" });
  }
  next();
}

function isLastfmConfigured(): boolean {
  return !!(process.env.LASTFM_API_KEY && process.env.LASTFM_SHARED_SECRET);
}

function signParams(params: Record<string, string>, sharedSecret: string): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => k + params[k])
    .join("");
  return crypto.createHash("md5").update(sorted + sharedSecret, "utf8").digest("hex");
}

async function lastfmApiCall(params: Record<string, string>, method: "GET" | "POST" = "GET"): Promise<unknown> {
  const apiKey = process.env.LASTFM_API_KEY!;
  const sharedSecret = process.env.LASTFM_SHARED_SECRET!;
  const allParams: Record<string, string> = { ...params, api_key: apiKey, format: "json" };
  allParams.api_sig = signParams(
    Object.fromEntries(Object.entries(allParams).filter(([k]) => k !== "format")),
    sharedSecret
  );
  if (method === "GET") {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v);
    const resp = await fetch(url.toString());
    if (!resp.ok) throw new Error(`Last.fm API error ${resp.status}`);
    return resp.json();
  } else {
    const body = new URLSearchParams(allParams);
    const resp = await fetch("https://ws.audioscrobbler.com/2.0/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) throw new Error(`Last.fm API error ${resp.status}`);
    return resp.json();
  }
}

async function lastfmPublicCall(params: Record<string, string>): Promise<unknown> {
  const apiKey = process.env.LASTFM_API_KEY!;
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`Last.fm API error ${resp.status}`);
  return resp.json();
}

async function syncLastfmTracks(userId: string, sessionKey: string, username: string): Promise<number> {
  const data = await lastfmApiCall({
    method: "user.getTopTracks",
    user: username,
    sk: sessionKey,
    period: "6month",
    limit: "50",
  }) as { toptracks?: { track?: unknown[] } };

  const tracks = data?.toptracks?.track ?? [];
  let synced = 0;

  for (const t of tracks as Array<{ mbid?: string; name?: string; artist?: { name?: string; mbid?: string }; image?: Array<{ "#text"?: string; size?: string }> }>) {
    const trackName = t.name ?? "";
    const artistName = t.artist?.name ?? "";
    if (!trackName || !artistName) continue;

    const trackId = t.mbid && t.mbid.length > 0 ? t.mbid : `${artistName}::${trackName}`;

    let genres: string[] = [];
    try {
      const tagData = await lastfmPublicCall({
        method: "artist.getTopTags",
        artist: artistName,
      }) as { toptags?: { tag?: Array<{ name?: string }> } };
      const tags = tagData?.toptags?.tag ?? [];
      genres = (tags as Array<{ name?: string }>)
        .slice(0, 3)
        .map((tag) => tag.name ?? "")
        .filter(Boolean);
    } catch {
    }

    const imageUrl = (t.image ?? []).find((img) => img.size === "medium")?.["#text"] ?? null;

    try {
      await db
        .insert(userMusicTracks)
        .values({
          userId,
          spotifyTrackId: trackId,
          trackName,
          artistId: t.artist?.mbid && t.artist.mbid.length > 0 ? t.artist.mbid : artistName,
          artistName,
          albumName: null,
          imageUrl: imageUrl || null,
          genres,
          popularity: 0,
          provider: "lastfm",
        })
        .onConflictDoNothing();
      synced++;
    } catch {
    }
  }

  return synced;
}

router.get("/auth-url", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato. Contatta l'amministratore." });
  }
  try {
    const tokenData = await lastfmApiCall({ method: "auth.getToken" }) as { token?: string };
    const token = tokenData?.token;
    if (!token) return res.status(500).json({ message: "Impossibile ottenere token Last.fm" });

    const authUrl = `https://www.last.fm/api/auth/?api_key=${process.env.LASTFM_API_KEY}&token=${token}&cb=bikerlink://lastfm-callback`;
    return res.json({ authUrl, token });
  } catch (err) {
    console.error("[Last.fm auth-url]", err);
    return res.status(500).json({ message: "Errore nell'avvio connessione Last.fm" });
  }
});

router.post("/callback", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato." });
  }
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ message: "Token mancante" });
  const userId = req.session.userId!;
  try {
    const sessionData = await lastfmApiCall({
      method: "auth.getSession",
      token,
    }) as { session?: { key?: string; name?: string } };

    const sessionKey = sessionData?.session?.key;
    const username = sessionData?.session?.name;
    if (!sessionKey || !username) {
      return res.status(400).json({ message: "Autorizzazione Last.fm fallita. Riprova." });
    }

    await db
      .insert(userLastfmSessions)
      .values({ userId, lastfmUsername: username, sessionKey })
      .onConflictDoUpdate({
        target: [userLastfmSessions.userId],
        set: { lastfmUsername: username, sessionKey, connectedAt: new Date() },
      });

    const trackCount = await syncLastfmTracks(userId, sessionKey, username);

    return res.json({ connected: true, username, trackCount });
  } catch (err) {
    console.error("[Last.fm callback]", err);
    return res.status(500).json({ message: "Errore nella connessione Last.fm. Riprova." });
  }
});

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  try {
    const [session] = await db
      .select()
      .from(userLastfmSessions)
      .where(eq(userLastfmSessions.userId, userId))
      .limit(1);

    if (!session) {
      return res.json({ connected: false, username: null, trackCount: 0 });
    }

    const tracks = await db
      .select({ id: userMusicTracks.id })
      .from(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")));

    return res.json({
      connected: true,
      username: session.lastfmUsername,
      trackCount: tracks.length,
    });
  } catch (err) {
    console.error("[Last.fm status]", err);
    return res.status(500).json({ message: "Errore nel recupero stato Last.fm" });
  }
});

router.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  try {
    await db.delete(userLastfmSessions).where(eq(userLastfmSessions.userId, userId));
    await db
      .delete(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")));
    return res.json({ disconnected: true });
  } catch (err) {
    console.error("[Last.fm disconnect]", err);
    return res.status(500).json({ message: "Errore nella disconnessione" });
  }
});

router.get("/search", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato." });
  }
  const q = (req.query.q as string ?? "").trim();
  if (q.length < 2) return res.status(400).json({ message: "Query troppo corta" });
  try {
    const data = await lastfmPublicCall({
      method: "track.search",
      track: q,
      limit: "20",
    }) as { results?: { trackmatches?: { track?: unknown[] } } };

    const tracks = (data?.results?.trackmatches?.track ?? []) as Array<{
      mbid?: string;
      name?: string;
      artist?: string;
      image?: Array<{ "#text"?: string; size?: string }>;
    }>;

    const result = tracks.map((t) => {
      const trackName = t.name ?? "";
      const artistName = t.artist ?? "";
      const trackId = t.mbid && t.mbid.length > 0 ? t.mbid : `${artistName}::${trackName}`;
      const imageUrl = (t.image ?? []).find((img) => img.size === "medium")?.["#text"] ?? null;
      return {
        spotifyTrackId: trackId,
        trackName,
        artistId: artistName,
        artistName,
        albumName: null,
        imageUrl: imageUrl && imageUrl.length > 0 ? imageUrl : null,
        genres: [] as string[],
        popularity: 0,
      };
    }).filter((t) => t.trackName && t.artistName);

    return res.json({ tracks: result });
  } catch (err) {
    console.error("[Last.fm search]", err);
    return res.status(500).json({ message: "Errore nella ricerca Last.fm" });
  }
});

router.post("/sync", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato." });
  }
  const userId = req.session.userId!;
  try {
    const [session] = await db
      .select()
      .from(userLastfmSessions)
      .where(eq(userLastfmSessions.userId, userId))
      .limit(1);

    if (!session) return res.status(401).json({ message: "Account Last.fm non collegato" });

    const trackCount = await syncLastfmTracks(userId, session.sessionKey, session.lastfmUsername);
    return res.json({ synced: trackCount });
  } catch (err) {
    console.error("[Last.fm sync]", err);
    return res.status(500).json({ message: "Errore durante la sincronizzazione" });
  }
});

router.get("/tracks", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  try {
    const tracks = await db
      .select()
      .from(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")));
    return res.json({ tracks });
  } catch (err) {
    console.error("[Last.fm tracks]", err);
    return res.status(500).json({ message: "Errore nel recupero brani" });
  }
});

router.post("/tracks", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { spotifyTrackId, trackName, artistId, artistName, albumName, imageUrl, genres, popularity } =
    req.body as {
      spotifyTrackId: string;
      trackName: string;
      artistId: string;
      artistName: string;
      albumName?: string;
      imageUrl?: string;
      genres?: string[];
      popularity?: number;
    };
  if (!spotifyTrackId || !trackName || !artistName) {
    return res.status(400).json({ message: "Dati brano mancanti" });
  }
  try {
    const [track] = await db
      .insert(userMusicTracks)
      .values({
        userId,
        spotifyTrackId,
        trackName,
        artistId: artistId || artistName,
        artistName,
        albumName: albumName ?? null,
        imageUrl: imageUrl ?? null,
        genres: genres ?? [],
        popularity: popularity ?? 0,
        provider: "lastfm",
      })
      .onConflictDoNothing()
      .returning();
    return res.json({ track });
  } catch (err) {
    console.error("[Last.fm add track]", err);
    return res.status(500).json({ message: "Errore nell'aggiunta del brano" });
  }
});

router.delete("/tracks/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { id } = req.params;
  try {
    await db
      .delete(userMusicTracks)
      .where(
        and(
          eq(userMusicTracks.userId, userId),
          eq(userMusicTracks.spotifyTrackId, id),
          eq(userMusicTracks.provider, "lastfm")
        )
      );
    return res.json({ deleted: true });
  } catch (err) {
    console.error("[Last.fm delete track]", err);
    return res.status(500).json({ message: "Errore nell'eliminazione del brano" });
  }
});

export default router;
