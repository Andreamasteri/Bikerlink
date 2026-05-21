export type PlayerSource = "radio" | "library" | "file" | "preview";
export type RepeatMode = "off" | "track" | "queue";

export interface PlayerTrack {
  id: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration?: number;
  source: PlayerSource;
}

export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  favicon?: string;
  country?: string;
  votes?: number;
  bitrate?: number;
  tags?: string;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTrack: PlayerTrack | null;
  queue: PlayerTrack[];
  queueIndex: number;
  position: number;
  duration: number;
  isBuffering: boolean;
  source: PlayerSource;
  isAvailable: boolean;
  sleepTimer: number | null;
  sleepTimerEnd: number | null;
  favoriteStationIds: string[];
  selectedGenre: string | null;
  isShuffled: boolean;
  repeatMode: RepeatMode;
}

export interface PlayerContextType extends PlayerState {
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  playTrack: (track: PlayerTrack) => void;
  playQueue: (tracks: PlayerTrack[], startIndex?: number) => void;
  playRadioStation: (station: RadioStation, genreId?: string) => void;
  next: () => void;
  prev: () => void;
  seekTo: (position: number) => void;
  setSleepTimer: (minutes: number | null) => void;
  toggleFavorite: (stationId: string) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setSelectedGenre: (genre: string | null) => void;
}
