import { sendError } from "../../lib/api-response";
import { Router, type Request, type Response } from "express";
import { db } from "../../db";
import { userMusicTracks, userLastfmSessions } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isLastfmConfigured, lastfmPublicCall } from "./utils";
import { syncLastfmTracks } from "./sync-utils";

import { requireAuth } from "../../lib/auth-middleware";

const router = Router();

router.get("/search", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return sendError(res, 503, "Last.fm non configurato.");
  }
  const q = (req.query.q as string ?? "").trim();
  if (q.length < 2) return sendError(res, 400, "Query troppo corta");
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
    return sendError(res, 500, "Errore nella ricerca Last.fm");
  }
});

router.post("/sync", requireAuth, async (req: Request, res: Response) => {
  if (!isLastfmConfigured()) {
    return sendError(res, 503, "Last.fm non configurato.");
  }
  const userId = req.session.userId!;
  try {
    const [session] = await db
      .select()
      .from(userLastfmSessions)
      .where(eq(userLastfmSessions.userId, userId))
      .limit(1);

    if (!session) return sendError(res, 401, "Account Last.fm non collegato");

    const trackCount = await syncLastfmTracks(userId, session.sessionKey, session.lastfmUsername);
    return res.json({ synced: trackCount });
  } catch (err) {
    console.error("[Last.fm sync]", err);
    return sendError(res, 500, "Errore durante la sincronizzazione");
  }
});

router.get("/", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  try {
    const tracks = await db
      .select()
      .from(userMusicTracks)
      .where(and(eq(userMusicTracks.userId, userId), eq(userMusicTracks.provider, "lastfm")));
    return res.json({ tracks });
  } catch (err) {
    console.error("[Last.fm tracks]", err);
    return sendError(res, 500, "Errore nel recupero brani");
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
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
    return sendError(res, 400, "Dati brano mancanti");
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
    return sendError(res, 500, "Errore nell'aggiunta del brano");
  }
});

router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { id } = req.params;
  try {
    await db
      .delete(userMusicTracks)
      .where(
        and(
          eq(userMusicTracks.userId, userId),
          eq(userMusicTracks.lastfmTrackId, id as string),
          eq(userMusicTracks.provider, "lastfm")
        )
      );
    return res.json({ deleted: true });
  } catch (err) {
    console.error("[Last.fm delete track]", err);
    return sendError(res, 500, "Errore nell'eliminazione del brano");
  }
});

export default router;
