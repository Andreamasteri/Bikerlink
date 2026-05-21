import { useRef, useEffect } from "react";
import type { PlayerTrack, RepeatMode } from "./player-context-types";

export function usePlayerRefs(
  queue: PlayerTrack[],
  queueIndex: number,
  repeatMode: RepeatMode,
  isPlaying: boolean,
  isShuffled: boolean
) {
  const queueRef = useRef<PlayerTrack[]>(queue);
  const queueIndexRef = useRef(queueIndex);
  const repeatModeRef = useRef<RepeatMode>(repeatMode);
  const isPlayingRef = useRef(isPlaying);
  const isShuffledRef = useRef(isShuffled);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isShuffledRef.current = isShuffled; }, [isShuffled]);

  return {
    queueRef,
    queueIndexRef,
    repeatModeRef,
    isPlayingRef,
    isShuffledRef,
  };
}
