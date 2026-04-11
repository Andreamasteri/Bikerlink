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
import { Audio, AVPlaybackStatus } from "expo-av";

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

  const soundRef = useRef<Audio.Sound | null>(null);
  const queueRef = useRef<PlayerTrack[]>([]);
  const queueIndexRef = useRef(0);
  const repeatModeRef = useRef<RepeatMode>("off");
  const isPlayingRef = useRef(false);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
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
      soundRef.current?.unloadAsync().catch(() => {});
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

  const onPlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) console.warn("[Player] Playback error:", status.error);
      return;
    }
    setIsPlaying(status.isPlaying);
    setIsBuffering(status.isBuffering);
    setPosition(status.positionMillis / 1000);
    setDuration((status.durationMillis ?? 0) / 1000);

    if (status.didJustFinish && !status.isLooping) {
      const mode = repeatModeRef.current;
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (mode === "track") {
        soundRef.current?.replayAsync().catch((err) => console.warn("[Player] replay error:", err));
      } else if (mode === "queue" || idx < q.length - 1) {
        const nextIdx = (idx + 1) % q.length;
        loadAndPlay(q[nextIdx], nextIdx);
      } else {
        setIsPlaying(false);
      }
    }
  }, []);

  const loadAndPlay = useCallback(async (track: PlayerTrack, trackIndex: number) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true, progressUpdateIntervalMillis: 1000 },
        onPlaybackStatus
      );
      soundRef.current = sound;
      setCurrentTrack(track);
      setQueueIndex(trackIndex);
      setSource(track.source);
      setIsPlaying(true);
      setIsBuffering(false);
      setPosition(0);
    } catch (err) {
      console.warn("[Player] loadAndPlay error:", err);
      const msg = track.source === "radio"
        ? "Impossibile riprodurre questa stazione. Prova un'altra."
        : "Impossibile riprodurre questo brano.";
      Alert.alert("Riproduzione non riuscita", msg);
    }
  }, [onPlaybackStatus]);

  const play = useCallback(async () => {
    try { await soundRef.current?.playAsync(); } catch (err) { console.warn("[Player] play error:", err); }
  }, []);

  const pause = useCallback(async () => {
    try { await soundRef.current?.pauseAsync(); } catch (err) { console.warn("[Player] pause error:", err); }
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause(); else play();
  }, [play, pause]);

  const stop = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
    } catch (err) { console.warn("[Player] stop error:", err); }
    setCurrentTrack(null);
    setQueue([]);
    queueRef.current = [];
    setIsPlaying(false);
    isPlayingRef.current = false;
    setPosition(0);
    setDuration(0);
  }, []);

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

  const playRadioStation = useCallback(async (station: RadioStation, genreId?: string) => {
    if (!station.streamUrl) {
      Alert.alert("Stazione non disponibile", "Questa stazione non ha un URL di streaming valido.");
      return;
    }
    const track: PlayerTrack = {
      id: station.id,
      url: station.streamUrl,
      title: station.name,
      artist: station.country || "Radio",
      artwork: station.favicon || undefined,
      source: "radio",
    };
    setQueue([track]);
    queueRef.current = [track];
    await loadAndPlay(track, 0);
    if (genreId) setSelectedGenre(genreId);
  }, [loadAndPlay]);

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
      try { await soundRef.current?.setPositionAsync(0); } catch (err) { console.warn("[Player] rewind error:", err); }
      return;
    }
    if (q.length <= 1) return;
    const prevIdx = idx === 0 ? q.length - 1 : idx - 1;
    await loadAndPlay(q[prevIdx], prevIdx);
  }, [loadAndPlay, position]);

  const seekTo = useCallback(async (pos: number) => {
    try { await soundRef.current?.setPositionAsync(pos * 1000); } catch (err) { console.warn("[Player] seekTo error:", err); }
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
      if (next === "track" && soundRef.current) {
        soundRef.current.setIsLoopingAsync(true).catch((err) => console.warn("[Player] setLooping error:", err));
      } else if (soundRef.current) {
        soundRef.current.setIsLoopingAsync(false).catch((err) => console.warn("[Player] setLooping error:", err));
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
