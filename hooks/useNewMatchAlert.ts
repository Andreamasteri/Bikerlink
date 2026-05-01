import { useState, useRef, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

const SEEN_KEY = "bikerlink:seenMatchIds";
const INIT_KEY_PREFIX = "bikerlink:matchAlertInit:v1:";
const MAX_SEEN_IDS = 500;

function namespacedId(source: string, id: string | number): string {
  return `${source}:${id}`;
}

export function useNewMatchAlert() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [visible, setVisible] = useState(false);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedSources = useRef<Set<string>>(new Set());
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevUserIdRef.current === userId) return;

    seenRef.current = new Set();
    initializedSources.current = new Set();
    setVisible(false);
    setSeenLoaded(false);
    prevUserIdRef.current = userId;

    if (!userId) return;

    const seenKey = SEEN_KEY;
    const initKey = `${INIT_KEY_PREFIX}${userId}`;

    Promise.all([
      AsyncStorage.getItem(seenKey),
      AsyncStorage.getItem(initKey),
    ])
      .then(([rawSeen, rawInit]) => {
        if (rawSeen) {
          try {
            const parsed: string[] = JSON.parse(rawSeen);
            const capped = parsed.length > MAX_SEEN_IDS
              ? parsed.slice(parsed.length - MAX_SEEN_IDS)
              : parsed;
            seenRef.current = new Set(capped);
          } catch {}
        }
        if (rawInit) {
          try {
            const sources: string[] = JSON.parse(rawInit);
            sources.forEach((s) => initializedSources.current.add(s));
          } catch {}
        }
        setSeenLoaded(true);
      })
      .catch(() => setSeenLoaded(true));
  }, [userId]);

  const addSeen = (ids: string[]) => {
    ids.forEach((id) => seenRef.current.add(id));
    if (seenRef.current.size > MAX_SEEN_IDS) {
      const trimmed = [...seenRef.current];
      seenRef.current = new Set(trimmed.slice(trimmed.length - MAX_SEEN_IDS));
    }
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current])).catch(() => {});
  };

  const markSourceInitialized = (sourceKey: string) => {
    initializedSources.current.add(sourceKey);
    if (userId) {
      AsyncStorage.setItem(
        `${INIT_KEY_PREFIX}${userId}`,
        JSON.stringify([...initializedSources.current])
      ).catch(() => {});
    }
  };

  const processSource = (sourceKey: string, items: Array<{ id: string | number }> | undefined) => {
    if (!seenLoaded || !items) return;
    const ids = items.map((m) => namespacedId(sourceKey, m.id));
    if (!initializedSources.current.has(sourceKey)) {
      addSeen(ids);
      markSourceInitialized(sourceKey);
      return;
    }
    const newIds = ids.filter((id) => !seenRef.current.has(id));
    if (newIds.length > 0) {
      addSeen(newIds);
      setVisible(true);
    }
  };

  const enabled = !!userId && Platform.OS !== "web" && seenLoaded;

  const { data: garageData } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/proposals/garage-matches"],
    refetchInterval: 30000,
    enabled,
  });

  const { data: bikerData } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/proposals/biker-matches"],
    refetchInterval: 30000,
    enabled,
  });

  const { data: proposalData } = useQuery<Array<{ id: string | number }>>({
    queryKey: ["/api/proposals/matches"],
    refetchInterval: 30000,
    enabled,
  });

  useEffect(() => {
    processSource("garage", garageData);
  }, [garageData, seenLoaded]);

  useEffect(() => {
    processSource("biker", bikerData);
  }, [bikerData, seenLoaded]);

  useEffect(() => {
    processSource("proposals", proposalData);
  }, [proposalData, seenLoaded]);

  return { visible, dismiss: () => setVisible(false) };
}
