import { useState, useRef, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/query-client";

const SEEN_KEY = "bikerlink:seenMatchIds";
const INIT_KEY_PREFIX = "bikerlink:matchAlertInit:v1:";
const MAX_SEEN_IDS = 500;

const ALL_SOURCES = ["garage", "biker", "proposals"] as const;
type SourceKey = typeof ALL_SOURCES[number];

interface MatchItem {
  id: string | number;
  createdAt?: string | Date | null;
}

function namespacedId(source: string, id: string | number): string {
  return `${source}:${id}`;
}

function updateServerSeenTimestamp(): void {
  apiRequest("PUT", "/api/users/me/match-seen", {}).catch(() => {});
}

function isAfterBaseline(item: MatchItem, baseline: Date): boolean {
  if (!item.createdAt) return false;
  const itemTime = new Date(item.createdAt as string).getTime();
  return itemTime > baseline.getTime();
}

export function useNewMatchAlert() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const serverLastSeenAt = (user as any)?.lastSeenMatchAt as string | null | undefined;

  const [visible, setVisible] = useState(false);
  const [seenLoaded, setSeenLoaded] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedSources = useRef<Set<string>>(new Set());
  const prevUserIdRef = useRef<string | null>(null);
  const serverSyncPendingRef = useRef(false);
  const serverSyncedRef = useRef(false);

  useEffect(() => {
    if (prevUserIdRef.current === userId) return;

    seenRef.current = new Set();
    initializedSources.current = new Set();
    setVisible(false);
    setSeenLoaded(false);
    serverSyncPendingRef.current = false;
    serverSyncedRef.current = false;
    prevUserIdRef.current = userId;

    if (!userId) return;

    const seenKey = SEEN_KEY;
    const initKey = `${INIT_KEY_PREFIX}${userId}`;

    Promise.all([
      AsyncStorage.getItem(seenKey),
      AsyncStorage.getItem(initKey),
    ])
      .then(([rawSeen, rawInit]) => {
        let loadedSeen: string[] = [];
        let loadedInit: string[] = [];

        if (rawSeen) {
          try { loadedSeen = JSON.parse(rawSeen) as string[]; } catch {}
        }
        if (rawInit) {
          try { loadedInit = JSON.parse(rawInit) as string[]; } catch {}
        }

        if (loadedInit.length > 0 && loadedSeen.length === 0) {
          AsyncStorage.removeItem(initKey).catch(() => {});
          loadedInit = [];
        }

        seenRef.current = new Set(loadedSeen);
        loadedInit.forEach((s) => initializedSources.current.add(s));
        setSeenLoaded(true);
      })
      .catch(() => setSeenLoaded(true));
  }, [userId]);

  const persistSeen = useCallback(() => {
    AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current])).catch(() => {});
  }, []);

  const persistInit = useCallback(() => {
    if (!userId) return;
    AsyncStorage.setItem(
      `${INIT_KEY_PREFIX}${userId}`,
      JSON.stringify([...initializedSources.current])
    ).catch(() => {});
  }, [userId]);

  const maybeSyncToServer = useCallback(() => {
    if (serverSyncedRef.current) return;
    serverSyncedRef.current = true;
    updateServerSeenTimestamp();
  }, []);

  const addSeen = useCallback((ids: string[]) => {
    ids.forEach((id) => seenRef.current.add(id));
    if (seenRef.current.size > MAX_SEEN_IDS) {
      const trimmed = [...seenRef.current];
      seenRef.current = new Set(trimmed.slice(trimmed.length - MAX_SEEN_IDS));
    }
    persistSeen();
  }, [persistSeen]);

  const markSourceInitialized = useCallback((sourceKey: string) => {
    initializedSources.current.add(sourceKey);
    persistInit();
    const allDone = ALL_SOURCES.every((s) => initializedSources.current.has(s));
    if (allDone) {
      maybeSyncToServer();
    }
  }, [persistInit, maybeSyncToServer]);

  const processSource = useCallback((sourceKey: string, items: MatchItem[] | undefined) => {
    if (!seenLoaded || !items) return;
    const ids = items.map((m) => namespacedId(sourceKey, m.id));

    if (!initializedSources.current.has(sourceKey)) {
      if (serverLastSeenAt) {
        const baseline = new Date(serverLastSeenAt);
        const newItems = items.filter((m) => isAfterBaseline(m, baseline));
        const oldItems = items.filter((m) => !isAfterBaseline(m, baseline));

        const oldIds = oldItems.map((m) => namespacedId(sourceKey, m.id));
        addSeen(oldIds);

        markSourceInitialized(sourceKey);

        const newIds = newItems
          .map((m) => namespacedId(sourceKey, m.id))
          .filter((id) => !seenRef.current.has(id));
        if (newIds.length > 0) {
          addSeen(newIds);
          setVisible(true);
          maybeSyncToServer();
        }
      } else {
        addSeen(ids);
        markSourceInitialized(sourceKey);
      }
      return;
    }

    const newIds = ids.filter((id) => !seenRef.current.has(id));
    if (newIds.length > 0) {
      addSeen(newIds);
      setVisible(true);
      maybeSyncToServer();
    }
  }, [seenLoaded, serverLastSeenAt, addSeen, markSourceInitialized, maybeSyncToServer]);

  const enabled = !!userId && seenLoaded;

  const { data: garageData } = useQuery<MatchItem[]>({
    queryKey: ["/api/proposals/garage-matches"],
    refetchInterval: 30000,
    enabled,
  });

  const { data: bikerData } = useQuery<MatchItem[]>({
    queryKey: ["/api/proposals/biker-matches"],
    refetchInterval: 30000,
    enabled,
  });

  const { data: proposalData } = useQuery<MatchItem[]>({
    queryKey: ["/api/proposals/matches"],
    refetchInterval: 30000,
    enabled,
  });

  useEffect(() => {
    processSource("garage", garageData);
  }, [garageData, processSource]);

  useEffect(() => {
    processSource("biker", bikerData);
  }, [bikerData, processSource]);

  useEffect(() => {
    processSource("proposals", proposalData);
  }, [proposalData, processSource]);

  const dismiss = useCallback(() => {
    setVisible(false);
    maybeSyncToServer();
  }, [maybeSyncToServer]);

  return { visible, dismiss };
}
