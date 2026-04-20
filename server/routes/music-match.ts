import { type Request, type Response } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { userMusicTracks, users } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

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

    const candidateRows = await db
      .selectDistinct({ userId: userMusicTracks.userId })
      .from(userMusicTracks)
      .where(sql`${userMusicTracks.userId} != ${userId}`);

    const candidateUserIds = candidateRows.map((c) => c.userId);
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
    console.error("[MusicMatch] match/music error:", error);
    return res.status(500).json({ message: "Errore durante il calcolo dei match musicali" });
  }
}
