import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { Alert, AppState } from "react-native";
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
import {
  PlayerTrack,
  PlayerSource,
  RadioStation,
  RepeatMode,
  PlayerContextType,
} from "./player-context-types";
import { usePlayerRefs } from "./use-player-refs";
import { PlayerContext } from "./player-context-internal";

const FAVORITES_KEY = "player_favorite_stations";
const SHUFFLE_KEY = "player_shuffle";
const SLEEP_KEY = "player_sleep_timer";

const AUDIO_MODE_ACTIVE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: "doNotMix",
} as const;

const AUDIO_MODE_INACTIVE = {
  allowsRecording: false,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  interruptionMode: "duckOthers",
} as const;

const PLAYER_UPDATE_INTERVAL_MS = 500;
const RADIO_LOAD_TIMEOUT_MS = 30_000;

const usePlayerActions = (
  loadAndPlay: (track: PlayerTrack, trackIndex: number) => Promise<void>,
  destroyPlayer: () => void,
  playerRef: React.MutableRefObject<AudioPlayerInstance | null>,
  isPlayingRef: React.MutableRefObject<boolean>,
  queueRef: React.MutableRefObject<PlayerTrack[]>,
  queueIndexRef: React.MutableRefObject<number>,
  shuffleHistoryRef: React.MutableRefObject<Set<number>>,
  userPausedRef: React.MutableRefObject<boolean>,
  wasInterruptedRef: React.MutableRefObject<boolean>,
  recoveryTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  sleepTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  loadGenRef: React.MutableRefObject<number>,
  setQueue: React.Dispatch<React.SetStateAction<PlayerTrack[]>>,
  setCurrentTrack: React.Dispatch<React.SetStateAction<PlayerTrack | null>>,
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>,
  setPosition: React.Dispatch<React.SetStateAction<number>>,
  setDuration: React.Dispatch<React.SetStateAction<number>>,
  setSleepTimerEnd: React.Dispatch<React.SetStateAction<number | null>>,
  setSleepTimerMinutes: React.Dispatch<React.SetStateAction<number | null>>,
  setFavoriteStationIds: React.Dispatch<React.SetStateAction<string[]>>,
  setIsShuffled: React.Dispatch<React.SetStateAction<boolean>>,
  setRepeatMode: React.Dispatch<React.SetStateAction<RepeatMode>>,
  setSelectedGenre: React.Dispatch<React.SetStateAction<string | null>>,
  toProxyUrl: (url: string) => string,
  getNextIndex: (q: PlayerTrack[], idx: number) => number,
  position: number
) => {
  const play = useCallback(() => {
    userPausedRef.current = false;
    wasInterruptedRef.current = false;
    if (recoveryTimeoutRef.current) { clearTimeout(recoveryTimeoutRef.current); recoveryTimeoutRef.current = null; }
    try { playerRef.current?.play(); } catch (err) { console.warn("[Player] play error:", err); }
  }, [playerRef, recoveryTimeoutRef, userPausedRef, wasInterruptedRef]);

  const pause = useCallback(() => {
    userPausedRef.current = true;
    try { playerRef.current?.pause(); } catch (err) { console.warn("[Player] pause error:", err); }
  }, [playerRef, userPausedRef]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) pause(); else play();
  }, [play, pause, isPlayingRef]);

  const stop = useCallback(() => {
    loadGenRef.current++;
    userPausedRef.current = false;
    wasInterruptedRef.current = false;
    if (recoveryTimeoutRef.current) { clearTimeout(recoveryTimeoutRef.current); recoveryTimeoutRef.current = null; }
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
    setIsPlaying(false);
    setPosition(0);
    setDuration(0);
  }, [destroyPlayer, loadGenRef, recoveryTimeoutRef, setCurrentTrack, setDuration, setIsPlaying, setPosition, setQueue, setSleepTimerEnd, setSleepTimerMinutes, sleepTimerRef, userPausedRef, wasInterruptedRef]);

  const playTrack = useCallback(async (track: PlayerTrack) => {
    setQueue([track]);
    await loadAndPlay(track, 0);
  }, [loadAndPlay, setQueue]);

  const playQueue = useCallback(async (tracks: PlayerTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    shuffleHistoryRef.current = new Set();
    setQueue(tracks);
    await loadAndPlay(tracks[startIndex], startIndex);
  }, [loadAndPlay, setQueue, shuffleHistoryRef]);

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
    await loadAndPlay(track, 0);
    if (genreId) setSelectedGenre(genreId);
  }, [loadAndPlay, toProxyUrl, setQueue, setSelectedGenre]);

  const next = useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length <= 1) return;
    const nextIdx = getNextIndex(q, idx);
    await loadAndPlay(q[nextIdx], nextIdx);
  }, [loadAndPlay, getNextIndex, queueRef, queueIndexRef]);

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
  }, [loadAndPlay, position, queueRef, queueIndexRef, playerRef]);

  const seekTo = useCallback(async (pos: number) => {
    try { await playerRef.current?.seekTo(pos); } catch (err) { console.warn("[Player] seekTo error:", err); }
  }, [playerRef]);

  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null) {
      setSleepTimerEnd(null);
    } else {
      setSleepTimerEnd(Date.now() + minutes * 60 * 1000);
    }
    AsyncStorage.setItem(SLEEP_KEY, JSON.stringify(minutes)).catch((err) => { console.warn("[Player] sleep timer persist error:", err); });
  }, [setSleepTimerEnd, setSleepTimerMinutes]);

  const toggleFavorite = useCallback((stationId: string) => {
    setFavoriteStationIds((prev) => {
      const next = prev.includes(stationId)
        ? prev.filter((id) => id !== stationId)
        : [...prev, stationId];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch((err) => { console.warn("[Player] favorites persist error:", err); });
      return next;
    });
  }, [setFavoriteStationIds]);

  const toggleShuffle = useCallback(() => {
    setIsShuffled((v) => {
      const next = !v;
      shuffleHistoryRef.current = new Set();
      AsyncStorage.setItem(SHUFFLE_KEY, JSON.stringify(next)).catch((err) => {
        console.warn("[Player] shuffle persist error:", err);
      });
      return next;
    });
  }, [setIsShuffled, shuffleHistoryRef]);

  const toggleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const next: RepeatMode =
        prev === "off" ? "track" : prev === "track" ? "queue" : "off";
      if (playerRef.current) {
        playerRef.current.loop = next === "track";
      }
      return next;
    });
  }, [playerRef, setRepeatMode]);

  return {
    play,
    pause,
    togglePlay,
    stop,
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
  };
};

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

  const {
    queueRef,
    queueIndexRef,
    repeatModeRef,
    isPlayingRef,
    isShuffledRef,
  } = usePlayerRefs(queue, queueIndex, repeatMode, isPlaying, isShuffled);

  const playerRef = useRef<AudioPlayerInstance | null>(null);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const shuffleHistoryRef = useRef<Set<number>>(new Set());
  const userPausedRef = useRef(false);
  const wasInterruptedRef = useRef(false);
  const prevPlayingRef = useRef(false);
  const recoveryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const radioTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadGenRef = useRef(0);
  const loadAndPlayRef = useRef<((track: PlayerTrack, trackIndex: number) => Promise<void>) | null>(null);

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
        try { setFavoriteStationIds(JSON.parse(v)); } catch (err) { console.warn("[Player] favorites parse error:", err); }
      }
    });

    AsyncStorage.getItem(SHUFFLE_KEY).then((v) => {
      if (v && mounted) {
        try {
          const saved = JSON.parse(v);
          if (saved === true) setIsShuffled(true);
        } catch (err) { console.warn("[Player] shuffle parse error:", err); }
      }
    });

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && playerRef.current && wasInterruptedRef.current && !isPlayingRef.current) {
        setAudioModeAsync(AUDIO_MODE_ACTIVE).then(() => {
          if (playerRef.current && wasInterruptedRef.current && !isPlayingRef.current) {
            wasInterruptedRef.current = false;
            playerRef.current.play();
          }
        }).catch((err) => console.warn("[Player] interruption recovery error:", err));
      }
    });

    return () => {
      mounted = false;
      appStateSub.remove();
      if (radioTimeoutRef.current) { clearTimeout(radioTimeoutRef.current); radioTimeoutRef.current = null; }
      listenerRef.current?.remove();
      listenerRef.current = null;
      try { playerRef.current?.pause(); } catch (err) { console.debug("[Player] unmount pause error:", err); }
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, [isPlayingRef]);

  const getNextIndex = useCallback((q: PlayerTrack[], currentIdx: number): number => {
    if (!isShuffledRef.current) return (currentIdx + 1) % q.length;
    const history = shuffleHistoryRef.current;
    history.add(currentIdx);
    const unplayed: number[] = [];
    for (let i = 0; i < q.length; i++) if (!history.has(i)) unplayed.push(i);
    if (unplayed.length === 0) {
      shuffleHistoryRef.current = new Set([currentIdx]);
      const fresh: number[] = [];
      for (let i = 0; i < q.length; i++) if (i !== currentIdx) fresh.push(i);
      return fresh.length === 0 ? currentIdx : fresh[Math.floor(Math.random() * fresh.length)];
    }
    return unplayed[Math.floor(Math.random() * unplayed.length)];
  }, [isShuffledRef]);

  const scheduleRecovery = useCallback(function scheduleRecovery() {
    if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
    recoveryTimeoutRef.current = setTimeout(() => {
      recoveryTimeoutRef.current = null;
      if (!playerRef.current || !wasInterruptedRef.current || isPlayingRef.current || userPausedRef.current) return;
      setAudioModeAsync(AUDIO_MODE_ACTIVE)
        .then(() => {
          if (playerRef.current && wasInterruptedRef.current && !isPlayingRef.current && !userPausedRef.current) {
            playerRef.current.play();
            scheduleRecovery();
          }
        })
        .catch((err) => {
          console.warn("[Player] foreground recovery error:", err);
          if (wasInterruptedRef.current && !isPlayingRef.current && !userPausedRef.current) scheduleRecovery();
        });
    }, 5000);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: isPlayingRef is a ref (stable identity), not a reactive dependency
  }, []);

  const onPlaybackStatus = useCallback((status: AudioStatus) => {
    if (!status.isLoaded) return;
    if (prevPlayingRef.current && !status.playing && !status.didJustFinish && !userPausedRef.current) {
      wasInterruptedRef.current = true;
      scheduleRecovery();
    } else if (status.playing) {
      wasInterruptedRef.current = false;
      if (recoveryTimeoutRef.current) { clearTimeout(recoveryTimeoutRef.current); recoveryTimeoutRef.current = null; }
    }
    prevPlayingRef.current = status.playing;
    setIsPlaying(status.playing);
    setIsBuffering(status.isBuffering);
    setPosition(status.currentTime);
    setDuration(status.duration ?? 0);
    if (status.didJustFinish && !status.loop) {
      const mode = repeatModeRef.current;
      const q = queueRef.current;
      const idx = queueIndexRef.current;
      if (mode === "track") {
        if (playerRef.current) { playerRef.current.seekTo(0); playerRef.current.play(); }
      } else if (mode === "queue" || isShuffledRef.current || idx < q.length - 1) {
        const nextIdx = getNextIndex(q, idx);
        loadAndPlayRef.current?.(q[nextIdx], nextIdx);
      } else { setIsPlaying(false); }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional: isPlayingRef is a ref (stable identity), not a reactive dependency
  }, [getNextIndex, repeatModeRef, queueRef, queueIndexRef, isShuffledRef, isPlayingRef, scheduleRecovery]);

  const destroyPlayer = useCallback(() => {
    if (radioTimeoutRef.current) { clearTimeout(radioTimeoutRef.current); radioTimeoutRef.current = null; }
    if (listenerRef.current) { listenerRef.current.remove(); listenerRef.current = null; }
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
    userPausedRef.current = false;
    wasInterruptedRef.current = false;
    if (recoveryTimeoutRef.current) { clearTimeout(recoveryTimeoutRef.current); recoveryTimeoutRef.current = null; }
    try {
      destroyPlayer();
      await setAudioModeAsync(AUDIO_MODE_ACTIVE);
      if (gen !== loadGenRef.current) return;
      const player = createAudioPlayer({ uri: track.url }, { updateInterval: PLAYER_UPDATE_INTERVAL_MS }) as AudioPlayerInstance;
      playerRef.current = player;
      listenerRef.current = player.addListener("playbackStatusUpdate", (status) => {
        if (status.isLoaded && radioTimeoutRef.current) { clearTimeout(radioTimeoutRef.current); radioTimeoutRef.current = null; }
        onPlaybackStatus(status);
      });
      if (track.source === "radio") {
        const capturedGen = gen;
        radioTimeoutRef.current = setTimeout(() => {
          radioTimeoutRef.current = null;
          if (capturedGen !== loadGenRef.current) return;
          destroyPlayer(); setIsBuffering(false); setCurrentTrack(null); setIsPlaying(false);
          Alert.alert("Stazione non raggiungibile", "Il caricamento della stazione ha impiegato troppo tempo.");
        }, RADIO_LOAD_TIMEOUT_MS);
      }
      player.play();
      try {
        player.setActiveForLockScreen(true, { title: track.title, artist: track.artist, albumTitle: track.album, artworkUrl: track.artwork }, { showSeekForward: true, showSeekBackward: true });
      } catch (err) { console.debug("[Player] setActiveForLockScreen error:", err); }
      setCurrentTrack(track); setQueueIndex(trackIndex); setSource(track.source); setIsPlaying(true); setIsBuffering(true); setPosition(0);
    } catch (err) {
      console.warn("[Player] loadAndPlay error:", err);
      Alert.alert("Riproduzione non riuscita", track.source === "radio" ? "Impossibile riprodurre questa stazione." : "Impossibile riprodurre questo brano.");
    }
  }, [onPlaybackStatus, destroyPlayer]);

  useEffect(() => { loadAndPlayRef.current = loadAndPlay; }, [loadAndPlay]);

  const toProxyUrl = useCallback((streamUrl: string): string => {
    const base = getApiUrl();
    return `${base}/api/music/radio/stream?url=${encodeURIComponent(streamUrl)}`;
  }, []);

  const actions = usePlayerActions(
    loadAndPlay, destroyPlayer, playerRef, isPlayingRef, queueRef, queueIndexRef,
    shuffleHistoryRef, userPausedRef, wasInterruptedRef, recoveryTimeoutRef, sleepTimerRef,
    loadGenRef, setQueue, setCurrentTrack, setIsPlaying, setPosition, setDuration,
    setSleepTimerEnd, setSleepTimerMinutes, setFavoriteStationIds, setIsShuffled,
    setRepeatMode, setSelectedGenre, toProxyUrl, getNextIndex, position
  );

  useEffect(() => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (!sleepTimerEnd) return;
    const ms = sleepTimerEnd - Date.now();
    if (ms <= 0) { actions.stop(); return; }
    sleepTimerRef.current = setTimeout(() => { actions.stop(); }, ms);
    return () => { if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current); };
  }, [sleepTimerEnd, actions]);

  const value: PlayerContextType = useMemo(() => ({
    isAvailable, isPlaying, currentTrack, queue, queueIndex, position, duration, isBuffering, source,
    sleepTimer, sleepTimerEnd, favoriteStationIds, selectedGenre, isShuffled, repeatMode,
    ...actions, setSelectedGenre,
  }), [
    isAvailable, isPlaying, currentTrack, queue, queueIndex, position, duration, isBuffering, source,
    sleepTimer, sleepTimerEnd, favoriteStationIds, selectedGenre, isShuffled, repeatMode,
    actions,
  ]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export { usePlayer } from "./player-context-internal";
export type { PlayerTrack, RadioStation, RepeatMode, PlayerSource } from "./player-context-types";
