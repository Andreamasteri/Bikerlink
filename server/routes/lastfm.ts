import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { storage } from "../storage";
import {
  userLastfmSessions,
  userMusicTracks,
  userPlaylistSnapshots,
  sharedPlaylists,
  users,
  messages,
  conversationParticipants,
} from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

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

  let resp: globalThis.Response;
  if (method === "GET") {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    for (const [k, v] of Object.entries(allParams)) url.searchParams.set(k, v);
    resp = await fetch(url.toString());
  } else {
    const body = new URLSearchParams(allParams);
    resp = await fetch("https://ws.audioscrobbler.com/2.0/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  }

  let json: unknown;
  try { json = await resp.json(); } catch { json = null; }

  if (!resp.ok) {
    const errMsg = (json as Record<string, unknown> | null)?.message as string | undefined
      ?? `Last.fm API error ${resp.status}`;
    throw new Error(errMsg);
  }
  return json;
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

    const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";
    const rawImageUrl = (t.image ?? []).find((img) => img.size === "medium")?.["#text"] ?? "";
    const imageUrl = rawImageUrl && !rawImageUrl.includes(LASTFM_PLACEHOLDER) ? rawImageUrl : null;

    try {
      await db
        .insert(userMusicTracks)
        .values({
          userId,
          lastfmTrackId: trackId,
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

  if (synced === 0) {
    try {
      const [snapshot] = await db
        .select()
        .from(userPlaylistSnapshots)
        .where(eq(userPlaylistSnapshots.userId, userId))
        .limit(1);

      if (snapshot && Array.isArray(snapshot.tracksJson) && (snapshot.tracksJson as unknown[]).length > 0) {
        // Accept both new (lastfmTrackId) and legacy (spotifyTrackId) snapshot formats
        const snapshotTracks = snapshot.tracksJson as Array<{
          lastfmTrackId?: string;
          spotifyTrackId?: string; // legacy field name from pre-Task#778 snapshots
          trackName: string;
          artistId: string;
          artistName: string;
          albumName?: string | null;
          imageUrl?: string | null;
          genres?: string[];
          popularity?: number;
          provider?: string;
        }>;
        for (const st of snapshotTracks) {
          const resolvedTrackId = st.lastfmTrackId ?? st.spotifyTrackId;
          if (!resolvedTrackId) continue;
          try {
            await db
              .insert(userMusicTracks)
              .values({
                userId,
                lastfmTrackId: resolvedTrackId,
                trackName: st.trackName,
                artistId: st.artistId,
                artistName: st.artistName,
                albumName: st.albumName ?? null,
                imageUrl: st.imageUrl ?? null,
                genres: st.genres ?? [],
                popularity: st.popularity ?? 0,
                provider: st.provider ?? "lastfm",
              })
              .onConflictDoNothing();
            synced++;
          } catch {
          }
        }
        console.log(`[Last.fm] syncLastfmTracks: 0 from API, restored ${synced} tracks from snapshot for user ${userId}`);
      }
    } catch (e) {
      console.warn("[Last.fm] syncLastfmTracks snapshot restore error:", e);
    }
  }

  return synced;
}

router.post("/mobile-auth", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato. Contatta l'amministratore." });
  }
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ message: "Username e password sono obbligatori." });
  }
  const userId = req.session.userId!;

  let sessionKey: string;
  let lastfmUsername: string;

  try {
    const passwordMd5 = crypto.createHash("md5").update(password, "utf8").digest("hex");
    const sessionData = await lastfmApiCall({
      method: "auth.getMobileSession",
      username,
      password: passwordMd5,
    }, "POST") as { session?: { key?: string; name?: string }; error?: number; message?: string };

    if (sessionData?.error) {
      const code = sessionData.error;
      console.warn(`[Last.fm mobile-auth] error code=${code} msg=${sessionData.message}`);
      let errMsg: string;
      if (code === 4) {
        errMsg = "Credenziali non valide. Assicurati di usare username e password corretti. Se hai appena creato l'account, verifica prima l'email di conferma che Last.fm ti ha inviato.";
      } else if (code === 26) {
        errMsg = "Accesso API Last.fm non autorizzato. Contatta l'assistenza.";
      } else {
        errMsg = sessionData.message ?? "Credenziali non valide. Riprova.";
      }
      return res.status(401).json({ message: errMsg });
    }

    const key = sessionData?.session?.key;
    if (!key) {
      return res.status(400).json({ message: "Autorizzazione Last.fm fallita. Controlla username e password." });
    }
    sessionKey = key;
    lastfmUsername = sessionData?.session?.name ?? username;
  } catch (err) {
    console.error("[Last.fm mobile-auth] auth error:", err);
    return res.status(401).json({ message: (err as Error).message ?? "Errore nella connessione Last.fm. Riprova." });
  }

  try {
    await db
      .insert(userLastfmSessions)
      .values({ userId, lastfmUsername, sessionKey })
      .onConflictDoUpdate({
        target: [userLastfmSessions.userId],
        set: { lastfmUsername, sessionKey, connectedAt: new Date() },
      });

    let trackCount = 0;
    try {
      trackCount = await syncLastfmTracks(userId, sessionKey, lastfmUsername);
    } catch (syncErr) {
      console.error("[Last.fm mobile-auth] sync brani fallita (login già salvato):", syncErr);
    }

    return res.json({ connected: true, username: lastfmUsername, trackCount });
  } catch (err) {
    console.error("[Last.fm mobile-auth] DB error:", err);
    return res.status(500).json({ message: "Errore nel salvataggio della sessione Last.fm." });
  }
});

router.get("/auth-token", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato." });
  }
  try {
    const data = await lastfmApiCall({ method: "auth.getToken" }) as { token?: string; error?: number; message?: string };
    if (data?.error || !data?.token) {
      console.warn(`[Last.fm auth-token] error=${data?.error} msg=${data?.message}`);
      return res.status(500).json({ message: data?.message ?? "Impossibile ottenere il token Last.fm." });
    }
    const apiKey = process.env.LASTFM_API_KEY!;
    const authUrl = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${data.token}&cb=bikerlink://lastfm-callback`;
    return res.json({ token: data.token, authUrl });
  } catch (err) {
    console.error("[Last.fm auth-token]", err);
    return res.status(500).json({ message: "Errore di connessione a Last.fm." });
  }
});

router.post("/auth-session", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return res.status(503).json({ message: "Last.fm non configurato." });
  }
  const { token } = req.body as { token?: string };
  if (!token) return res.status(400).json({ message: "Token mancante." });
  const userId = req.session.userId!;
  try {
    const data = await lastfmApiCall({ method: "auth.getSession", token }, "POST") as { session?: { key?: string; name?: string }; error?: number; message?: string };
    if (data?.error) {
      const code = data.error;
      console.warn(`[Last.fm auth-session] error code=${code} msg=${data.message}`);
      if (code === 14) {
        return res.status(401).json({ message: "Non hai ancora autorizzato l'app su Last.fm. Apri il link, accedi e clicca 'Sì, permetti l'accesso', poi torna qui e riprova." });
      }
      return res.status(401).json({ message: data.message ?? "Autorizzazione negata. Riprova." });
    }
    const key = data?.session?.key;
    const lastfmUsername = data?.session?.name;
    if (!key || !lastfmUsername) {
      return res.status(400).json({ message: "Autorizzazione Last.fm fallita. Riprova." });
    }
    await db.insert(userLastfmSessions)
      .values({ userId, lastfmUsername, sessionKey: key })
      .onConflictDoUpdate({
        target: [userLastfmSessions.userId],
        set: { lastfmUsername, sessionKey: key, connectedAt: new Date() },
      });
    let trackCount = 0;
    try {
      trackCount = await syncLastfmTracks(userId, key, lastfmUsername);
    } catch (syncErr) {
      console.error("[Last.fm auth-session] sync brani fallita:", syncErr);
    }
    return res.json({ connected: true, username: lastfmUsername, trackCount });
  } catch (err) {
    console.error("[Last.fm auth-session] error:", err);
    return res.status(500).json({ message: (err as Error).message ?? "Errore di connessione a Last.fm." });
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
      const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";
      const rawImageUrl2 = (t.image ?? []).find((img) => img.size === "medium")?.["#text"] ?? "";
      const imageUrl = rawImageUrl2 && !rawImageUrl2.includes(LASTFM_PLACEHOLDER) ? rawImageUrl2 : null;
      return {
        lastfmTrackId: trackId,
        trackName,
        artistId: artistName,
        artistName,
        albumName: null,
        imageUrl,
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
  const { lastfmTrackId, trackName, artistId, artistName, albumName, imageUrl, genres, popularity } =
    req.body as {
      lastfmTrackId: string;
      trackName: string;
      artistId: string;
      artistName: string;
      albumName?: string;
      imageUrl?: string;
      genres?: string[];
      popularity?: number;
    };
  if (!lastfmTrackId || !trackName || !artistName) {
    return res.status(400).json({ message: "Dati brano mancanti" });
  }
  try {
    const [track] = await db
      .insert(userMusicTracks)
      .values({
        userId,
        lastfmTrackId,
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

router.post("/share-playlist", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { toUserId, conversationId } = req.body as { toUserId?: string; conversationId?: string };
    if (!toUserId) {
      return res.status(400).json({ message: "toUserId è obbligatorio" });
    }

    const tracks = await db
      .select()
      .from(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")))
      .orderBy(userMusicTracks.trackName);

    if (tracks.length === 0) {
      return res.status(400).json({ message: "Nessun brano Last.fm sincronizzato. Sincronizza prima nel tab Musica." });
    }

    if (conversationId) {
      const participants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));

      const participantIds = participants.map((p) => p.userId);
      if (!participantIds.includes(userId)) {
        return res.status(403).json({ message: "Non sei un partecipante di questa conversazione" });
      }
      if (!participantIds.includes(toUserId)) {
        return res.status(403).json({ message: "Il destinatario non è un partecipante di questa conversazione" });
      }
    }

    const tracksData = tracks.map((t) => ({
      trackId: t.lastfmTrackId,
      trackName: t.trackName,
      artistId: t.artistId,
      artistName: t.artistName,
      albumName: t.albumName ?? undefined,
      genres: t.genres ?? [],
    }));

    const [newPlaylist] = await db
      .insert(sharedPlaylists)
      .values({
        fromUserId: userId,
        toUserId,
        conversationId: conversationId ?? null,
        tracksData,
        trackCount: tracks.length,
      })
      .returning();

    let messageId: string | undefined;

    if (conversationId && newPlaylist) {
      const me = await storage.getUser(userId);
      const [newMsg] = await db
        .insert(messages)
        .values({
          conversationId,
          senderId: userId,
          messageType: "playlist",
          content: JSON.stringify({ playlistId: newPlaylist.id, nickname: me?.nickname ?? "un utente", trackCount: tracks.length }),
          playlistId: newPlaylist.id,
        })
        .returning({ id: messages.id });
      messageId = newMsg?.id;
    }

    return res.json({ sharedPlaylistId: newPlaylist?.id, messageId });
  } catch (error) {
    console.error("[Last.fm] share-playlist error:", error);
    return res.status(500).json({ message: "Errore durante la condivisione della libreria" });
  }
});

router.get("/shared-playlists", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const playlists = await db
      .select()
      .from(sharedPlaylists)
      .where(eq(sharedPlaylists.toUserId, userId))
      .orderBy(sql`${sharedPlaylists.sharedAt} DESC`);

    const fromUserIds = [...new Set(playlists.map((p) => p.fromUserId))];
    const fromUsersData =
      fromUserIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, fromUserIds))
        : [];

    const fromUserMap = new Map(fromUsersData.map((u) => [u.id, u]));

    const result = await Promise.all(
      playlists.map(async (playlist) => {
        const fromUser = fromUserMap.get(playlist.fromUserId);
        const photos = fromUser ? await storage.getUserPhotos(fromUser.id) : [];
        return {
          id: playlist.id,
          fromUser: fromUser
            ? {
                id: fromUser.id,
                nickname: fromUser.nickname,
                photos: photos.map((p) => p.photoUrl),
              }
            : { id: playlist.fromUserId, nickname: "Utente", photos: [] },
          trackCount: playlist.trackCount,
          sharedAt: playlist.sharedAt.toISOString(),
          mergedAt: playlist.mergedAt?.toISOString() ?? null,
          tracks: playlist.tracksData,
        };
      })
    );

    return res.json({ playlists: result });
  } catch (error) {
    console.error("[Last.fm] shared-playlists error:", error);
    return res.status(500).json({ message: "Errore nel recupero delle playlist ricevute" });
  }
});

router.get("/shared-playlists/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const playlistId = parseInt(req.params.id, 10);
    if (isNaN(playlistId)) {
      return res.status(400).json({ message: "ID non valido" });
    }

    const [playlist] = await db
      .select()
      .from(sharedPlaylists)
      .where(and(eq(sharedPlaylists.id, playlistId), eq(sharedPlaylists.toUserId, userId)))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ message: "Playlist non trovata" });
    }

    const fromUser = await storage.getUser(playlist.fromUserId);
    return res.json({
      id: playlist.id,
      fromUser: { id: playlist.fromUserId, nickname: fromUser?.nickname ?? "Utente" },
      trackCount: playlist.trackCount,
      tracks: playlist.tracksData,
    });
  } catch (error) {
    console.error("[Last.fm] shared-playlists/:id error:", error);
    return res.status(500).json({ message: "Errore nel recupero della playlist" });
  }
});

router.post("/merge-playlist/:playlistId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const playlistId = parseInt(req.params.playlistId, 10);
    if (isNaN(playlistId)) {
      return res.status(400).json({ message: "ID playlist non valido" });
    }

    const [playlist] = await db
      .select()
      .from(sharedPlaylists)
      .where(and(eq(sharedPlaylists.id, playlistId), eq(sharedPlaylists.toUserId, userId)))
      .limit(1);

    if (!playlist) {
      return res.status(404).json({ message: "Playlist non trovata" });
    }

    const tracksData = playlist.tracksData as Array<{
      trackId: string;
      trackName: string;
      artistId: string;
      artistName: string;
      albumName?: string;
      genres?: string[];
    }>;

    let newTracksAdded = 0;
    for (const track of tracksData) {
      const result = await db
        .insert(userMusicTracks)
        .values({
          userId,
          provider: "lastfm",
          lastfmTrackId: track.trackId ?? track.trackName,
          trackName: track.trackName.slice(0, 500),
          artistId: track.artistId ?? track.artistName,
          artistName: track.artistName.slice(0, 300),
          albumName: track.albumName?.slice(0, 500) ?? null,
          genres: track.genres ?? [],
          popularity: 0,
        })
        .onConflictDoNothing()
        .returning({ id: userMusicTracks.id });
      if (result.length > 0) newTracksAdded++;
    }

    await db
      .update(sharedPlaylists)
      .set({ mergedAt: new Date() })
      .where(eq(sharedPlaylists.id, playlistId));

    return res.json({ merged: true, newTracksAdded });
  } catch (error) {
    console.error("[Last.fm] merge-playlist error:", error);
    return res.status(500).json({ message: "Errore durante il merge della playlist" });
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
          eq(userMusicTracks.lastfmTrackId, id),
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
