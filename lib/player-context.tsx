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
  RepeatMode,
  PlayerContextType,
} from "./player-context-types";
import { usePlayerRefs } from "./use-player-refs";
import { PlayerContext } from "./player-context-internal";
import { usePlayerActions } from "./player-context.part2";

const FAVORITES_KEY = "player_favorite_stations";
const SHUFFLE_KEY = "player_shuffle";

const AUDIO_MODE_ACTIVE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  interruptionMode: "doNotMix",
} as const;

const PLAYER_UPDATE_INTERVAL_MS = 500;
const RADIO_LOAD_TIMEOUT_MS = 30_000;

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

  const onPlaybackStatus = useCallback((status: AudioStatus) => {
    if (!status.isLoaded) return;
    if (prevPlayingRef.current && !status.playing && !status.didJustFinish && !userPausedRef.current) {
      wasInterruptedRef.current = true;
      if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current);
      recoveryTimeoutRef.current = setTimeout(() => {
        recoveryTimeoutRef.current = null;
        if (playerRef.current && wasInterruptedRef.current && !isPlayingRef.current && !userPausedRef.current) {
          setAudioModeAsync(AUDIO_MODE_ACTIVE).then(() => {
            if (playerRef.current && wasInterruptedRef.current && !isPlayingRef.current && !userPausedRef.current) {
              wasInterruptedRef.current = false;
              playerRef.current.play();
            }
          }).catch((err) => console.warn("[Player] foreground recovery error:", err));
        }
      }, 5000);
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
  }, [getNextIndex, repeatModeRef, queueRef, queueIndexRef, isShuffledRef, isPlayingRef]);

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
