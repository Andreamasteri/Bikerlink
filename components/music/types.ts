import { RadioStation } from "@/lib/player-context";

export const LASTFM_RED = "#D51007";
export const LASTFM_SUGGEST_KEY = "radio_use_lastfm";

export type Tab = "brani" | "match" | "ricevute" | "radio" | "telefono";

export interface PreviewResult {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string | null;
  previewUrl: string;
  artworkUrl: string | null;
  durationMs: number;
  genre: string | null;
}

export interface SearchTrack {
  lastfmTrackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  albumName?: string | null;
  imageUrl?: string | null;
  genres: string[];
  popularity: number;
}

export interface LibraryTrack {
  id: number;
  lastfmTrackId: string;
  trackName: string;
  artistName: string;
  albumName?: string | null;
  imageUrl?: string | null;
  popularity: number;
  addedAt: string;
}

export interface MusicMatch {
  user: { id: string; nickname: string; userType: string; photos: string[] };
  songsInCommon: number;
  sharedArtist: string | null;
  sharedGenre: string | null;
  distanceKm: number;
}

export interface SharedPlaylistEntry {
  id: number;
  fromUser: { id: string; nickname: string; photos: string[] };
  trackCount: number;
  sharedAt: string;
  mergedAt: string | null;
  tracks: Array<{ trackId: string; trackName: string; artistId: string; artistName: string }>;
}

export interface ChatConversation {
  id: string;
  participants: Array<{ id: string; nickname: string; avatarUrl: string | null }>;
  lastMessage?: { content?: string } | null;
}

export interface RadioGenre {
  id: string;
  label: string;
  icon: string;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function formatDurationSecs(secs: number): string {
  if (!isFinite(secs) || secs < 0) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function parseAudioFilename(filename: string): { title: string; artist: string } {
  const base = (filename ?? "").replace(/\.[^.]+$/, "").trim();
  const sep = " - ";
  const idx = base.indexOf(sep);
  if (idx > 0) {
    const artist = base.substring(0, idx).trim();
    const title = base.substring(idx + sep.length).trim();
    if (artist && title) return { artist, title };
  }
  return { artist: "Locale", title: base || "Brano" };
}
