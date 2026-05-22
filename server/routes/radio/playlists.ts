import { Router, Request, Response } from "express";
import { db } from "../../db";
import { userLastfmSessions, userMusicTracks } from "@shared/db";
import { eq } from "drizzle-orm";
import { requireAuth, buildLastfmUrl, aggregateGenresFromTags } from "./utils";

const router = Router();

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
              genreScore[genre] = (genreScore[genre] ?? 0) + (score as number);
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
            genreScore[genre] = (genreScore[genre] ?? 0) + (score as number);
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
          const mapped = aggregateGenresFromTags([{ name: genre, count: 1 }], 0.6);
          for (const [g, s] of Object.entries(mapped)) {
            genreScore[g] = (genreScore[g] ?? 0) + (s as number);
          }
        }
      }

      const lastfmTracks = savedTracks.filter((t) => t.provider === "lastfm");
      const uniqueArtists = [...new Set(lastfmTracks.map((t) => t.artistName).filter(Boolean))].slice(0, 10) as string[];
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
              genreScore[genre] = (genreScore[genre] ?? 0) + (score as number);
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
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([id]) => id)
      .slice(0, 5);

    return res.json(sorted);
  } catch (err) {
    console.error("[radio] suggested-genres error:", err);
    return res.json([]);
  }
});

export default router;
