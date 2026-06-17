import { db } from "../../db";
import { userMusicTracks, userPlaylistSnapshots } from "@shared/db";
import { eq } from "drizzle-orm";
import { lastfmApiCall, lastfmPublicCall } from "./utils";

export async function syncLastfmTracks(userId: string, sessionKey: string, username: string): Promise<number> {
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
    } catch (err) {
      console.warn(`[Last.fm] Failed to fetch tags for artist ${artistName}:`, err);
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
    } catch (err) {
      console.warn(`[Last.fm] Failed to sync track ${trackName} for user ${userId}:`, err);
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
        const snapshotTracks = snapshot.tracksJson as Array<{
          lastfmTrackId?: string;
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
          const resolvedTrackId = st.lastfmTrackId;
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
          } catch (err) {
            console.warn(`[Last.fm] Failed to restore track ${st.trackName} from snapshot for user ${userId}:`, err);
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
