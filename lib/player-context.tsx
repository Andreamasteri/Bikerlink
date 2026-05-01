import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { Platform, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAudioPlayer,
  setAudioModeAsync,
} from "expo-audio";
import type { AudioPlayer as ExpoAudioPlayer, AudioStatus } from "expo-audio";

type AudioPlayerInstance = ExpoAudioPlayer & {
  addListener: (
    event: "playbackStatusUpdate",
    listener: (status: AudioStatus) => void
  ) => { remove: () => void };
};
import { getApiUrl } from "@/lib/query-client";

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

const PlayerContext = createContext<PlayerContextType | null>(null);

const FAVORITES_KEY = "player_favorite_stations";
const SLEEP_KEY = "player_sleep_timer";

const AUDIO_MODE_ACTIVE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: "doNotMix",
} as const;

const PLAYER_UPDATE_INTERVAL_MS = 500;
const RADIO_LOAD_TIMEOUT_MS = 30_000;

const AUDIO_MODE_INACTIVE = {
  allowsRecording: false,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  interruptionMode: "duckOthers",
} as const;

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

  const playerRef = useRef<AudioPlayerInstance | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const queueRef = useRef<PlayerTrack[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<RepeatMode>("off");
  const isPlayingRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const radioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await setAudioModeAsync(AUDIO_MODE_ACTIVE);
        if (mounted) setIsAvailable(true);
      } catch (err) {
        console.warn("[Player] Audio mode setup error:", err);
        if (mounted) setIsAvailable(true);
      }
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
      if (radioTimeoutRef.current) {
        clearTimeout(radioTimeoutRef.current);
        radioTimeoutRef.current = null;
      }
      listenerRef.current?.remove();
      listenerRef.current = null;
      try { playerRef.current?.pause(); } catch (err) { console.debug("[Player] unmount pause error:", err); }
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

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

  const onPlaybackStatus = useCallback((status: AudioStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.playing);
    setIsBuffering(status.isBuffering);
    setPosition(status.currentTime);
    setDuration(status.duration ?? 0);

    if (status.didJustFinish && !status.loop) {
      const mode = repeatModeRef.current;
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (mode === "track") {
        if (playerRef.current) {
          playerRef.current.seekTo(0);
          playerRef.current.play();
        }
      } else if (mode === "queue" || idx < q.length - 1) {
        const nextIdx = (idx + 1) % q.length;
        loadAndPlay(q[nextIdx], nextIdx);
      } else {
        setIsPlaying(false);
      }
    }
  }, []);

  const destroyPlayer = useCallback(() => {
    if (radioTimeoutRef.current) {
      clearTimeout(radioTimeoutRef.current);
      radioTimeoutRef.current = null;
    }
    if (listenerRef.current) {
      listenerRef.current.remove();
      listenerRef.current = null;
    }
    if (playerRef.current) {
      try { playerRef.current.clearLockScreenControls(); } catch (err) { console.debug("[Player] clearLockScreen error:", err); }
      try { playerRef.current.pause(); } catch (err) { console.debug("[Player] destroyPlayer pause error:", err); }
      playerRef.current.loop = false;
      playerRef.current.remove();
      playerRef.current = null;
    }
  }, []);

  const loadAndPlay = useCallback(async (track: PlayerTrack, trackIndex: number) => {
    const gen = ++loadGenRef.current;
    try {
      destroyPlayer();

      await setAudioModeAsync(AUDIO_MODE_ACTIVE);

      if (gen !== loadGenRef.current) return;

      const player = createAudioPlayer(
        { uri: track.url },
        { updateInterval: PLAYER_UPDATE_INTERVAL_MS }
      ) as AudioPlayerInstance;
      playerRef.current = player;

      const sub = player.addListener("playbackStatusUpdate", (status) => {
        if (status.isLoaded && radioTimeoutRef.current) {
          clearTimeout(radioTimeoutRef.current);
          radioTimeoutRef.current = null;
        }
        onPlaybackStatus(status);
      });
      listenerRef.current = sub;

      if (track.source === "radio") {
        const capturedGen = gen;
        radioTimeoutRef.current = setTimeout(() => {
          radioTimeoutRef.current = null;
          if (capturedGen !== loadGenRef.current) return;
          if (!playerRef.current) return;
          console.warn("[Player] Radio stream load timeout — destroying player");
          destroyPlayer();
          setIsBuffering(false);
          setCurrentTrack(null);
          setIsPlaying(false);
          Alert.alert(
            "Stazione non raggiungibile",
            "Il caricamento della stazione ha impiegato troppo tempo. Controlla la connessione o prova un'altra stazione."
          );
        }, RADIO_LOAD_TIMEOUT_MS);
      }

      player.play();

      try {
        player.setActiveForLockScreen(
          true,
          {
            title: track.title,
            artist: track.artist,
            albumTitle: track.album,
            artworkUrl: track.artwork,
          },
          { showSeekForward: true, showSeekBackward: true }
        );
      } catch (err) {
        console.debug("[Player] setActiveForLockScreen error:", err);
      }

      setCurrentTrack(track);
      setQueueIndex(trackIndex);
      setSource(track.source);
      setIsPlaying(true);
      setIsBuffering(true);
      setPosition(0);
    } catch (err) {
      console.warn("[Player] loadAndPlay error:", err);
      const msg = track.source === "radio"
        ? "Impossibile riprodurre questa stazione. Prova un'altra."
        : "Impossibile riprodurre questo brano.";
      Alert.alert("Riproduzione non riuscita", msg);
    }
  }, [onPlaybackStatus, destroyPlayer]);

  const play = useCallback(() => {
    try { playerRef.current?.play(); } catch (err) { console.warn("[Player] play error:", err); }
  }, []);

  const pause = useCallback(() => {
    try { playerRef.current?.pause(); } catch (err) { console.warn("[Player] pause error:", err); }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause(); else play();
  }, [play, pause]);

  const stop = useCallback(() => {
    loadGenRef.current++;
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setSleepTimerEnd(null);
    setSleepTimerMinutes(null);
    try {
      destroyPlayer();
    } catch (err) { console.warn("[Player] stop error:", err); }
    setAudioModeAsync(AUDIO_MODE_INACTIVE).catch((err) => console.warn("[Player] audio mode reset error:", err));
    setCurrentTrack(null);
    setQueue([]);
    queueRef.current = [];
    setIsPlaying(false);
    isPlayingRef.current = false;
    setPosition(0);
    setDuration(0);
  }, [destroyPlayer]);

  const playTrack = useCallback(async (track: PlayerTrack) => {
    setQueue([track]);
    queueRef.current = [track];
    await loadAndPlay(track, 0);
  }, [loadAndPlay]);

  const playQueue = useCallback(async (tracks: PlayerTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    setQueue(tracks);
    queueRef.current = tracks;
    await loadAndPlay(tracks[startIndex], startIndex);
  }, [loadAndPlay]);

  const toProxyUrl = useCallback((streamUrl: string): string => {
    const base = getApiUrl();
    return `${base}/api/music/radio/stream?url=${encodeURIComponent(streamUrl)}`;
  }, []);

  const playRadioStation = useCallback(async (station: RadioStation, genreId?: string) => {
    if (!station.streamUrl) {
      Alert.alert("Stazione non disponibile", "Questa stazione non ha un URL di streaming valido.");
      return;
    }
    const track: PlayerTrack = {
      id: station.id,
      url: toProxyUrl(station.streamUrl),
      title: station.name,
      artist: station.country || "Radio",
      artwork: station.favicon || undefined,
      source: "radio",
    };
    setQueue([track]);
    queueRef.current = [track];
    await loadAndPlay(track, 0);
    if (genreId) setSelectedGenre(genreId);
  }, [loadAndPlay, toProxyUrl]);

  const next = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length <= 1) return;
    const nextIdx = (idx + 1) % q.length;
    await loadAndPlay(q[nextIdx], nextIdx);
  }, [loadAndPlay]);

  const prev = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (position > 3) {
      try { await playerRef.current?.seekTo(0); } catch (err) { console.warn("[Player] rewind error:", err); }
      return;
    }
    if (q.length <= 1) return;
    const prevIdx = idx === 0 ? q.length - 1 : idx - 1;
    await loadAndPlay(q[prevIdx], prevIdx);
  }, [loadAndPlay, position]);

  const seekTo = useCallback(async (pos: number) => {
    try { await playerRef.current?.seekTo(pos); } catch (err) { console.warn("[Player] seekTo error:", err); }
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
      repeatModeRef.current = next;
      if (playerRef.current) {
        playerRef.current.loop = next === "track";
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
    stop,
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
