import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db, withDbRetry } from "../../db";
import { storage } from "../../storage";
import {
  userMusicTracks,
  sharedPlaylists,
  users,
  messages,
  conversationParticipants,
} from "@shared/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { allLimited } from "../../lib/concurrency";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.post("/share-playlist", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { toUserId, conversationId } = req.body as { toUserId?: string; conversationId?: string };
    if (!toUserId) {
      return sendError(res, 400, "toUserId è obbligatorio");
    }

    const tracks = await db
      .select()
      .from(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")))
      .orderBy(userMusicTracks.trackName);

    if (tracks.length === 0) {
      return sendError(res, 400, "Nessun brano Last.fm sincronizzato. Sincronizza prima nel tab Musica.");
    }

    if (conversationId) {
      const participants = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));

      const participantIds = participants.map((p) => p.userId);
      if (!participantIds.includes(userId)) {
        return sendError(res, 403, "Non sei un partecipante di questa conversazione");
      }
      if (!participantIds.includes(toUserId)) {
        return sendError(res, 403, "Il destinatario non è un partecipante di questa conversazione");
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
    return sendError(res, 500, "Errore durante la condivisione della libreria");
  }
});

router.get("/shared-playlists", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const playlists = await withDbRetry(() => db
      .select()
      .from(sharedPlaylists)
      .where(eq(sharedPlaylists.toUserId, userId))
      .orderBy(sql`${sharedPlaylists.sharedAt} DESC`));

    const fromUserIds = [...new Set(playlists.map((p) => p.fromUserId))];
    const fromUsersData =
      fromUserIds.length > 0
        ? await withDbRetry(() => db.select().from(users).where(inArray(users.id, fromUserIds)))
        : [];

    const fromUserMap = new Map(fromUsersData.map((u) => [u.id, u]));

    const result = await allLimited(
      playlists.map((playlist) => async () => {
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
    return sendError(res, 500, "Errore nel recupero delle playlist ricevute");
  }
});

router.get("/shared-playlists/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const playlistId = parseInt(req.params.id as string, 10);
    if (isNaN(playlistId)) {
      return sendError(res, 400, "ID non valido");
    }

    const [playlist] = await withDbRetry(() => db
      .select()
      .from(sharedPlaylists)
      .where(and(eq(sharedPlaylists.id, playlistId), eq(sharedPlaylists.toUserId, userId)))
      .limit(1));

    if (!playlist) {
      return sendError(res, 404, "Playlist non trovata");
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
    return sendError(res, 500, "Errore nel recupero della playlist");
  }
});

router.post("/merge-playlist/:playlistId", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const playlistId = parseInt(req.params.playlistId as string, 10);
    if (isNaN(playlistId)) {
      return sendError(res, 400, "ID playlist non valido");
    }

    const [playlist] = await db
      .select()
      .from(sharedPlaylists)
      .where(and(eq(sharedPlaylists.id, playlistId), eq(sharedPlaylists.toUserId, userId)))
      .limit(1);

    if (!playlist) {
      return sendError(res, 404, "Playlist non trovata");
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
      const genres = Array.isArray(track.genres) ? track.genres : [];
      const result = await db
        .insert(userMusicTracks)
        .values({
          userId,
          provider: "lastfm",
          lastfmTrackId: (track.trackId ?? track.trackName) as string,
          trackName: (track.trackName ?? "").slice(0, 500),
          artistId: (track.artistId ?? track.artistName) as string,
          artistName: (track.artistName ?? "").slice(0, 300),
          albumName: track.albumName?.slice(0, 500) ?? null,
          genres,
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
    return sendError(res, 500, "Errore durante il merge della playlist");
  }
});

export default router;
