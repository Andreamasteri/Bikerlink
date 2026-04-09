import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { db } from "../db";
import { storage } from "../storage";
import {
  userSpotifyTokens,
  userMusicTracks,
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

function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

router.use(async (_req: Request, res: Response, next: () => void) => {
  try {
    const setting = await storage.getAppSetting("spotify_coming_soon");
    if (setting?.value === "true") {
      return res.status(503).json({ message: "La funzione Spotify è in arrivo. Stiamo aspettando l'Extended Quota Mode di Spotify." });
    }
  } catch {
    // ignore, proceed normally
  }
  next();
});

router.use((_req: Request, res: Response, next: () => void) => {
  if (!isSpotifyConfigured()) {
    return res.status(503).json({ message: "Spotify non configurato. Contatta l'amministratore." });
  }
  next();
});

function checkSpotifyConfig(res: Response): boolean {
  if (!isSpotifyConfigured()) {
    res.status(503).json({ message: "Spotify non configurato. Contatta l'amministratore." });
    return false;
  }
  return true;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.SPOTIFY_CLIENT_SECRET || "fallback-key-not-used";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptToken(token: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, encHex] = encrypted.split(":");
  if (!ivHex || !encHex) throw new Error("Invalid encrypted token format");
  const iv = Buffer.from(ivHex, "hex");
  const encryptedBuf = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(encryptedBuf), decipher.final()]).toString("utf8");
}

async function callSpotifyTokenEndpoint(params: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams(params);
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Spotify token error ${resp.status}: ${text}`);
  }
  return resp.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function getValidAccessToken(userId: string): Promise<string> {
  const [tokenRow] = await db
    .select()
    .from(userSpotifyTokens)
    .where(eq(userSpotifyTokens.userId, userId))
    .limit(1);

  if (!tokenRow) throw new Error("Spotify non connesso");

  const nowMs = Date.now();
  const expiresMs = tokenRow.expiresAt.getTime();

  if (expiresMs > nowMs + 60_000) {
    return decryptToken(tokenRow.accessToken);
  }

  const refreshToken = decryptToken(tokenRow.refreshToken);
  const tokenData = await callSpotifyTokenEndpoint({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
  const updatedFields: Partial<typeof userSpotifyTokens.$inferInsert> = {
    accessToken: encryptToken(tokenData.access_token),
    expiresAt: newExpiresAt,
  };
  if (tokenData.refresh_token) {
    updatedFields.refreshToken = encryptToken(tokenData.refresh_token);
  }

  await db.update(userSpotifyTokens).set(updatedFields).where(eq(userSpotifyTokens.userId, userId));

  return tokenData.access_token;
}

async function spotifyGet(accessToken: string, path: string): Promise<unknown> {
  const resp = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Spotify API error ${resp.status} on ${path}: ${text}`);
  }
  return resp.json();
}

interface SpotifyTrackItem {
  id: string;
  name: string;
  popularity?: number;
  album?: { name?: string };
  artists?: Array<{ id: string; name: string }>;
}
interface SpotifyArtistItem {
  id: string;
  name: string;
  genres?: string[];
}
interface SpotifyTopTracksResponse {
  items?: SpotifyTrackItem[];
}
interface SpotifyTopArtistsResponse {
  items?: SpotifyArtistItem[];
}
interface SpotifyMeResponse {
  id: string;
  display_name?: string;
}

async function syncSpotifyTracks(userId: string): Promise<number> {
  const accessToken = await getValidAccessToken(userId);

  let topTracksData: SpotifyTopTracksResponse = { items: [] };
  let topArtistsData: SpotifyTopArtistsResponse = { items: [] };

  try {
    topTracksData = await spotifyGet(accessToken, "/me/top/tracks?limit=50&time_range=medium_term") as SpotifyTopTracksResponse;
  } catch (err) {
    console.warn("[Spotify] top/tracks failed (non bloccante):", (err as Error).message);
  }

  try {
    topArtistsData = await spotifyGet(accessToken, "/me/top/artists?limit=50&time_range=medium_term") as SpotifyTopArtistsResponse;
  } catch (err) {
    console.warn("[Spotify] top/artists failed (non bloccante):", (err as Error).message);
  }

  const genresByArtistId = new Map<string, string[]>();
  for (const artist of topArtistsData.items ?? []) {
    genresByArtistId.set(artist.id, artist.genres ?? []);
  }

  const trackMap = new Map<string, {
    spotifyTrackId: string;
    trackName: string;
    artistId: string;
    artistName: string;
    albumName: string | null;
    genres: string[];
    popularity: number;
  }>();

  const processTrack = (track: SpotifyTrackItem) => {
    if (!track?.id || !track.name) return;
    const artist = track.artists?.[0];
    if (!artist) return;
    if (trackMap.has(track.id)) return;
    const genres = genresByArtistId.get(artist.id) ?? [];
    trackMap.set(track.id, {
      spotifyTrackId: track.id,
      trackName: track.name.slice(0, 500),
      artistId: artist.id,
      artistName: artist.name.slice(0, 300),
      albumName: track.album?.name?.slice(0, 500) ?? null,
      genres,
      popularity: track.popularity ?? 0,
    });
  };

  for (const track of topTracksData.items ?? []) processTrack(track);

  const tracksArray = Array.from(trackMap.values());

  if (tracksArray.length > 0) {
    for (const track of tracksArray) {
      await db
        .insert(userMusicTracks)
        .values({ userId, ...track })
        .onConflictDoUpdate({
          target: [userMusicTracks.userId, userMusicTracks.spotifyTrackId],
          set: {
            trackName: track.trackName,
            artistName: track.artistName,
            albumName: track.albumName,
            genres: track.genres,
            popularity: track.popularity,
          },
        });
    }
  }

  await db
    .update(userSpotifyTokens)
    .set({ lastSyncAt: new Date() })
    .where(eq(userSpotifyTokens.userId, userId));

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(userMusicTracks)
    .where(eq(userMusicTracks.userId, userId));

  return Number(count);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post("/callback", requireAuth, async (req: Request, res: Response) => {
  if (!checkSpotifyConfig(res)) return;
  try {
    const userId = req.session.userId!;
    const { code, redirectUri } = req.body as { code?: string; redirectUri?: string };
    if (!code || !redirectUri) {
      return res.status(400).json({ message: "code e redirectUri sono obbligatori" });
    }

    const tokenData = await callSpotifyTokenEndpoint({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const spotifyMe = await spotifyGet(tokenData.access_token, "/me") as SpotifyMeResponse;

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    const conflictUpdateSet: Partial<typeof userSpotifyTokens.$inferInsert> = {
      spotifyUserId: spotifyMe.id,
      displayName: spotifyMe.display_name ?? null,
      accessToken: encryptToken(tokenData.access_token),
      expiresAt,
    };
    if (tokenData.refresh_token) {
      conflictUpdateSet.refreshToken = encryptToken(tokenData.refresh_token);
    }

    await db
      .insert(userSpotifyTokens)
      .values({
        userId,
        spotifyUserId: spotifyMe.id,
        displayName: spotifyMe.display_name ?? null,
        accessToken: encryptToken(tokenData.access_token),
        refreshToken: encryptToken(tokenData.refresh_token ?? ""),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: userSpotifyTokens.userId,
        set: conflictUpdateSet,
      });

    let trackCount = 0;
    try {
      trackCount = await syncSpotifyTracks(userId);
    } catch (syncErr) {
      console.warn("[Spotify] Sync after callback failed:", syncErr);
    }

    return res.json({ connected: true, displayName: spotifyMe.display_name ?? null, trackCount });
  } catch (error) {
    console.error("[Spotify] callback error:", error);
    const msg = (error as Error).message ?? "";
    if (msg.includes("403")) {
      return res.status(422).json({ message: "Spotify non supportato: l'app è in attesa dell'Extended Quota Mode. Riprova più tardi o contatta l'amministratore." });
    }
    return res.status(500).json({ message: "Errore durante la connessione a Spotify" });
  }
});

router.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    await db.delete(userSpotifyTokens).where(eq(userSpotifyTokens.userId, userId));
    await db.delete(userMusicTracks).where(eq(userMusicTracks.userId, userId));
    return res.json({ disconnected: true });
  } catch (error) {
    console.error("[Spotify] disconnect error:", error);
    return res.status(500).json({ message: "Errore durante la disconnessione" });
  }
});

router.post("/sync", requireAuth, async (req: Request, res: Response) => {
  if (!checkSpotifyConfig(res)) return;
  try {
    const userId = req.session.userId!;
    const trackCount = await syncSpotifyTracks(userId);
    return res.json({ synced: true, trackCount });
  } catch (error) {
    console.error("[Spotify] sync error:", error);
    return res.status(500).json({ message: "Errore durante la sincronizzazione" });
  }
});

router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const [tokenRow] = await db
      .select()
      .from(userSpotifyTokens)
      .where(eq(userSpotifyTokens.userId, userId))
      .limit(1);

    if (!tokenRow) {
      return res.json({ connected: false, trackCount: 0 });
    }

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userMusicTracks)
      .where(eq(userMusicTracks.userId, userId));

    return res.json({
      connected: true,
      displayName: tokenRow.displayName ?? null,
      trackCount: Number(count),
      lastSyncAt: tokenRow.lastSyncAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("[Spotify] status error:", error);
    return res.status(500).json({ message: "Errore nel recupero dello stato" });
  }
});

router.get("/my-tracks", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const tracks = await db
      .select()
      .from(userMusicTracks)
      .where(eq(userMusicTracks.userId, userId))
      .orderBy(sql`popularity DESC`);

    const artistMap = new Map<string, { id: string; name: string; count: number }>();
    const genreMap = new Map<string, number>();

    for (const track of tracks) {
      if (!artistMap.has(track.artistId)) {
        artistMap.set(track.artistId, { id: track.artistId, name: track.artistName, count: 0 });
      }
      artistMap.get(track.artistId)!.count++;

      for (const genre of track.genres ?? []) {
        genreMap.set(genre, (genreMap.get(genre) ?? 0) + 1);
      }
    }

    const topArtists = Array.from(artistMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topGenres = Array.from(genreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([genre]) => genre);

    return res.json({ tracks, topArtists, topGenres });
  } catch (error) {
    console.error("[Spotify] my-tracks error:", error);
    return res.status(500).json({ message: "Errore nel recupero delle tracce" });
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
      .where(eq(userMusicTracks.userId, userId))
      .orderBy(sql`popularity DESC`);

    if (tracks.length === 0) {
      return res.status(400).json({ message: "Nessuna traccia da condividere. Sincronizza prima con Spotify." });
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
      trackId: t.spotifyTrackId,
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
    console.error("[Spotify] share-playlist error:", error);
    return res.status(500).json({ message: "Errore durante la condivisione della playlist" });
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
    console.error("[Spotify] shared-playlists error:", error);
    return res.status(500).json({ message: "Errore nel recupero delle playlist ricevute" });
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
          spotifyTrackId: track.trackId,
          trackName: track.trackName.slice(0, 500),
          artistId: track.artistId,
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
    console.error("[Spotify] merge-playlist error:", error);
    return res.status(500).json({ message: "Errore durante il merge della playlist" });
  }
});

export async function handleMusicMatch(req: Request, res: Response) {
  try {
    const userId = req.session.userId!;
    const criteriaParam = (req.query.criteria as string) ?? "songs";
    const criteria = criteriaParam.split(",").map((s) => s.trim());
    const minSongs = parseInt((req.query.minSongs as string) ?? "5", 10);
    const maxKm = parseFloat((req.query.maxKm as string) ?? "50");
    const logic = (req.query.logic as string) === "any" ? "any" : "all";

    const myTracks = await db
      .select({ spotifyTrackId: userMusicTracks.spotifyTrackId, artistId: userMusicTracks.artistId, genres: userMusicTracks.genres })
      .from(userMusicTracks)
      .where(eq(userMusicTracks.userId, userId));

    if (myTracks.length === 0) {
      return res.json({ matches: [] });
    }

    const myTrackIds = new Set(myTracks.map((t) => t.spotifyTrackId));

    const myArtistCount = new Map<string, number>();
    for (const t of myTracks) {
      myArtistCount.set(t.artistId, (myArtistCount.get(t.artistId) ?? 0) + 1);
    }
    const myTopArtistId = [...myArtistCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const myGenreCount = new Map<string, number>();
    for (const t of myTracks) {
      for (const g of t.genres ?? []) myGenreCount.set(g, (myGenreCount.get(g) ?? 0) + 1);
    }
    const myTopGenre = [...myGenreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const myProfile = await storage.getUserProfile(userId);
    const myLat = myProfile?.latitude ?? null;
    const myLng = myProfile?.longitude ?? null;

    const candidateTokens = await db
      .select({ userId: userSpotifyTokens.userId })
      .from(userSpotifyTokens)
      .where(sql`${userSpotifyTokens.userId} != ${userId}`);

    const candidateUserIds = candidateTokens.map((c) => c.userId);
    if (candidateUserIds.length === 0) {
      return res.json({ matches: [] });
    }

    const candidateUsers = await db
      .select()
      .from(users)
      .where(and(inArray(users.id, candidateUserIds), sql`${users.isFake} = false`));

    const matches: Array<{
      user: { id: string; nickname: string; userType: string; photos: string[] };
      songsInCommon: number;
      sharedArtist: string | null;
      sharedGenre: string | null;
      distanceKm: number;
    }> = [];

    for (const candidate of candidateUsers) {
      const candidateTracks = await db
        .select({ spotifyTrackId: userMusicTracks.spotifyTrackId, artistId: userMusicTracks.artistId, artistName: userMusicTracks.artistName, genres: userMusicTracks.genres })
        .from(userMusicTracks)
        .where(eq(userMusicTracks.userId, candidate.id));

      if (candidateTracks.length === 0) continue;

      const songsInCommon = candidateTracks.filter((t) => myTrackIds.has(t.spotifyTrackId)).length;

      const candidateArtistCount = new Map<string, { id: string; name: string; count: number }>();
      for (const t of candidateTracks) {
        const existing = candidateArtistCount.get(t.artistId);
        if (existing) existing.count++;
        else candidateArtistCount.set(t.artistId, { id: t.artistId, name: t.artistName, count: 1 });
      }
      const candidateTopArtist = [...candidateArtistCount.values()].sort((a, b) => b.count - a.count)[0];
      const artistMatches = myTopArtistId && candidateTopArtist?.id === myTopArtistId;
      const sharedArtist = artistMatches ? candidateTopArtist?.name ?? null : null;

      const candidateGenreCount = new Map<string, number>();
      for (const t of candidateTracks) {
        for (const g of t.genres ?? []) candidateGenreCount.set(g, (candidateGenreCount.get(g) ?? 0) + 1);
      }
      const candidateTopGenre = [...candidateGenreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const genreMatches = myTopGenre && candidateTopGenre === myTopGenre;
      const sharedGenre = genreMatches ? candidateTopGenre ?? null : null;

      const candidateProfile = await storage.getUserProfile(candidate.id);
      const candidateLat = candidateProfile?.latitude ?? null;
      const candidateLng = candidateProfile?.longitude ?? null;

      let distanceKm = 0;
      if (myLat !== null && myLng !== null && candidateLat !== null && candidateLng !== null) {
        distanceKm = haversineKm(myLat, myLng, candidateLat, candidateLng);
      }

      if (distanceKm > maxKm && maxKm < 9999) continue;

      const passes: Record<string, boolean> = {};
      if (criteria.includes("songs")) passes.songs = songsInCommon >= minSongs;
      if (criteria.includes("genre")) passes.genre = !!genreMatches;
      if (criteria.includes("artist")) passes.artist = !!artistMatches;

      const criteriaResults = Object.values(passes);
      const passesFilter =
        logic === "any"
          ? criteriaResults.some(Boolean)
          : criteriaResults.every(Boolean);

      if (!passesFilter) continue;

      const photos = await storage.getUserPhotos(candidate.id);
      matches.push({
        user: {
          id: candidate.id,
          nickname: candidate.nickname,
          userType: candidate.userType,
          photos: photos.map((p) => p.photoUrl),
        },
        songsInCommon,
        sharedArtist,
        sharedGenre,
        distanceKm: Math.round(distanceKm),
      });
    }

    matches.sort((a, b) => b.songsInCommon - a.songsInCommon);

    return res.json({ matches });
  } catch (error) {
    console.error("[Spotify] match/music error:", error);
    return res.status(500).json({ message: "Errore durante il calcolo dei match musicali" });
  }
}

router.get("/match/music", requireAuth, handleMusicMatch);

export default router;
