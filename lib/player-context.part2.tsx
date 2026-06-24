/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAudioModeAsync } from "expo-audio";
import {
  PlayerTrack,
  RadioStation,
  RepeatMode,
} from "./player-context-types";

// Import standard constants that were in player-context.tsx
const FAVORITES_KEY = "player_favorite_stations";
const SHUFFLE_KEY = "player_shuffle";
const SLEEP_KEY = "player_sleep_timer";
const AUDIO_MODE_INACTIVE = {
  allowsRecording: false,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  interruptionMode: "duckOthers",
} as const;

export const usePlayerActions = (
  loadAndPlay: (track: PlayerTrack, trackIndex: number) => Promise<void>,
  destroyPlayer: () => void,
  playerRef: React.MutableRefObject<any>,
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
  const play = React.useCallback(() => {
    userPausedRef.current = false;
    wasInterruptedRef.current = false;
    if (recoveryTimeoutRef.current) { clearTimeout(recoveryTimeoutRef.current); recoveryTimeoutRef.current = null; }
    try { playerRef.current?.play(); } catch (err) { console.warn("[Player] play error:", err); }
  }, [playerRef, recoveryTimeoutRef, userPausedRef, wasInterruptedRef]);

  const pause = React.useCallback(() => {
    userPausedRef.current = true;
    try { playerRef.current?.pause(); } catch (err) { console.warn("[Player] pause error:", err); }
  }, [playerRef, userPausedRef]);

  const togglePlay = React.useCallback(() => {
    if (isPlayingRef.current) pause(); else play();
  }, [play, pause, isPlayingRef]);

  const stop = React.useCallback(() => {
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

  const playTrack = React.useCallback(async (track: PlayerTrack) => {
    setQueue([track]);
    await loadAndPlay(track, 0);
  }, [loadAndPlay, setQueue]);

  const playQueue = React.useCallback(async (tracks: PlayerTrack[], startIndex = 0) => {
    if (tracks.length === 0) return;
    shuffleHistoryRef.current = new Set();
    setQueue(tracks);
    await loadAndPlay(tracks[startIndex], startIndex);
  }, [loadAndPlay, setQueue, shuffleHistoryRef]);

  const playRadioStation = React.useCallback(async (station: RadioStation, genreId?: string) => {
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

  const next = React.useCallback(async () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    if (q.length <= 1) return;
    const nextIdx = getNextIndex(q, idx);
    await loadAndPlay(q[nextIdx], nextIdx);
  }, [loadAndPlay, getNextIndex, queueRef, queueIndexRef]);

  const prev = React.useCallback(async () => {
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

  const seekTo = React.useCallback(async (pos: number) => {
    try { await playerRef.current?.seekTo(pos); } catch (err) { console.warn("[Player] seekTo error:", err); }
  }, [playerRef]);

  const setSleepTimer = React.useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null) {
      setSleepTimerEnd(null);
    } else {
      setSleepTimerEnd(Date.now() + minutes * 60 * 1000);
    }
    AsyncStorage.setItem(SLEEP_KEY, JSON.stringify(minutes)).catch((err) => { console.warn("[Player] sleep timer persist error:", err); });
  }, [setSleepTimerEnd, setSleepTimerMinutes]);

  const toggleFavorite = React.useCallback((stationId: string) => {
    setFavoriteStationIds((prev) => {
      const next = prev.includes(stationId)
        ? prev.filter((id) => id !== stationId)
        : [...prev, stationId];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next)).catch((err) => { console.warn("[Player] favorites persist error:", err); });
      return next;
    });
  }, [setFavoriteStationIds]);

  const toggleShuffle = React.useCallback(() => {
    setIsShuffled((v) => {
      const next = !v;
      shuffleHistoryRef.current = new Set();
      AsyncStorage.setItem(SHUFFLE_KEY, JSON.stringify(next)).catch((err) => {
        console.warn("[Player] shuffle persist error:", err);
      });
      return next;
    });
  }, [setIsShuffled, shuffleHistoryRef]);

  const toggleRepeat = React.useCallback(() => {
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
