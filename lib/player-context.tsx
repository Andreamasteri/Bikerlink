import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type RNTrackPlayer from "react-native-track-player";
import type {
  Capability as CapabilityType,
  State as StateType,
  Event as EventType,
  RepeatMode as RepeatModeType,
} from "react-native-track-player";

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

interface PlayerState {
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

interface PlayerContextType extends PlayerState {
  play: () => void;
  pause: () => void;
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

const PlayerContext = createContext<PlayerContextType | null>(null);

const FAVORITES_KEY = "player_favorite_stations";
const SLEEP_KEY = "player_sleep_timer";

let TrackPlayer: typeof RNTrackPlayer | null = null;
let Capability: typeof CapabilityType | null = null;
let State: typeof StateType | null = null;
let Event: typeof EventType | null = null;
let RepeatModeRNTP: typeof RepeatModeType | null = null;
let playerReady = false;

async function initTrackPlayer(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const module = await import("react-native-track-player");
    TrackPlayer = module.default;
    Capability = module.Capability;
    State = module.State;
    Event = module.Event;
    RepeatModeRNTP = module.RepeatMode;

    // Registra il playback service PRIMA di setupPlayer — obbligatorio per
    // i controlli lockscreen / notification bar nella build nativa.
    const { PlaybackService } = await import("./player-service");
    TrackPlayer.registerPlaybackService(() => PlaybackService);

    await TrackPlayer.setupPlayer({
      maxCacheSize: 1024 * 5,
    });

    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.Stop,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
      notificationCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
      ],
      progressUpdateEventInterval: 1000,
    });

    playerReady = true;
    return true;
  } catch (err) {
    console.warn("[Player] initTrackPlayer error:", err);
    return false;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<PlayerTrack | null>(null);
  const [queue, setQueue] = useState<PlayerTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [source, setSource] = useState<PlayerSource>("radio");
  const [sleepTimer, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerEnd, setSleepTimerEnd] = useState<number | null>(null);
  const [favoriteStationIds, setFavoriteStationIds] = useState<string[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");

  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ok = await initTrackPlayer();
      if (!mounted) return;
      setIsAvailable(ok);
    })();

    AsyncStorage.getItem(FAVORITES_KEY).then((v) => {
      if (v && mounted) {
        try {
          setFavoriteStationIds(JSON.parse(v));
        } catch (err) {
          console.warn("[Player] favorites parse error:", err);
        }
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isAvailable || !TrackPlayer || !Event) return;

    let subs: Array<{ remove?: () => void }> = [];
    try {
      subs = [
        TrackPlayer.addEventListener(
          Event.PlaybackState,
          (data: { state: unknown }) => {
            if (!State) return;
            setIsPlaying(data.state === State.Playing);
            setIsBuffering(
              data.state === State.Buffering || data.state === State.Loading
            );
          }
        ),
        TrackPlayer.addEventListener(
          Event.PlaybackActiveTrackChanged,
          (data: { track?: { id?: string; url: string; title?: string; artist?: string; album?: string; artwork?: string; duration?: number; source?: string } }) => {
            if (data.track) {
              const t = data.track;
              setCurrentTrack({
                id: t.id || t.url,
                url: t.url,
                title: t.title || "Traccia sconosciuta",
                artist: t.artist || "",
                album: t.album,
                artwork: t.artwork,
                duration: t.duration,
                source: (t.source as PlayerSource) || "radio",
              });
            }
          }
        ),
        TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
          setIsPlaying(false);
        }),
      ];
    } catch (err) {
      console.warn("[Player] event listener setup error:", err);
    }

    positionIntervalRef.current = setInterval(async () => {
      if (!TrackPlayer || !playerReady) return;
      try {
        const pos = await TrackPlayer.getPosition();
        const dur = await TrackPlayer.getDuration();
        setPosition(isNaN(pos) ? 0 : pos);
        setDuration(isNaN(dur) ? 0 : dur);
      } catch (err) {
        console.warn("[Player] position poll error:", err);
      }
    }, 1000);

    return () => {
      subs.forEach((s) => { try { s.remove?.(); } catch (err) { console.warn("[Player] sub remove error:", err); } });
      if (positionIntervalRef.current) clearInterval(positionIntervalRef.current);
    };
  }, [isAvailable]);

  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (!sleepTimerEnd) return;
    const ms = sleepTimerEnd - Date.now();
    if (ms <= 0) { pause(); return; }
    sleepTimerRef.current = setTimeout(() => {
      pause();
      setSleepTimerEnd(null);
      setSleepTimerMinutes(null);
    }, ms);
    return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
  }, [sleepTimerEnd]);

  const play = useCallback(async () => {
    if (!TrackPlayer || !playerReady) return;
    try { await TrackPlayer.play(); } catch (err) { console.warn("[Player] play error:", err); }
  }, []);

  const pause = useCallback(async () => {
    if (!TrackPlayer || !playerReady) return;
    try { await TrackPlayer.pause(); } catch (err) { console.warn("[Player] pause error:", err); }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause(); else play();
  }, [isPlaying, play, pause]);

  const playTrack = useCallback(async (track: PlayerTrack) => {
    if (!TrackPlayer || !playerReady) return;
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add([{
        id: track.id,
        url: track.url,
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork: track.artwork,
        duration: track.duration,
        source: track.source,
      }]);
      await TrackPlayer.play();
      setQueue([track]);
      setQueueIndex(0);
      setSource(track.source);
      setCurrentTrack(track);
    } catch (err) {
      console.warn("[Player] playTrack error:", err);
    }
  }, []);

  const playQueue = useCallback(async (tracks: PlayerTrack[], startIndex = 0) => {
    if (!TrackPlayer || !playerReady || tracks.length === 0) return;
    try {
      await TrackPlayer.reset();
      const rnTracks = tracks.map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork: t.artwork,
        duration: t.duration,
        source: t.source,
      }));
      await TrackPlayer.add(rnTracks);
      if (startIndex > 0) await TrackPlayer.skip(startIndex);
      await TrackPlayer.play();
      setQueue(tracks);
      setQueueIndex(startIndex);
      setSource(tracks[startIndex]?.source || "preview");
      setCurrentTrack(tracks[startIndex] || null);
    } catch (err) {
      console.warn("[Player] playQueue error:", err);
    }
  }, []);

  const playRadioStation = useCallback(async (station: RadioStation, genreId?: string) => {
    if (!TrackPlayer || !playerReady) return;
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add([{
        id: station.id,
        url: station.streamUrl,
        title: station.name,
        artist: station.country || "Radio",
        artwork: station.favicon || undefined,
        isLiveStream: true,
        source: "radio",
      }]);
      await TrackPlayer.play();
      const track: PlayerTrack = {
        id: station.id,
        url: station.streamUrl,
        title: station.name,
        artist: station.country || "Radio",
        artwork: station.favicon || undefined,
        source: "radio",
      };
      setQueue([track]);
      setQueueIndex(0);
      setSource("radio");
      setCurrentTrack(track);
      if (genreId) setSelectedGenre(genreId);
    } catch (err) {
      console.warn("[Player] playRadioStation error:", err);
    }
  }, []);

  const next = useCallback(async () => {
    if (!TrackPlayer || !playerReady) return;
    try { await TrackPlayer.skipToNext(); } catch (err) { console.warn("[Player] next error:", err); }
  }, []);

  const prev = useCallback(async () => {
    if (!TrackPlayer || !playerReady) return;
    try { await TrackPlayer.skipToPrevious(); } catch (err) { console.warn("[Player] prev error:", err); }
  }, []);

  const seekTo = useCallback(async (pos: number) => {
    if (!TrackPlayer || !playerReady) return;
    try { await TrackPlayer.seekTo(pos); } catch (err) { console.warn("[Player] seekTo error:", err); }
  }, []);

  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null) {
      setSleepTimerEnd(null);
    } else {
      setSleepTimerEnd(Date.now() + minutes * 60 * 1000);
    }
    AsyncStorage.setItem(SLEEP_KEY, JSON.stringify(minutes)).catch((err) => { console.warn("[Player] sleep timer persist error:", err); });
  }, []);

  const toggleFavorite = useCallback((stationId: string) => {
    setFavoriteStationIds((prev) => {
      const next = prev.includes(stationId)
        ? prev.filter((id) => id !== stationId)
        : [...prev, stationId];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch((err) => { console.warn("[Player] favorites persist error:", err); });
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => setIsShuffled((v) => !v), []);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const next: RepeatMode =
        prev === "off" ? "track" : prev === "track" ? "queue" : "off";
      if (TrackPlayer && playerReady && RepeatModeRNTP) {
        try {
          const rnMode =
            next === "track"
              ? RepeatModeRNTP.Track
              : next === "queue"
              ? RepeatModeRNTP.Queue
              : RepeatModeRNTP.Off;
          TrackPlayer.setRepeatMode(rnMode);
        } catch (err) {
          console.warn("[Player] setRepeatMode error:", err);
        }
      }
      return next;
    });
  }, []);

  const value: PlayerContextType = {
    isAvailable,
    isPlaying,
    currentTrack,
    queue,
    queueIndex,
    position,
    duration,
    isBuffering,
    source,
    sleepTimer,
    sleepTimerEnd,
    favoriteStationIds,
    selectedGenre,
    isShuffled,
    repeatMode,
    play,
    pause,
    togglePlay,
    playTrack,
    playQueue,
    playRadioStation,
    next,
    prev,
    seekTo,
    setSleepTimer,
    toggleFavorite,
    toggleShuffle,
    toggleRepeat,
    setSelectedGenre,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
